// Tests run native only, so a banned float method is safe here. 3.14 is "facing away", near enough.
#![allow(clippy::disallowed_methods, clippy::approx_constant)]

use tidepool_sim::brain::{
    self, Brains, EYE_BODY_A, EYE_BODY_B, EYE_FOOD_A, EYE_FOOD_B, IN_AGE, IN_CONST, IN_ENERGY,
    IN_GRAD_FWD, IN_GRAD_SIDE, IN_MATE_KIN, IN_MATE_SIZE, IN_SCENT, IN_SPEED, NO_INPUT, N_BODY_IN,
    OUT_ACCEPT, OUT_THRUST, OUT_TURN,
};
use tidepool_sim::genome::{
    BrainGenome, ConnGene, Genome, Node, OutGene, FOUNDER_EYE_HISTORY, KIND_CHEMO,
};
use tidepool_sim::math::act;
use tidepool_sim::params::{id, Params};
use tidepool_sim::rng::Rng;
use tidepool_sim::world::{SpawnAt, World};

fn conn(src: Node, dst: Node, weight: f32) -> ConnGene {
    ConnGene {
        src,
        dst,
        weight,
        history: 0,
    }
}

/// The neurons of `tiny`: its first two inputs and its two outputs.
const IN_0: Node = Node::body(IN_CONST);
const IN_1: Node = Node::body(IN_ENERGY);
const THRUST: Node = Node::body(OUT_THRUST);
const TURN: Node = Node::body(OUT_TURN);

/// No hidden neurons: the outputs follow the inputs.
fn tiny(conns: Vec<ConnGene>, alpha: f32) -> Genome {
    let out = |node: Node, bias: f32| OutGene { node, bias, alpha };
    Genome {
        brain: BrainGenome {
            hidden: vec![],
            outs: vec![out(THRUST, 0.1), out(TURN, -0.2)],
            conns,
        },
        ..Genome::default()
    }
}

/// The biases of a brain in the order of its block: the hidden genes, then the outputs.
fn biases(g: &BrainGenome) -> Vec<f32> {
    let hidden = g.hidden.iter().map(|h| h.bias);
    hidden.chain(g.outs.iter().map(|o| o.bias)).collect()
}

#[test]
fn one_step_matches_hand_arithmetic() {
    let mut b = Brains::new(4);
    b.express(
        2,
        &tiny(
            vec![
                conn(IN_0, THRUST, 0.5),
                conn(IN_1, THRUST, -1.0),
                conn(IN_1, TURN, 2.0),
            ],
            1.0,
        ),
        &Params::new(),
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
                conn(IN_0, THRUST, 0.5),
                conn(IN_1, TURN, 2.0),
                conn(IN_1, THRUST, -1.0),
            ],
            1.0,
        ),
        &Params::new(),
    );
    b.express(
        0,
        &tiny(
            vec![
                conn(IN_1, TURN, 2.0),
                conn(IN_1, THRUST, -1.0),
                conn(IN_0, THRUST, 0.5),
            ],
            1.0,
        ),
        &Params::new(),
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
        b.express(
            0,
            &tiny(vec![conn(IN_0, THRUST, 3.0)], alpha),
            &Params::new(),
        );
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
    let mut g = tiny(vec![conn(IN_0, THRUST, 3.0), conn(THRUST, TURN, 3.0)], 1.0);
    for out in &mut g.brain.outs {
        out.bias = 0.0;
    }
    b.express(0, &g, &Params::new());
    b.inputs_mut(0)[IN_CONST as usize] = 1.0;
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
    // 4 hidden genes and 3 out genes: 7 biases and 7 alphas.
    assert_eq!((g.hidden.len(), g.conns.len(), g.outs.len()), (4, 42, 3));
    assert_eq!(biases(&g).len(), 7);
    // The ids 40 to 57 are those of the eye wires, which this brain does not have.
    let ids: Vec<u32> = g.conns.iter().map(|c| c.history).collect();
    assert_eq!(ids, (1..=39).chain(58..=60).collect::<Vec<u32>>());
    // Each runs from an input or a hidden neuron to a hidden neuron or an output.
    let ports = brain::ports(&Genome::default());
    let hidden: Vec<Node> = g.hidden.iter().map(|h| Node::hidden(h.id)).collect();
    assert!(g.conns.iter().all(|c| {
        (ports.inputs.contains(&c.src) || hidden.contains(&c.src))
            && (hidden.contains(&c.dst) || ports.outputs.contains(&c.dst))
    }));
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
    // The eye moves no draw of the brain with none: not the 39 before its wires, and not the 3
    // after them.
    let weights = |g: &BrainGenome| g.conns.iter().map(|c| c.weight).collect::<Vec<_>>();
    assert_eq!(weights(&g)[..39], weights(&plain)[..39]);
    assert_eq!(weights(&g)[57..], weights(&plain)[39..]);
    assert_eq!(biases(&g), biases(&plain));
    // 40 to 55: each input of the founder's eye to each hidden neuron, with a weight that is not
    // 0. The inputs are in the order of M2: food left, food right, body left, body right. The B
    // cone is on the left.
    let eye = |port: u8| Node {
        owner: FOUNDER_EYE_HISTORY,
        port,
    };
    let hidden: Vec<Node> = g.hidden.iter().map(|h| Node::hidden(h.id)).collect();
    let sources = [EYE_FOOD_B, EYE_FOOD_A, EYE_BODY_B, EYE_BODY_A];
    for (k, c) in g.conns[39..55].iter().enumerate() {
        assert_eq!((c.src, c.dst), (eye(sources[k / 4]), hidden[k % 4]), "{k}");
        assert!(c.weight != 0.0, "{k}");
    }
    // 56 and 57: a plant seen on one side turns the body to that side.
    let look = p.get(id::STARTER_LOOK);
    let wire = |c: &ConnGene| (c.src, c.dst, c.weight);
    assert_eq!(wire(&g.conns[55]), (eye(EYE_FOOD_A), TURN, look));
    assert_eq!(wire(&g.conns[56]), (eye(EYE_FOOD_B), TURN, -look));
}

#[test]
fn the_starter_brain_accepts_a_mate_by_the_last_three_connections() {
    let p = Params::new();
    assert_eq!(brain::STARTER_CONNS, 60);
    let g = brain::starter(&mut Rng::new(1), &p);
    let accept = Node::body(OUT_ACCEPT);
    assert_eq!(g.outs.last().map(|out| out.node), Some(accept));
    // 58: the constant input to `accept`, at `starter_accept`. 59 and 60: each mate input to
    // `accept`, with a small random weight. Nothing else runs into `accept`.
    let wire = |c: &ConnGene| (c.history, c.src, c.dst);
    assert_eq!(wire(&g.conns[57]), (58, Node::body(IN_CONST), accept));
    assert_eq!(wire(&g.conns[58]), (59, Node::body(IN_MATE_SIZE), accept));
    assert_eq!(wire(&g.conns[59]), (60, Node::body(IN_MATE_KIN), accept));
    assert_eq!(g.conns[57].weight, p.get(id::STARTER_ACCEPT));
    assert!(g.conns[58..].iter().all(|c| c.weight != 0.0));
    assert_eq!(g.conns.iter().filter(|c| c.dst == accept).count(), 3);
}

/// A founder alone in a world, thinking on every tick. Gives its `cmd_accept` after 4 ticks, and
/// its two mate inputs.
fn accepts(starter_accept: f32) -> (f32, [f32; 2]) {
    let mut w = World::new(1, 1536.0, 1024.0);
    w.params.set(id::THINK_EVERY, 1.0);
    w.params.set(id::STARTER_ACCEPT, starter_accept);
    let g = Genome::founder(&mut Rng::new(1), &w.params);
    let at = SpawnAt {
        x: 700.0,
        y: 500.0,
        heading: 0.0,
        growth: 1.0,
        energy01: 1.0,
        parent: 0,
        generation: 0,
        mark: 0,
    };
    let s = w.spawn(g, at).expect("slot") as usize;
    assert_eq!(w.creatures.cmd_accept[s], 0.0);
    w.run(4);
    let accept = w.creatures.cmd_accept[s];
    assert_eq!(accept, w.brains.output(s, OUT_ACCEPT));
    let inputs = w.brains.inputs_mut(s);
    let mate = [IN_MATE_SIZE, IN_MATE_KIN].map(|port| inputs[port as usize]);
    (accept, mate)
}

#[test]
fn the_accept_output_becomes_the_accept_command() {
    // No body is in touch, so both mate inputs read 0 and the constant input decides.
    let (willing, mate) = accepts(1.0);
    assert!(willing > 0.5, "{willing}");
    assert_eq!(mate, [0.0, 0.0]);
    let (unwilling, _) = accepts(-1.0);
    assert!(unwilling < -0.5, "{unwilling}");
}

#[test]
fn a_body_with_no_chemoreceptor_has_no_scent_input() {
    let body = [
        IN_CONST,
        IN_ENERGY,
        IN_AGE,
        IN_SPEED,
        IN_MATE_SIZE,
        IN_MATE_KIN,
    ];
    let scent = [IN_SCENT, IN_GRAD_FWD, IN_GRAD_SIDE];
    assert_eq!(body.len(), N_BODY_IN);
    let with = Genome::founder(&mut Rng::new(1), &Params::new());
    let mut zero = with.clone();
    zero.set_size(KIND_CHEMO, 0.0);
    let mut none = with.clone();
    none.parts.retain(|part| part.kind != KIND_CHEMO);

    // The inputs of the body come first, at the indexes that are their ports. The scent inputs
    // follow, for a body whose chemoreceptors sum to more than 0.
    let inputs = brain::ports(&with).inputs;
    assert_eq!(inputs[..N_BODY_IN], body.map(Node::body));
    assert_eq!(inputs[N_BODY_IN..][..3], scent.map(Node::body));
    let is_scent = |n: &Node| scent.map(Node::body).contains(n);
    for g in [&zero, &none] {
        let inputs = brain::ports(g).inputs;
        assert_eq!(inputs[..N_BODY_IN], body.map(Node::body));
        assert!(!inputs.iter().any(is_scent));
        // It still declares its eye.
        assert_eq!(inputs.len(), N_BODY_IN + 4);
    }

    // The block has no scent neuron, and the 14 connections from one are not expressed: 12 to the
    // hidden neurons and the 2 that steer.
    let p = Params::new();
    let mut b = Brains::new(2);
    b.express(0, &with, &p);
    b.express(1, &zero, &p);
    assert_eq!((b.n_in[0], b.in_scent[0], b.in_eye[0]), (13, 6, 9));
    assert_eq!((b.n_in[1], b.in_scent[1], b.in_eye[1]), (10, NO_INPUT, 6));
    assert_eq!((b.n_conn[0], b.n_conn[1]), (60, 46));
    // `prune` takes them out of the genome.
    let mut pruned = zero.clone();
    pruned.prune();
    assert_eq!(pruned.brain.conns.len(), 46);
    assert!(!pruned.brain.conns.iter().any(|c| is_scent(&c.src)));

    // In a world with scent the nose reads it, and the body with none is safe to sense.
    let mut w = World::new(1, 1536.0, 1024.0);
    w.params.set(id::THINK_EVERY, 1.0);
    w.seed_founders(0, 600);
    w.run(200);
    let at = |x: f32| SpawnAt {
        x,
        y: 500.0,
        heading: 0.0,
        growth: 1.0,
        energy01: 1.0,
        parent: 0,
        generation: 0,
        mark: 0,
    };
    let (x, y) = (w.plants.x[0], w.plants.y[0]);
    let nosed = w.spawn(with, SpawnAt { x, y, ..at(0.0) }).expect("slot") as usize;
    let noseless = w.spawn(zero, SpawnAt { x, y, ..at(0.0) }).expect("slot") as usize;
    w.tick();
    assert!(w.brains.inputs_mut(nosed)[6] > 0.0, "no scent at a plant");
    assert_eq!(w.brains.inputs_mut(noseless).len(), 10);
}

/// A patch of plants at (1000, 500). A creature starts 300 units away, facing away.
fn seeker(seed: u32, chemo: f32) -> f32 {
    let mut w = World::new(seed, 1536.0, 1024.0);
    for k in [
        id::PLANT_GROWTH,
        id::PLANT_SEED_CHANCE,
        id::PLANT_DEATH_RESERVE,
        id::BASAL,
        id::FIXED_UPKEEP,
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
fn a_founder_still_follows_scent_to_food() {
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

/// Two bodies of the same age with a short and a long `old` gene. The `lifespan` parameter is
/// 4800, and neither input reads it.
#[test]
fn the_age_input_is_the_age_over_the_old_gene_of_the_body() {
    let mut w = World::new(1, 1536.0, 1024.0);
    w.params.set(id::THINK_EVERY, 1.0);
    let bodies = [(300.0, 2400.0), (900.0, 9600.0)].map(|(x, old)| {
        let g = Genome {
            old,
            ..Genome::default()
        };
        let at = SpawnAt {
            x,
            y: 500.0,
            heading: 0.0,
            growth: 1.0,
            energy01: 1.0,
            parent: 0,
            generation: 0,
            mark: 0,
        };
        let s = w.spawn(g, at).expect("slot") as usize;
        w.creatures.age[s] = 1200;
        s
    });
    w.tick();
    let [short, long] = bodies.map(|s| w.brains.inputs_mut(s)[IN_AGE as usize]);
    assert_eq!((short, long), (0.5, 0.125));
}
