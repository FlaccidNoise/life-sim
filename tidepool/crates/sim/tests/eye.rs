// Tests run native only, so a banned float method is safe here.
#![allow(clippy::disallowed_methods)]

use std::f32::consts::PI;
use tidepool_sim::brain::{self, EYE_BODY_A, EYE_BODY_B, EYE_FOOD_A, EYE_FOOD_B};
use tidepool_sim::creature::MAX_EYES;
use tidepool_sim::eye::{self, EYE_REACH};
use tidepool_sim::genome::{
    Genome, Node, PartGene, BODY, FOUNDER_EYE_ANCHOR, FOUNDER_EYE_EXTRA, KIND_EYE,
};
use tidepool_sim::math::sin_cos;
use tidepool_sim::params::id;
use tidepool_sim::pool::Slots;
use tidepool_sim::rng::Rng;
use tidepool_sim::world::{SpawnAt, World};

/// Where the viewer is. It faces along +x.
const AT: (f32, f32) = (700.0, 500.0);
/// The middle of the founder's cone on the side of positive angles.
const SIDE: f32 = FOUNDER_EYE_ANCHOR * PI;
/// The range of the founder's eye on the reference body: `eye_range * size * length`.
const RANGE: f32 = 16.0 * 0.2 * 12.0;
/// The history id of the eye gene of `eyed`. It owns the ports of that eye.
const EYE: u32 = 900;

/// A world where nothing grows, eats, pays upkeep, or leaves scent. Only eyes can find food. Every
/// body thinks and scans on every tick.
fn world(seed: u32) -> World {
    let mut w = World::new(seed, 1536.0, 1024.0);
    for k in [
        id::PLANT_GROWTH,
        id::PLANT_SEED_CHANCE,
        id::PLANT_DEATH_RESERVE,
        id::BASAL,
        id::NEURON_UPKEEP,
        id::CONN_UPKEEP,
        id::MOVE_COST,
        id::INTAKE_RATE,
        id::SCENT_DEPOSIT,
    ] {
        w.params.set(k, 0.0);
    }
    w.params.set(id::THINK_EVERY, 1.0);
    w.params.set(id::SEE_EVERY, 1.0);
    w
}

fn eye_gene(history: u32, anchor: f32, size: f32) -> PartGene {
    PartGene {
        kind: KIND_EYE,
        anchor,
        size,
        extra: FOUNDER_EYE_EXTRA,
        history,
    }
}

/// The reference body with one eye gene and the smallest brain, so it stays where it is put.
fn eyed(anchor: f32, size: f32) -> Genome {
    let mut g = Genome::default();
    g.parts.push(eye_gene(EYE, anchor, size));
    g
}

/// The inputs that the eyes of a genome declare, in block order.
fn eye_ports(g: &Genome) -> Vec<Node> {
    let inputs = brain::ports(g).inputs;
    inputs.into_iter().filter(|n| n.owner != BODY).collect()
}

/// The reference body with the founder's eye.
fn founder_eyed() -> Genome {
    eyed(FOUNDER_EYE_ANCHOR, 0.2)
}

/// The point `d` units from the viewer, `angle` radians from its heading.
fn off(d: f32, angle: f32) -> (f32, f32) {
    (AT.0 + d * angle.cos(), AT.1 + d * angle.sin())
}

fn plant(w: &mut World, (x, y): (f32, f32)) {
    let s = w.plants.slots.alloc().expect("plant slot") as usize;
    let p = &mut w.plants;
    (p.x[s], p.y[s], p.reserve[s], p.cap[s]) = (x, y, 20.0, 20.0);
    p.dirty = true;
}

/// A full-grown body with heading 0 that never buds.
fn body(w: &mut World, g: Genome, (x, y): (f32, f32)) -> usize {
    let at = SpawnAt {
        x,
        y,
        heading: 0.0,
        growth: 1.0,
        energy01: 1.0,
        parent: 0,
        generation: 0,
        mark: 0,
    };
    let s = w.spawn(g, at).expect("slot") as usize;
    w.creatures.bud_cooldown[s] = 1_000_000;
    s
}

/// The inputs of the first eye gene of the body, which is a pair, each found by its name: food
/// left, food right, body left, body right. The B cone is on the left and the A cone on the right.
fn eye_inputs(w: &mut World, s: usize) -> [f32; 4] {
    let g = &w.genomes[s];
    let eye = g.parts.iter().find(|part| part.kind == KIND_EYE);
    let owner = eye.expect("the body has an eye gene").history;
    let inputs = brain::ports(g).inputs;
    [EYE_FOOD_B, EYE_FOOD_A, EYE_BODY_B, EYE_BODY_A].map(|port| {
        let at = inputs.iter().position(|n| *n == Node { owner, port });
        w.brains.inputs_mut(s)[at.expect("the eye declares the input")]
    })
}

/// Every eye input of the body, in block order: two for each cone, its plant and then its body.
fn cone_inputs(w: &mut World, s: usize) -> Vec<f32> {
    let inputs = brain::ports(&w.genomes[s]).inputs;
    let first = inputs.iter().position(|n| n.owner != BODY);
    first.map_or(Vec::new(), |at| w.brains.inputs_mut(s)[at..].to_vec())
}

/// The eye inputs of the body after one tick.
fn seen(w: &mut World, s: usize) -> [f32; 4] {
    w.tick();
    eye_inputs(w, s)
}

/// What a viewer with this genome sees of plants at these places.
fn sees_plants(g: Genome, places: &[(f32, f32)]) -> [f32; 4] {
    let mut w = world(1);
    for &place in places {
        plant(&mut w, place);
    }
    let s = body(&mut w, g, AT);
    seen(&mut w, s)
}

#[test]
fn a_plant_on_the_right_lights_the_a_cone_of_a_paired_eye_only() {
    let [l, r, body_l, body_r] = sees_plants(founder_eyed(), &[off(20.0, SIDE)]);
    assert!(r > 0.3 && l == 0.0, "left {l}, right {r}");
    assert_eq!([body_l, body_r], [0.0, 0.0]);
    let [l, r, ..] = sees_plants(founder_eyed(), &[off(20.0, -SIDE)]);
    assert!(l > 0.3 && r == 0.0, "left {l}, right {r}");
}

#[test]
fn nearness_falls_with_distance_and_is_zero_past_the_range() {
    let near = |ds: &[f32]| {
        let places: Vec<(f32, f32)> = ds.iter().map(|&d| off(d, SIDE)).collect();
        sees_plants(founder_eyed(), &places)[1]
    };
    for d in [10.0, 30.0] {
        let want = 1.0 - d / RANGE;
        assert!((near(&[d]) - want).abs() < 1e-3, "at {d}: {}", near(&[d]));
    }
    assert!(near(&[10.0]) > near(&[30.0]) && near(&[30.0]) > 0.0);
    assert_eq!(near(&[45.0]), 0.0);
    // The input is the nearest plant of the cone, whatever the order of the plants.
    assert_eq!(near(&[30.0, 10.0, 45.0]), near(&[10.0]));
}

#[test]
fn nothing_behind_the_body_is_seen() {
    let view = |angle: f32| {
        let mut w = world(1);
        plant(&mut w, off(20.0, angle));
        body(&mut w, Genome::default(), off(25.0, angle));
        let s = body(&mut w, founder_eyed(), AT);
        seen(&mut w, s)
    };
    // The same plant and body in front of the viewer are seen.
    let [_, food, _, other] = view(SIDE);
    assert!(food > 0.3 && other > 0.3, "plant {food}, body {other}");
    for angle in [PI, 0.7 * PI, -0.7 * PI] {
        assert_eq!(view(angle), [0.0; 4], "at {angle}");
    }
}

#[test]
fn a_midline_eye_declares_two_inputs() {
    let a_ports = [EYE_FOOD_A, EYE_BODY_A].map(|port| Node { owner: EYE, port });
    // An eye on the nose looks ahead. An eye on the tail looks back, and it is on the midline too.
    for (anchor, angle) in [(0.0, 0.0), (1.0, PI)] {
        let g = eyed(anchor, 0.2);
        assert_eq!(eye_ports(&g), a_ports, "anchor {anchor}");
        let mut w = world(1);
        plant(&mut w, off(20.0, angle));
        let s = body(&mut w, g.clone(), AT);
        w.tick();
        let seen = cone_inputs(&mut w, s);
        assert!(
            seen.len() == 2 && seen[0] > 0.3 && seen[1] == 0.0,
            "{seen:?}"
        );
        // Another body in the cone lights the second input.
        let mut w = world(1);
        let s = body(&mut w, g, AT);
        body(&mut w, Genome::default(), off(20.0, angle));
        w.tick();
        let seen = cone_inputs(&mut w, s);
        assert!(
            seen.len() == 2 && seen[0] == 0.0 && seen[1] > 0.3,
            "{seen:?}"
        );
    }
    // `Creatures::express` holds an anchor in 0 to 1 and counts one that is not finite as 0. Each
    // of these is on the midline there, so each declares the inputs of the one cone that it gets.
    for anchor in [f32::NAN, f32::INFINITY, f32::NEG_INFINITY, -1.0, 2.0] {
        let g = eyed(anchor, 0.2);
        assert_eq!(eye_ports(&g), a_ports, "anchor {anchor}");
        let mut w = world(1);
        let s = body(&mut w, g, AT);
        assert_eq!(w.creatures.n_eyes[s], 1, "anchor {anchor}");
        w.tick();
    }
}

#[test]
fn a_body_with_two_eye_genes_has_eight_eye_inputs_and_each_cone_feeds_its_own() {
    // Two pairs. A cone is 0.7 radians to each side of its middle, so the two cones of one side
    // overlap, and the middle of each is outside the other. In M2 both fed one input.
    let mut g = eyed(0.2, 0.2);
    g.parts.push(eye_gene(EYE + 1, 0.6, 0.2));
    let of = |owner: u32| {
        [EYE_FOOD_A, EYE_BODY_A, EYE_FOOD_B, EYE_BODY_B].map(|port| Node { owner, port })
    };
    assert_eq!(eye_ports(&g), [of(EYE), of(EYE + 1)].concat());
    // The eye inputs follow the 6 inputs of the body and the 3 of the scent.
    let inputs = brain::ports(&g).inputs;
    assert_eq!((inputs.len(), inputs[9]), (17, of(EYE)[0]));

    // Cone `k` feeds input `2 * k` with its plant and input `2 * k + 1` with its body.
    let middles = [0.2 * PI, -0.2 * PI, 0.6 * PI, -0.6 * PI];
    for (k, angle) in middles.into_iter().enumerate() {
        for other_body in [false, true] {
            let mut w = world(1);
            let s = body(&mut w, g.clone(), AT);
            if other_body {
                body(&mut w, Genome::default(), off(20.0, angle));
            } else {
                plant(&mut w, off(20.0, angle));
            }
            w.tick();
            assert_eq!(w.brains.in_eye[s], 9);
            let seen = cone_inputs(&mut w, s);
            assert_eq!(seen.len(), 8);
            let lit = 2 * k + other_body as usize;
            for (i, v) in seen.iter().enumerate() {
                assert_eq!(*v > 0.3, i == lit, "cone {k}, input {i}: {seen:?}");
                assert!(*v == 0.0 || i == lit, "cone {k}, input {i}: {seen:?}");
            }
        }
    }
}

#[test]
fn an_eye_gene_past_max_eyes_declares_nothing() {
    // Five pairs are 10 cones. `express` makes 8, so the fifth gene has no cone and no port.
    let mut g = Genome::default();
    for k in 0..5 {
        g.parts.push(eye_gene(EYE + k, 0.1 + 0.15 * k as f32, 0.2));
    }
    let ports = eye_ports(&g);
    assert_eq!(ports.len(), 2 * MAX_EYES);
    assert!(ports.iter().all(|n| (EYE..EYE + 4).contains(&n.owner)));

    // Three pairs, a midline eye, and two more pairs. The A cone of the fifth gene is the eighth
    // cone and keeps its ports. Its mirror is not made and declares none, and so does the sixth.
    let mut g = Genome::default();
    for (k, anchor) in [0.1, 0.3, 0.5, 0.0, 0.7, 0.9].into_iter().enumerate() {
        g.parts.push(eye_gene(EYE + k as u32, anchor, 0.2));
    }
    let ports = eye_ports(&g);
    assert_eq!(ports.len(), 2 * MAX_EYES);
    let last = [
        (EYE + 3, EYE_FOOD_A),
        (EYE + 3, EYE_BODY_A),
        (EYE + 4, EYE_FOOD_A),
        (EYE + 4, EYE_BODY_A),
    ];
    assert_eq!(ports[12..], last.map(|(owner, port)| Node { owner, port }));

    // In a world the body has one pair of inputs for each cone, and the last cone feeds the last
    // pair. The plant is in that cone alone.
    let mut w = world(1);
    plant(&mut w, off(20.0, 0.7 * PI + 0.5));
    let s = body(&mut w, g, AT);
    w.tick();
    assert_eq!(w.creatures.n_eyes[s] as usize, MAX_EYES);
    let seen = cone_inputs(&mut w, s);
    assert_eq!(seen.len(), 2 * MAX_EYES);
    for (i, v) in seen.iter().enumerate() {
        assert_eq!(*v > 0.3, i == 14, "input {i}: {seen:?}");
        assert!(*v == 0.0 || i == 14, "input {i}: {seen:?}");
    }
}

#[test]
fn another_body_lights_the_body_input_and_the_viewer_does_not_see_itself() {
    let mut w = world(1);
    let s = body(&mut w, founder_eyed(), AT);
    assert_eq!(seen(&mut w, s), [0.0; 4]);
    body(&mut w, Genome::default(), off(20.0, SIDE));
    let [food_l, food_r, l, r] = seen(&mut w, s);
    assert!(r > 0.3 && l == 0.0, "left {l}, right {r}");
    assert_eq!([food_l, food_r], [0.0, 0.0]);
}

#[test]
fn a_larger_eye_and_a_longer_body_both_see_farther() {
    let far = [off(45.0, SIDE)];
    assert_eq!(sees_plants(founder_eyed(), &far)[1], 0.0);
    assert!(sees_plants(eyed(FOUNDER_EYE_ANCHOR, 0.3), &far)[1] > 0.0);
    let mut long = founder_eyed();
    long.len = 18.0;
    assert!(sees_plants(long, &far)[1] > 0.0);
}

/// A body with the founder's eye at half of its growth. Its cone is half as long as the adult's:
/// 19.2 units, where the adult sees 38.4.
#[test]
fn a_juvenile_sees_as_far_as_its_body_has_grown() {
    let view = |d: f32| {
        let mut w = world(1);
        plant(&mut w, off(d, SIDE));
        let s = body(&mut w, founder_eyed(), AT);
        w.creatures.growth[s] = 0.5;
        let range = w.creatures.cone_range(s, 0, w.params.get(id::EYE_RANGE));
        assert!((range - RANGE / 2.0).abs() < 1e-4, "range {range}");
        seen(&mut w, s)[1]
    };
    // Half way out of the juvenile's cone. The adult's cone would read 0.75 here.
    assert!((view(9.6) - 0.5).abs() < 1e-3, "at 9.6: {}", view(9.6));
    // Inside the adult's cone and outside the juvenile's.
    assert_eq!(view(25.0), 0.0);
}

#[test]
fn no_cone_is_longer_than_eye_reach() {
    // `eye_range * size * length` is 384 for this body.
    let mut g = eyed(FOUNDER_EYE_ANCHOR, 1.0);
    g.len = 24.0;
    assert_eq!(sees_plants(g.clone(), &[off(70.0, SIDE)])[1], 0.0);
    let near = sees_plants(g, &[off(60.0, SIDE)])[1];
    assert!((near - (1.0 - 60.0 / EYE_REACH)).abs() < 1e-3, "{near}");
}

#[test]
fn eye_gain_0_blinds_every_eye() {
    let seen_at = |gain: f32| {
        let mut w = world(1);
        w.params.set(id::EYE_GAIN, gain);
        plant(&mut w, off(20.0, SIDE));
        body(&mut w, Genome::default(), off(20.0, -SIDE));
        let s = body(&mut w, founder_eyed(), AT);
        seen(&mut w, s)
    };
    let [food_l, food_r, body_l, body_r] = seen_at(1.0);
    assert!(food_r > 0.3 && body_l > 0.3 && food_l == 0.0 && body_r == 0.0);
    assert_eq!(seen_at(0.0), [0.0; 4]);
    // An input is held in 0 to 1.
    assert_eq!(seen_at(10.0), [0.0, 1.0, 1.0, 0.0]);
}

#[test]
fn the_eyes_scan_on_one_think_in_see_every_and_hold_their_inputs_between() {
    let mut w = world(1);
    w.params.set(id::SEE_EVERY, 2.0);
    plant(&mut w, off(20.0, SIDE));
    // The body in slot 0 scans on the even ticks.
    let s = body(&mut w, founder_eyed(), AT);
    let lit = seen(&mut w, s)[1];
    assert!(lit > 0.3, "{lit}");
    // The plant goes out of sight. The think of tick 1 does not scan, so the input holds.
    (w.plants.x[0], w.plants.dirty) = (AT.0 - 100.0, true);
    assert_eq!(seen(&mut w, s)[1], lit);
    assert_eq!(seen(&mut w, s)[1], 0.0);
}

/// A founder swims for 300 ticks past one plant, 30 units away and off to one side. Gives the
/// closest that it came to the plant. It thinks on one tick in two and scans on one think in two.
fn closest(seed: u32, founder_eye: f32) -> f32 {
    let mut w = world(seed);
    w.params.set(id::THINK_EVERY, 2.0);
    w.params.set(id::SEE_EVERY, 2.0);
    w.params.set(id::FOUNDER_EYE, founder_eye);
    let food = off(30.0, 0.3 * PI);
    plant(&mut w, food);
    let g = Genome::founder(&mut Rng::new(seed as u64), &w.params);
    let s = body(&mut w, g, AT);
    let mut closest = f32::INFINITY;
    for _ in 0..300 {
        w.tick();
        let (dx, dy) = (w.creatures.x[s] - food.0, w.creatures.y[s] - food.1);
        closest = closest.min((dx * dx + dy * dy).sqrt());
    }
    closest
}

#[test]
fn a_founder_still_swims_to_a_plant_it_can_see() {
    let mut wins = 0;
    for seed in 1..=5 {
        let (with_eyes, without) = (closest(seed, 0.2), closest(seed, 0.0));
        assert!(
            with_eyes < 4.0,
            "seed {seed}: came no closer than {with_eyes} to the plant"
        );
        if with_eyes < without {
            wins += 1;
        }
    }
    assert!(wins >= 4, "eyes beat no eyes on only {wins} of 5 seeds");
}

/// The eye inputs of a body, two for each cone, from a search of every plant and every body with
/// the arithmetic of `eye::see` and no grid.
fn seen_by_search(w: &World, s: usize) -> Vec<f32> {
    let (c, p) = (&w.creatures, &w.plants);
    let mut out = Vec::new();
    for eye in s * MAX_EYES..s * MAX_EYES + c.n_eyes[s] as usize {
        let (sin_dir, cos_dir) = sin_cos(c.eye_dir[eye]);
        let ax = c.hc[s] * cos_dir - c.hs[s] * sin_dir;
        let ay = c.hs[s] * cos_dir + c.hc[s] * sin_dir;
        let cos2 = c.eye_cos[eye] * c.eye_cos[eye];
        let range = (w.params.get(id::EYE_RANGE) * c.eye_size[eye] * c.length(s)).min(EYE_REACH);
        let near = |slots: &Slots, x: &[f32], y: &[f32]| {
            let mut best = range * range;
            for j in (0..slots.high_water()).filter(|&j| slots.is_alive(j)) {
                let (dx, dy) = (x[j as usize] - c.x[s], y[j as usize] - c.y[s]);
                let (d2, along) = (dx * dx + dy * dy, dx * ax + dy * ay);
                if d2 < best && along > 0.0 && along * along >= cos2 * d2 {
                    best = d2;
                }
            }
            if best < range * range {
                1.0 - (best / (range * range)).sqrt()
            } else {
                0.0
            }
        };
        out.extend([near(&p.slots, &p.x, &p.y), near(&c.slots, &c.x, &c.y)]);
    }
    out
}

#[test]
fn the_search_box_holds_every_thing_that_a_cone_holds() {
    // Bodies at random places and headings, each with one eye gene of a random place, width, and
    // size, among plants at random places. The worlds are thin, so the nearest thing in a cone
    // is often far out, where a box that is too small would lose it.
    let mut rng = Rng::new(9);
    let mut lit = 0;
    for round in 0..20 {
        let mut w = world(1);
        for _ in 0..150 {
            plant(&mut w, (rng.range(0.0, 1536.0), rng.range(0.0, 1024.0)));
            let (anchor, size, extra) = (rng.unit(), rng.unit(), rng.unit());
            let mut g = eyed(anchor, size);
            g.parts[4].extra = extra;
            let s = body(&mut w, g, (rng.range(0.0, 1536.0), rng.range(0.0, 1024.0)));
            w.creatures.heading[s] = rng.range(-PI, PI);
            (w.creatures.hs[s], w.creatures.hc[s]) = sin_cos(w.creatures.heading[s]);
        }
        w.grid
            .rebuild(&w.creatures.slots, &w.creatures.x, &w.creatures.y);
        w.plants.refresh_grid();
        for s in 0..150 {
            eye::see(&mut w, s);
            let seen = cone_inputs(&mut w, s);
            assert_eq!(seen.len(), 2 * w.creatures.n_eyes[s] as usize);
            assert_eq!(seen, seen_by_search(&w, s), "round {round}, slot {s}");
            lit += seen.iter().filter(|v| **v > 0.0).count();
        }
    }
    assert!(lit > 1000, "only {lit} of 12,000 inputs are lit");
}

#[test]
fn a_world_with_eyes_is_the_same_in_a_reload() {
    let start = || {
        let mut w = World::new(1, 1536.0, 1024.0);
        w.params.set(id::SCENT_DEPOSIT, 0.0);
        w.params.set(id::FOUNDER_EYE, 0.2);
        w.params.set(id::SEE_EVERY, 2.0);
        w.seed_founders(400, 1200);
        w
    };
    let mut unbroken = start();
    unbroken.run(600);
    let mut first = start();
    first.run(300);
    // The eyes are at work in this world: without that, the reload proves nothing about them.
    // A body that was born with no eye has no eye input.
    let live: Vec<usize> = (0..first.creatures.slots.high_water())
        .filter(|&s| first.creatures.slots.is_alive(s))
        .map(|s| s as usize)
        .collect();
    let seeing = (live.iter())
        .filter(|&&s| cone_inputs(&mut first, s).iter().any(|v| *v > 0.0))
        .count();
    assert!(seeing > 20, "only {seeing} bodies see a thing");
    let mut second = World::load(&first.save()).expect("the snapshot loads");
    second.run(300);
    assert_eq!(second.state_hash(), unbroken.state_hash());
}
