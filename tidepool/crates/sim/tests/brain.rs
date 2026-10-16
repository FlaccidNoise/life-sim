// Tests run native only, so a banned float method is safe here. 3.14 is "facing away", near enough.
#![allow(clippy::disallowed_methods, clippy::approx_constant)]

use tidepool_sim::brain::{
    self, Brains, EYE_BODY_A, EYE_BODY_B, EYE_FOOD_A, EYE_FOOD_B, EYE_JAW_A, EYE_JAW_B, IN_AGE,
    IN_CONST, IN_ENERGY, IN_GRAD_FWD, IN_GRAD_SIDE, IN_HURT, IN_HURT_SIDE, IN_MATE_KIN,
    IN_MATE_SIZE, IN_SCENT, IN_SPEED, NO_INPUT, N_BODY_IN, OUT_ACCEPT, OUT_DASH, OUT_LUNGE,
    OUT_THRUST, OUT_TOXIN, OUT_TURN,
};
use tidepool_sim::genome::{
    self, BrainGenome, ConnGene, Genome, Node, OutGene, FOUNDER_EYE_HISTORY, FOUNDER_JAW_HISTORY,
    KIND_CHEMO, KIND_FILTER, KIND_FLAGELLUM, KIND_JAW,
};
use tidepool_sim::math::{act, sin_cos, PI};
use tidepool_sim::params::{id, Params};
use tidepool_sim::rng::Rng;
use tidepool_sim::sense;
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
    // 4 hidden genes and 4 out genes, dash among them: 8 biases and 8 alphas.
    assert_eq!((g.hidden.len(), g.conns.len(), g.outs.len()), (4, 43, 4));
    assert_eq!(biases(&g).len(), 8);
    // The ids 40 to 57 are those of the eye wires, which this brain does not have, and so are the
    // trigger ids after the first.
    let first_trigger = FOUNDER_JAW_HISTORY + 1;
    let ids: Vec<u32> = g.conns.iter().map(|c| c.history).collect();
    let want = (1..=39).chain(58..=60).chain([first_trigger]);
    assert_eq!(ids, want.collect::<Vec<u32>>());
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
    let triggers = FOUNDER_JAW_HISTORY + 1..=FOUNDER_JAW_HISTORY + 5;
    let want = (1..=brain::STARTER_CONNS).chain(triggers);
    assert_eq!(ids, want.collect::<Vec<u32>>());
    // The eye moves no draw of the brain with none: not the 39 before its wires, and not the 3
    // after them.
    let weights = |g: &BrainGenome| g.conns.iter().map(|c| c.weight).collect::<Vec<_>>();
    assert_eq!(weights(&g)[..39], weights(&plain)[..39]);
    assert_eq!(weights(&g)[57..60], weights(&plain)[39..42]);
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
    // After the accept wires, rule P2 of M4: a hit to dash, and teeth seen on one side turn the
    // body to the other side and dash. At the Off value of `starter_flee` each weight is 0.
    let (dash, flee) = (Node::body(OUT_DASH), p.get(id::STARTER_FLEE));
    let want = [
        (Node::body(IN_HURT), dash, flee),
        (eye(EYE_JAW_A), TURN, -flee),
        (eye(EYE_JAW_B), TURN, flee),
        (eye(EYE_JAW_A), dash, flee),
        (eye(EYE_JAW_B), dash, flee),
    ];
    assert_eq!(g.conns[60..].iter().map(wire).collect::<Vec<_>>(), want);
    assert_eq!(flee, 0.0);
}

#[test]
fn the_starter_brain_accepts_a_mate_by_the_last_three_connections() {
    let p = Params::new();
    assert_eq!(brain::STARTER_CONNS, 60);
    let g = brain::starter(&mut Rng::new(1), &p);
    let accept = Node::body(OUT_ACCEPT);
    let outs: Vec<Node> = g.outs.iter().map(|out| out.node).collect();
    assert_eq!(
        outs,
        [Node::body(OUT_THRUST), TURN, accept, Node::body(OUT_DASH)]
    );
    // 58: the constant input to `accept`, at `starter_accept`. 59 and 60: each mate input to
    // `accept`, with a small random weight. Nothing else runs into `accept`.
    let wire = |c: &ConnGene| (c.history, c.src, c.dst);
    assert_eq!(wire(&g.conns[57]), (58, Node::body(IN_CONST), accept));
    assert_eq!(wire(&g.conns[58]), (59, Node::body(IN_MATE_SIZE), accept));
    assert_eq!(wire(&g.conns[59]), (60, Node::body(IN_MATE_KIN), accept));
    assert_eq!(g.conns[57].weight, p.get(id::STARTER_ACCEPT));
    assert!(g.conns[58..60].iter().all(|c| c.weight != 0.0));
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
        IN_HURT,
        IN_HURT_SIDE,
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
        assert_eq!(inputs.len(), N_BODY_IN + 6);
    }

    // The block has no scent neuron, and the 14 connections from one are not expressed: 12 to the
    // hidden neurons and the 2 that steer.
    let p = Params::new();
    let mut b = Brains::new(2);
    b.express(0, &with, &p);
    b.express(1, &zero, &p);
    assert_eq!((b.n_in[0], b.in_scent[0], b.in_eye[0]), (17, 8, 11));
    assert_eq!((b.n_in[1], b.in_scent[1], b.in_eye[1]), (14, NO_INPUT, 8));
    assert_eq!((b.n_conn[0], b.n_conn[1]), (65, 51));
    // `prune` takes them out of the genome.
    let mut pruned = zero.clone();
    pruned.prune(-1.0);
    assert_eq!(pruned.brain.conns.len(), 51);
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
    assert!(
        w.brains.inputs_mut(nosed)[N_BODY_IN] > 0.0,
        "no scent at a plant"
    );
    assert_eq!(w.brains.inputs_mut(noseless).len(), 14);
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

/// A world where nothing grows, eats, pays upkeep, or leaves scent, and every body thinks and
/// scans on every tick.
fn still_world() -> World {
    let mut w = World::new(1, 1536.0, 1024.0);
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
        id::SCENT_DEPOSIT,
    ] {
        w.params.set(k, 0.0);
    }
    w.params.set(id::THINK_EVERY, 1.0);
    w.params.set(id::SEE_EVERY, 1.0);
    w
}

/// A full-grown body that never buds, at half a store.
fn put(w: &mut World, g: Genome, x: f32, y: f32, heading: f32) -> usize {
    let at = SpawnAt {
        x,
        y,
        heading,
        growth: 1.0,
        energy01: 0.5,
        parent: 0,
        generation: 0,
        mark: 0,
    };
    let s = w.spawn(g, at).expect("slot") as usize;
    w.creatures.bud_cooldown[s] = 1_000_000;
    s
}

/// The Start values of the founder's triggers, and abilities that move a body.
fn armed(w: &mut World) {
    for (k, v) in [
        (id::STARTER_FLEE, 2.0),
        (id::STARTER_CHASE, 1.5),
        (id::STARTER_LUNGE, 2.0),
        (id::DASH_IMPULSE, 2.0),
        (id::LUNGE_IMPULSE, 2.0),
    ] {
        w.params.set(k, v);
    }
}

#[test]
fn a_body_hit_on_the_left_reads_a_negative_side() {
    // Two bodies are bitten: one from its left, the side of negative angles, and one from its
    // right. Each biter faces its prey from 7 units away.
    let mut w = still_world();
    w.params.set(id::BITE_RATE, 0.5);
    let mut jawed = Genome::default();
    jawed.set_size(KIND_JAW, 0.5);
    let left = put(&mut w, Genome::default(), 300.0, 500.0, 0.0);
    put(&mut w, jawed.clone(), 300.0, 493.0, PI / 2.0);
    let right = put(&mut w, Genome::default(), 900.0, 500.0, 0.0);
    put(&mut w, jawed, 900.0, 507.0, -PI / 2.0);
    w.tick();
    let c = &w.creatures;
    let hurt = [left, right].map(|s| c.hurt[s]);
    assert!(hurt.iter().all(|&h| h > 0.0), "{hurt:?}");
    let capacity = w.params.get(id::ENERGY_PER_MASS) * c.area(left);
    let gain = w.params.get(id::HURT_GAIN);
    sense::step(&mut w);
    for (s, side, hurt) in [(left, -1.0, hurt[0]), (right, 1.0, hurt[1])] {
        let inputs = w.brains.inputs_mut(s);
        let read = [IN_HURT, IN_HURT_SIDE].map(|port| inputs[port as usize]);
        assert_eq!(read, [(hurt / capacity * gain).min(1.0), side]);
        assert_eq!(w.creatures.hurt[s], 0.0, "sense zeroes the hurt");
    }
    // With no hit since the last think, both read 0.
    sense::step(&mut w);
    let inputs = w.brains.inputs_mut(left);
    assert_eq!([inputs[6], inputs[7]], [0.0, 0.0]);
}

#[test]
fn an_undeclared_trigger_never_fires() {
    // A body with no flagellum, no jaw, and no gland, whose genome holds an open gene for each of
    // the three triggers, beside a body with a flagellum whose dash gene is open.
    let mut w = still_world();
    armed(&mut w);
    let open = |port: u8| OutGene {
        node: Node::body(port),
        bias: 3.0,
        alpha: 1.0,
    };
    let mut bare = Genome::default();
    bare.parts.retain(|part| part.kind != KIND_FLAGELLUM);
    bare.brain
        .outs
        .extend([OUT_DASH, OUT_LUNGE, OUT_TOXIN].map(open));
    let mut swimmer = Genome::default();
    swimmer.brain.outs.push(open(OUT_DASH));
    let s = put(&mut w, bare, 300.0, 500.0, 0.0);
    let d = put(&mut w, swimmer, 900.0, 500.0, 0.0);
    for _ in 0..200 {
        w.tick();
        let c = &w.creatures;
        let cmds = [c.cmd_dash[s], c.cmd_lunge[s], c.cmd_toxin[s]];
        assert_eq!(cmds, [-1.0; 3]);
        assert_eq!([c.cd_dash[s], c.cd_lunge[s], c.cd_toxin[s]], [0; 3]);
        assert_eq!(c.cmd_lunge[d], -1.0);
    }
    assert!(w.creatures.cmd_dash[d] > 0.9);
    assert!(w.creatures.cd_dash[d] > 0, "the declared dash fires");
}

#[test]
fn a_founder_trigger_rests_closed() {
    let mut w = still_world();
    armed(&mut w);
    let g = Genome::founder(&mut Rng::new(1), &w.params);
    let dash = g
        .brain
        .outs
        .iter()
        .find(|out| out.node == Node::body(OUT_DASH));
    let bias = w.params.get(id::STARTER_TRIGGER_BIAS);
    assert_eq!(dash.map(|out| out.bias), Some(bias));
    let s = put(&mut w, g, 700.0, 500.0, 0.0);
    for t in 0..1000 {
        w.tick();
        assert!(w.creatures.cmd_dash[s] < 0.0, "tick {t}");
        assert_eq!(w.creatures.cd_dash[s], 0, "tick {t}");
    }
}

#[test]
fn a_founder_dashes_when_hit() {
    let dashes = |flee: f32| {
        let mut w = still_world();
        armed(&mut w);
        w.params.set(id::STARTER_FLEE, flee);
        let g = Genome::founder(&mut Rng::new(1), &w.params);
        let s = put(&mut w, g, 700.0, 500.0, 0.0);
        w.run(10);
        assert_eq!(w.creatures.cd_dash[s], 0);
        // A tenth of its capacity lost: the hurt input reads 1.
        let capacity = w.params.get(id::ENERGY_PER_MASS) * w.creatures.area(s);
        w.creatures.hurt[s] = 0.1 * capacity;
        w.tick();
        assert_eq!(w.brains.inputs_mut(s)[IN_HURT as usize], 1.0);
        w.creatures.cd_dash[s] > 0
    };
    assert!(dashes(2.0), "the hit did not make the founder dash");
    assert!(!dashes(0.0), "with starter_flee at 0 a hit opens no dash");
}

#[test]
fn a_hunter_founder_turns_to_a_body_it_sees_and_lunges() {
    let mut w = still_world();
    armed(&mut w);
    w.params.set(id::FOUNDER_JAW, 1.0);
    w.seed_founders(1, 0);
    let hunter = w.genomes[0].clone();
    // The jaw is at the nose, and the founder keeps its Filter.
    let jaw = hunter.parts.iter().find(|part| part.kind == KIND_JAW);
    let size = w.params.get(id::FOUNDER_JAW_SIZE);
    assert_eq!(
        jaw.map(|part| (part.anchor, part.size, part.history)),
        Some((0.0, size, FOUNDER_JAW_HISTORY))
    );
    assert!(hunter.size_of(KIND_FILTER) > 0.0);
    let lunge = hunter
        .brain
        .outs
        .iter()
        .find(|o| o.node == Node::body(OUT_LUNGE));
    let bias = w.params.get(id::STARTER_TRIGGER_BIAS);
    assert_eq!(lunge.map(|out| out.bias), Some(bias));

    // The hunter at (700, 500) facing +x, and a still body 12 units away in the middle of one of
    // its two eye cones, or none. Gives the turn command and the lunge cooldown after 3 ticks.
    let side = genome::FOUNDER_EYE_ANCHOR * PI;
    let hunt = |angle: Option<f32>| {
        let mut w = still_world();
        armed(&mut w);
        let s = put(&mut w, hunter.clone(), 700.0, 500.0, 0.0);
        if let Some(a) = angle {
            let (sin, cos) = sin_cos(a);
            put(
                &mut w,
                Genome::default(),
                700.0 + 12.0 * cos,
                500.0 + 12.0 * sin,
                0.0,
            );
        }
        w.run(3);
        (w.creatures.cmd_turn[s], w.creatures.cd_lunge[s])
    };
    let (alone, a, b) = (hunt(None), hunt(Some(side)), hunt(Some(-side)));
    assert!(a.0 > alone.0 + 0.3, "{a:?} {alone:?}");
    assert!(b.0 < alone.0 - 0.3, "{b:?} {alone:?}");
    assert_eq!(alone.1, 0, "a hunter with nothing in view does not lunge");
    assert!(a.1 > 0 && b.1 > 0, "{a:?} {b:?}");
}
