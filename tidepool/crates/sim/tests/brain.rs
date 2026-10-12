// Tests run native only, so a banned float method is safe here. 3.14 is "facing away", near enough.
#![allow(clippy::disallowed_methods, clippy::approx_constant)]

use tidepool_sim::brain::{
    self, Brains, IN_CONST, IN_SEE_FOOD_L, IN_SEE_FOOD_R, N_IN, OUT_THRUST, OUT_TURN,
};
use tidepool_sim::genome::{BrainGenome, ConnGene, Genome, KIND_CHEMO};
use tidepool_sim::math::act;
use tidepool_sim::params::{id, Params};
use tidepool_sim::rng::Rng;
use tidepool_sim::world::{SpawnAt, World};

fn conn(src: u16, dst: u16, weight: f32) -> ConnGene {
    ConnGene {
        src,
        dst,
        weight,
        history: 0,
    }
}

/// The neurons of `tiny`.
const THRUST: u16 = N_IN as u16;
const TURN: u16 = THRUST + 1;

/// No hidden neurons: the outputs follow the inputs.
fn tiny(conns: Vec<ConnGene>, alpha: f32) -> BrainGenome {
    BrainGenome {
        n_hidden: 0,
        bias: vec![0.1, -0.2],
        alpha: vec![alpha, alpha],
        conns,
    }
}

#[test]
fn one_step_matches_hand_arithmetic() {
    let mut b = Brains::new(4);
    b.express(
        2,
        &tiny(
            vec![
                conn(0, THRUST, 0.5),
                conn(1, THRUST, -1.0),
                conn(1, TURN, 2.0),
            ],
            1.0,
        ),
    );
    let i = b.inputs_mut(2);
    (i[0], i[1]) = (1.0, 0.25);
    b.step_one(2);
    assert!((b.output(2, OUT_THRUST) - act(0.1 + 0.5 - 0.25)).abs() < 1e-6);
    assert!((b.output(2, OUT_TURN) - act(-0.2 + 0.5)).abs() < 1e-6);
}

#[test]
fn connection_order_in_the_genome_does_not_matter() {
    let (mut a, mut b) = (Brains::new(1), Brains::new(1));
    a.express(
        0,
        &tiny(
            vec![
                conn(0, THRUST, 0.5),
                conn(1, TURN, 2.0),
                conn(1, THRUST, -1.0),
            ],
            1.0,
        ),
    );
    b.express(
        0,
        &tiny(
            vec![
                conn(1, TURN, 2.0),
                conn(1, THRUST, -1.0),
                conn(0, THRUST, 0.5),
            ],
            1.0,
        ),
    );
    for br in [&mut a, &mut b] {
        let i = br.inputs_mut(0);
        (i[0], i[1]) = (1.0, 0.25);
        br.step_one(0);
    }
    assert_eq!(a.output(0, OUT_THRUST), b.output(0, OUT_THRUST));
    assert_eq!(a.output(0, OUT_TURN), b.output(0, OUT_TURN));
}

#[test]
fn a_slow_neuron_remembers() {
    let after_input_removed = |alpha: f32| {
        let mut b = Brains::new(1);
        b.express(0, &tiny(vec![conn(0, THRUST, 3.0)], alpha));
        b.inputs_mut(0)[0] = 1.0;
        for _ in 0..50 {
            b.step_one(0);
        }
        b.inputs_mut(0)[0] = 0.0;
        for _ in 0..5 {
            b.step_one(0);
        }
        b.output(0, OUT_THRUST)
    };
    assert!(after_input_removed(0.1) > after_input_removed(1.0) + 0.3);
}

#[test]
fn a_neuron_reads_last_steps_values() {
    // thrust feeds turn. After one step, turn has seen thrust's OLD value (0), not its new one.
    let mut b = Brains::new(1);
    let mut g = tiny(vec![conn(0, THRUST, 3.0), conn(THRUST, TURN, 3.0)], 1.0);
    g.bias = vec![0.0, 0.0];
    b.express(0, &g);
    b.inputs_mut(0)[IN_CONST] = 1.0;
    b.step_one(0);
    assert!(b.output(0, OUT_THRUST) > 0.9);
    assert_eq!(b.output(0, OUT_TURN), 0.0);
    b.step_one(0);
    assert!(b.output(0, OUT_TURN) > 0.9);
}

#[test]
fn the_starter_brain_has_the_documented_shape() {
    // The brain of a founder with no eye.
    let mut p = Params::new();
    p.set(id::FOUNDER_EYE, 0.0);
    let g = brain::starter(&mut Rng::new(1), &p);
    assert_eq!(
        (g.n_hidden, g.conns.len(), g.bias.len(), g.alpha.len()),
        (4, 39, 6, 6)
    );
    let ids: Vec<u32> = g.conns.iter().map(|c| c.history).collect();
    assert_eq!(ids, (1..=39).collect::<Vec<u32>>());
    assert!(g
        .conns
        .iter()
        .all(|c| (c.src as usize) < N_IN + 4 && c.dst >= N_IN as u16));
    let h = brain::starter(&mut Rng::new(2), &p);
    assert_eq!(h.conns[10].history, g.conns[10].history); // founders share ids
    assert_ne!(h.conns[10].weight, g.conns[10].weight);
}

#[test]
fn the_starter_brain_of_a_founder_with_an_eye_adds_the_eye_wires() {
    let mut p = Params::new();
    p.set(id::FOUNDER_EYE, 0.0);
    let plain = brain::starter(&mut Rng::new(1), &p);
    p.set(id::FOUNDER_EYE, 0.2);
    let g = brain::starter(&mut Rng::new(1), &p);
    let ids: Vec<u32> = g.conns.iter().map(|c| c.history).collect();
    assert_eq!(ids, (1..=brain::STARTER_CONNS).collect::<Vec<u32>>());
    // The eye moves no draw of the brain with none.
    let weights = |g: &BrainGenome| g.conns.iter().map(|c| c.weight).collect::<Vec<_>>();
    assert_eq!(weights(&g)[..39], weights(&plain)[..]);
    assert_eq!(g.bias, plain.bias);
    // 40 to 55: each eye input to each hidden neuron, with a weight that is not 0.
    let hidden = N_IN..N_IN + 4;
    assert!(g.conns[39..55].iter().all(|c| {
        (IN_SEE_FOOD_L..N_IN).contains(&(c.src as usize))
            && hidden.contains(&(c.dst as usize))
            && c.weight != 0.0
    }));
    // 56 and 57: a plant seen on one side turns the body to that side.
    let (turn, look) = (hidden.end + OUT_TURN, p.get(id::STARTER_LOOK));
    let wire = |c: &ConnGene| (c.src as usize, c.dst as usize, c.weight);
    assert_eq!(wire(&g.conns[55]), (IN_SEE_FOOD_R, turn, look));
    assert_eq!(wire(&g.conns[56]), (IN_SEE_FOOD_L, turn, -look));
}

/// A patch of plants at (1000, 500). A creature starts 300 units away, facing away.
fn seeker(seed: u32, chemo: f32) -> f32 {
    let mut w = World::new(seed, 1536.0, 1024.0);
    for k in [
        id::PLANT_GROWTH,
        id::PLANT_SEED_CHANCE,
        id::PLANT_DEATH_RESERVE,
        id::BASAL,
        id::PART_UPKEEP,
        id::NEURON_UPKEEP,
        id::CONN_UPKEEP,
        id::MOVE_COST,
        id::INTAKE_RATE,
    ] {
        w.params.set(k, 0.0);
    }
    for k in 0..20 {
        let s = w.plants.slots.alloc().expect("plant slot") as usize;
        let (dx, dy) = ((k % 5) as f32 * 6.0 - 12.0, (k / 5) as f32 * 6.0 - 9.0);
        (
            w.plants.x[s],
            w.plants.y[s],
            w.plants.reserve[s],
            w.plants.cap[s],
        ) = (1000.0 + dx, 500.0 + dy, 20.0, 20.0);
    }
    w.plants.dirty = true;
    w.run(800); // let the scent spread before the creature exists
    let mut g = Genome::founder(&mut Rng::new(seed as u64), &w.params);
    g.set_size(KIND_CHEMO, chemo);
    let at = SpawnAt {
        x: 700.0,
        y: 500.0,
        heading: 3.14,
        growth: 1.0,
        energy01: 1.0,
        parent: 0,
        generation: 0,
        mark: 0,
    };
    let c = w.spawn(g, at).expect("slot") as usize;
    w.creatures.bud_cooldown[c] = 1_000_000;
    w.run(1200);
    ((w.creatures.x[c] - 1000.0).powi(2) + (w.creatures.y[c] - 500.0).powi(2)).sqrt()
}

#[test]
fn a_founder_follows_scent_to_food_and_a_noseless_one_does_not() {
    let mut wins = 0;
    for seed in 1..=5 {
        let (with_nose, without) = (seeker(seed, 0.6), seeker(seed, 0.0));
        assert!(
            with_nose < 80.0,
            "seed {seed}: ended {with_nose} from the patch"
        );
        if with_nose < without {
            wins += 1;
        }
    }
    assert!(wins >= 4, "nose beat no nose on only {wins} of 5 seeds");
}

#[test]
fn creatures_think_on_alternate_ticks() {
    let mut w = World::new(1, 1536.0, 1024.0);
    w.seed_founders(2, 1200);
    w.run(100);
    let t0 = (w.creatures.cmd_turn[0], w.creatures.cmd_turn[1]);
    w.tick();
    let t1 = (w.creatures.cmd_turn[0], w.creatures.cmd_turn[1]);
    w.tick();
    let t2 = (w.creatures.cmd_turn[0], w.creatures.cmd_turn[1]);
    // exactly one of the two slots thinks on each tick
    assert!((t0.0 != t1.0) != (t0.1 != t1.1));
    assert!((t1.0 != t2.0) != (t1.1 != t2.1));
    assert!((t0.0 != t1.0) != (t1.0 != t2.0));
}
