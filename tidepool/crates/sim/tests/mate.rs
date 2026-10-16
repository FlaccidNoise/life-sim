//! Mating: two full-grown bodies that touch and both accept take each other's genome as a donor,
//! and the two mate inputs read the nearest body in touch.

use tidepool_sim::brain::{IN_MATE_KIN, IN_MATE_SIZE};
use tidepool_sim::control::CAUSE_STARVED;
use tidepool_sim::genome::{Genome, PartGene, KIND_FIN};
use tidepool_sim::params::id;
use tidepool_sim::rng::Rng;
use tidepool_sim::snapshot::Writer;
use tidepool_sim::world::{SpawnAt, World};
use tidepool_sim::{mate, motor};

/// A world with the given `mix_rate` and no push, so a body stays where its test put it.
fn world(seed: u32, rate: f32) -> World {
    let mut w = World::new(seed, 1536.0, 1024.0);
    w.params.set(id::MIX_RATE, rate);
    w.params.set(id::REPEL, 0.0);
    w
}

/// An adult at half of its energy, which is too little to bud.
fn spawn(w: &mut World, genome: Genome, x: f32, y: f32) -> usize {
    let at = SpawnAt {
        x,
        y,
        heading: 0.0,
        growth: 1.0,
        energy01: 0.5,
        parent: 0,
        generation: 0,
        mark: 0,
    };
    w.spawn(genome, at).expect("slot") as usize
}

/// An adult with the founder genome of the seed, 12 long and 6 wide. Its radius is 4.5, so two of
/// them touch when their centres are less than 9 apart.
fn adult(w: &mut World, seed: u64, x: f32, y: f32) -> usize {
    let mut g = Genome::founder(&mut Rng::new(seed), &w.params);
    (g.len, g.wid) = (12.0, 0.5);
    spawn(w, g, x, y)
}

fn willing(w: &mut World, slots: &[usize]) {
    for &s in slots {
        w.creatures.cmd_accept[s] = 1.0;
    }
}

/// The contact phase of one tick: the grid, the motor, and the pairs. No brain runs, so
/// `cmd_accept` is what the test set.
fn contact(w: &mut World) {
    w.grid
        .rebuild(&w.creatures.slots, &w.creatures.x, &w.creatures.y);
    motor::step(w);
    mate::step(w);
}

/// The uid of the donor that the slot holds, or 0.
fn donor(w: &World, s: usize) -> u32 {
    w.donors[s].as_ref().map_or(0, |held| held.0)
}

fn saved(g: &Genome) -> Vec<u8> {
    let mut w = Writer::new();
    g.save(&mut w);
    w.bytes
}

/// The live slots that pass the test.
fn count(w: &World, test: impl Fn(usize) -> bool) -> usize {
    let slots = &w.creatures.slots;
    (0..slots.high_water() as usize)
        .filter(|&s| slots.is_alive(s as u32) && test(s))
        .count()
}

#[test]
fn with_mix_rate_0_nothing_is_drawn_and_no_donor_is_set() {
    // Two willing adults in touch, and the generator before the contact.
    let pair = |rate: f32| {
        let mut w = world(1, rate);
        let (a, b) = (
            adult(&mut w, 1, 500.0, 500.0),
            adult(&mut w, 2, 505.0, 500.0),
        );
        willing(&mut w, &[a, b]);
        let before = w.rng_mate.0;
        contact(&mut w);
        (w, before)
    };
    let (w, before) = pair(0.0);
    assert_eq!(w.rng_mate.0, before, "a draw at rate 0");
    assert!(w.donors.iter().all(Option::is_none));
    let c = &w.creatures;
    assert_eq!((c.mate_size[0], c.mate_kin[0]), (0.0, 0.0));
    // The same two bodies with the rule on: the test above is not empty.
    let (w, before) = pair(1.0);
    assert_ne!(w.rng_mate.0, before);
    assert!(w.donors[0].is_some());

    // A seeded world, whole ticks.
    let mut w = World::new(3, 1536.0, 1024.0);
    w.params.set(id::MIX_RATE, 0.0);
    w.seed_founders(300, 1200);
    let before = w.rng_mate.0;
    w.run(300);
    assert_eq!(w.rng_mate.0, before, "a draw at rate 0");
    assert!(w.donors.iter().all(Option::is_none));
    let c = &w.creatures;
    assert_eq!(count(&w, |s| c.mate_size[s] != 0.0), 0);
    assert_eq!(count(&w, |s| c.mate_kin[s] != 0.0), 0);
}

#[test]
fn two_adults_in_touch_that_both_accept_take_each_other_as_donor() {
    let mut w = world(1, 1.0);
    let (a, b) = (
        adult(&mut w, 1, 500.0, 500.0),
        adult(&mut w, 2, 505.0, 500.0),
    );
    // 15 from the nearer of the two: out of touch.
    let far = adult(&mut w, 3, 520.0, 500.0);
    willing(&mut w, &[a, b, far]);
    let mut rng = w.rng_mate.clone();
    contact(&mut w);
    let (ua, ub) = (w.creatures.uid[a], w.creatures.uid[b]);
    assert_eq!((donor(&w, a), donor(&w, b), donor(&w, far)), (ub, ua, 0));
    let held = |s: usize| saved(&w.donors[s].as_ref().expect("a donor").1);
    assert_eq!(held(a), saved(&w.genomes[b]));
    assert_eq!(held(b), saved(&w.genomes[a]));
    assert_ne!(held(a), held(b));
    // One pair makes one draw.
    rng.unit();
    assert_eq!(w.rng_mate.0, rng.0);

    // The chance is `mix_rate`, and the draw is the next one of `rng_mate`.
    let mut made = [0, 0];
    for seed in 1..=40 {
        let mut w = world(seed, 0.5);
        let (a, b) = (
            adult(&mut w, 1, 500.0, 500.0),
            adult(&mut w, 2, 505.0, 500.0),
        );
        willing(&mut w, &[a, b]);
        let expect = w.rng_mate.clone().unit() < 0.5;
        contact(&mut w);
        assert_eq!(
            (w.donors[a].is_some(), w.donors[b].is_some()),
            (expect, expect),
            "seed {seed}"
        );
        made[expect as usize] += 1;
    }
    assert!(
        made[0] > 5 && made[1] > 5,
        "{made:?} of 40 at a chance of 0.5"
    );
}

#[test]
fn one_refusal_stops_the_pair() {
    let mut w = world(1, 1.0);
    let (a, b) = (
        adult(&mut w, 1, 500.0, 500.0),
        adult(&mut w, 2, 505.0, 500.0),
    );
    let before = w.rng_mate.0;
    // A command of 0 is not above 0.
    for (first, second) in [
        (1.0, -1.0),
        (-1.0, 1.0),
        (1.0, 0.0),
        (0.0, 1.0),
        (-0.5, -0.5),
    ] {
        (w.creatures.cmd_accept[a], w.creatures.cmd_accept[b]) = (first, second);
        contact(&mut w);
        assert_eq!((donor(&w, a), donor(&w, b)), (0, 0), "{first} {second}");
        assert_eq!(w.rng_mate.0, before, "{first} {second}: a draw");
    }
    (w.creatures.cmd_accept[a], w.creatures.cmd_accept[b]) = (0.01, 0.01);
    contact(&mut w);
    assert!(w.donors[a].is_some() && w.donors[b].is_some());
}

#[test]
fn a_juvenile_and_a_body_with_a_donor_do_not_pair() {
    // A juvenile, in the lower slot and in the higher.
    for young in [0, 1] {
        let mut w = world(1, 1.0);
        let pair = [
            adult(&mut w, 1, 500.0, 500.0),
            adult(&mut w, 2, 505.0, 500.0),
        ];
        willing(&mut w, &pair);
        w.creatures.growth[pair[young]] = 0.99;
        let before = w.rng_mate.0;
        contact(&mut w);
        assert_eq!((donor(&w, 0), donor(&w, 1)), (0, 0), "juvenile {young}");
        assert_eq!(w.rng_mate.0, before, "juvenile {young}: a draw");
        w.creatures.growth[pair[young]] = 1.0;
        contact(&mut w);
        assert!(w.donors[0].is_some() && w.donors[1].is_some());
    }
    // A body that holds a donor, in the lower slot and in the higher. It keeps the one it holds.
    for holder in [0, 1] {
        let mut w = world(1, 1.0);
        let pair = [
            adult(&mut w, 1, 500.0, 500.0),
            adult(&mut w, 2, 505.0, 500.0),
        ];
        let third = adult(&mut w, 3, 900.0, 500.0);
        willing(&mut w, &pair);
        w.donors[pair[holder]] = Some((w.creatures.uid[third], w.genomes[third].clone()));
        let before = w.rng_mate.0;
        contact(&mut w);
        let held = [0, 1].map(|s| donor(&w, s));
        let mut want = [0, 0];
        want[holder] = w.creatures.uid[third];
        assert_eq!(held, want, "holder {holder}");
        assert_eq!(w.rng_mate.0, before, "holder {holder}: a draw");
    }
    // So a pair that exchanged does not exchange again while the two stay in touch.
    let mut w = world(1, 1.0);
    let pair = [
        adult(&mut w, 1, 500.0, 500.0),
        adult(&mut w, 2, 505.0, 500.0),
    ];
    willing(&mut w, &pair);
    contact(&mut w);
    let after_one = w.rng_mate.0;
    contact(&mut w);
    assert_eq!(w.rng_mate.0, after_one);
}

#[test]
fn a_body_is_in_one_pair_per_tick_and_the_nearest_wins() {
    // Three in a row, all in touch: slot 0, then slot 2 at 4 from it, then slot 1 at 7 from it.
    let row = |seed: u32, rate: f32| {
        let mut w = world(seed, rate);
        let a = adult(&mut w, 1, 500.0, 500.0);
        let b = adult(&mut w, 2, 507.0, 500.0);
        let c = adult(&mut w, 3, 504.0, 500.0);
        willing(&mut w, &[a, b, c]);
        w
    };
    let mut w = row(1, 1.0);
    let mut rng = w.rng_mate.clone();
    contact(&mut w);
    let uid = w.creatures.uid.clone();
    // Slot 0 takes the nearer body and not the lower slot. Slot 1 is nearest to slot 2, which is
    // in a pair already.
    assert_eq!([0, 1, 2].map(|s| donor(&w, s)), [uid[2], 0, uid[0]]);
    rng.unit();
    assert_eq!(w.rng_mate.0, rng.0, "one pair makes one draw");

    // A pair that the chance turns down is still the pair of the tick for both. In this world the
    // first draw is above the rate and the second is below it, so a second pair would exchange.
    let seed = (1..)
        .find(|&seed| {
            let mut rng = World::new(seed, 1536.0, 1024.0).rng_mate;
            rng.unit() >= 0.5 && rng.unit() < 0.5
        })
        .expect("a seed");
    let mut w = row(seed, 0.5);
    let mut rng = w.rng_mate.clone();
    contact(&mut w);
    assert_eq!([0, 1, 2].map(|s| donor(&w, s)), [0, 0, 0]);
    rng.unit();
    assert_eq!(w.rng_mate.0, rng.0, "a second pair in one tick");

    // Two bodies at one distance: the lower slot. Slot 2 is in the grid row above, so the motor
    // meets it first.
    let mut w = world(1, 1.0);
    let a = adult(&mut w, 1, 500.0, 514.0);
    let b = adult(&mut w, 2, 500.0, 518.0);
    let c = adult(&mut w, 3, 500.0, 510.0);
    willing(&mut w, &[a, b, c]);
    contact(&mut w);
    let uid = w.creatures.uid.clone();
    assert_eq!([0, 1, 2].map(|s| donor(&w, s)), [uid[1], uid[0], 0]);
}

#[test]
fn the_mate_inputs_read_the_touched_body_and_0_alone() {
    let mut w = world(1, 1.0);
    // No body swims, so the two stay in touch through whole ticks.
    for k in [id::FLAG_FORCE, id::CILIA_FORCE] {
        w.params.set(k, 0.0);
    }
    let body = |w: &mut World, len: f32, hue: f32, x: f32| {
        let mut g = Genome::founder(&mut Rng::new(1), &w.params);
        (g.len, g.wid, g.hue) = (len, 0.5, hue);
        spawn(w, g, x, 500.0)
    };
    // Areas of 72 and 200. The hues are 0.1 apart around the circle, through 0.
    let small = body(&mut w, 12.0, 0.95, 500.0);
    let large = body(&mut w, 20.0, 0.05, 506.0);
    let alone = body(&mut w, 12.0, 0.5, 900.0);
    let near = |a: f32, b: f32| (a - b).abs() < 1e-6;
    contact(&mut w);
    let c = &w.creatures;
    assert!(
        near(c.mate_size[small], 200.0 / 272.0),
        "{}",
        c.mate_size[small]
    );
    assert!(
        near(c.mate_size[large], 72.0 / 272.0),
        "{}",
        c.mate_size[large]
    );
    assert!(near(c.mate_kin[small], 0.8), "{}", c.mate_kin[small]);
    assert!(near(c.mate_kin[large], 0.8), "{}", c.mate_kin[large]);
    assert_eq!((c.mate_size[alone], c.mate_kin[alone]), (0.0, 0.0));

    // The size is the area as the body has grown: half grown, the large one has an area of 50.
    w.creatures.growth[large] = 0.5;
    contact(&mut w);
    let size = w.creatures.mate_size[small];
    assert!(near(size, 50.0 / 122.0), "{size}");
    w.creatures.growth[large] = 1.0;

    // The brain reads the two values on its next think.
    let inputs = |w: &mut World, s: usize| {
        let input = w.brains.inputs_mut(s);
        (input[IN_MATE_SIZE as usize], input[IN_MATE_KIN as usize])
    };
    w.run(3);
    for s in [small, large] {
        let stored = (w.creatures.mate_size[s], w.creatures.mate_kin[s]);
        assert!(near(stored.1, 0.8), "{}", stored.1);
        assert_eq!(inputs(&mut w, s), stored);
    }
    assert_eq!(inputs(&mut w, alone), (0.0, 0.0));

    // Out of touch, both read 0 again.
    w.creatures.x[large] = 1200.0;
    w.run(3);
    for s in [small, large] {
        assert_eq!(
            (w.creatures.mate_size[s], w.creatures.mate_kin[s]),
            (0.0, 0.0)
        );
        assert_eq!(inputs(&mut w, s), (0.0, 0.0));
    }

    // In touch again, and then the rule is switched off: the brain reads 0, as in a world that
    // never mixed.
    w.creatures.x[large] = 506.0;
    w.run(3);
    assert!(inputs(&mut w, small).0 > 0.5);
    w.params.set(id::MIX_RATE, 0.0);
    w.run(3);
    assert_eq!(inputs(&mut w, small), (0.0, 0.0));
}

#[test]
fn a_world_that_mixes_is_the_same_in_a_reload() {
    let mut unbroken = World::new(4, 1536.0, 1024.0);
    unbroken.params.set(id::MIX_RATE, 1.0);
    unbroken.seed_founders(300, 1200);
    unbroken.run(300);
    let holders = count(&unbroken, |s| unbroken.donors[s].is_some());
    assert!(holders > 0, "no body holds a donor at the save");
    let in_touch = count(&unbroken, |s| unbroken.creatures.mate_size[s] != 0.0);
    assert!(in_touch > 0, "no body is in touch at the save");

    let mut resumed = World::load(&unbroken.save()).expect("load");
    assert_eq!(resumed.state_hash(), unbroken.state_hash());
    unbroken.run(300);
    resumed.run(300);
    assert_eq!(resumed.state_hash(), unbroken.state_hash());
    let crossed = count(&unbroken, |s| unbroken.creatures.mixed_with[s] != 0);
    assert!(crossed > 0, "no child of a cross after the save");
}

#[test]
fn the_donor_of_a_dead_partner_still_gives_a_brood() {
    let mut w = world(1, 1.0);
    // A child takes every gene that only the donor holds, and loses no part.
    w.params.set(id::MIX_FOREIGN, 1.0);
    w.params.set(id::MUT_PART_REMOVE, 0.0);
    w.params.set(id::BROOD_MAX, 2.0);
    // An egg this small lets the parent pay for two.
    w.params.set(id::BIRTH_GROWTH, 0.4);
    let (a, b) = (
        adult(&mut w, 1, 500.0, 500.0),
        adult(&mut w, 2, 505.0, 500.0),
    );
    // A part that only the partner holds.
    let fin = w.next_history;
    w.next_history += 1;
    w.genomes[b].parts.push(PartGene {
        kind: KIND_FIN,
        anchor: 0.5,
        size: 0.3,
        extra: 0.0,
        history: fin,
    });
    willing(&mut w, &[a, b]);
    contact(&mut w);
    let partner = w.creatures.uid[b];
    assert_eq!(donor(&w, a), partner);

    w.kill(b as u32, CAUSE_STARVED, None);
    let cap = w.params.get(id::ENERGY_PER_MASS) * w.creatures.area(a);
    w.creatures.energy[a] = 0.95 * cap;
    w.tick();
    let c = &w.creatures;
    let brood = count(&w, |s| c.parent[s] == c.uid[a]);
    assert_eq!(brood, 2);
    let from_the_dead = count(&w, |s| {
        let has_fin = w.genomes[s].parts.iter().any(|part| part.history == fin);
        c.parent[s] == c.uid[a] && c.mixed_with[s] == partner && has_fin
    });
    assert_eq!(from_the_dead, 2);
    assert!(w.donors[a].is_none());
}
