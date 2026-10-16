//! Brains by name: a connection names its two ends by who owns them, and `Brains::express` turns
//! the names into the indexes of a brain block.

use tidepool_sim::brain::{
    self, Brains, EYE_BODY_A, EYE_BODY_B, EYE_FOOD_A, EYE_FOOD_B, IN_CONST, IN_ENERGY, MAX_CONNS,
    MAX_NEURONS, N_OUT_MAX, OUT_ACCEPT, OUT_THRUST, OUT_TURN, READOUT_CONN_WORDS,
    READOUT_HEADER_WORDS, READOUT_NEURON_WORDS,
};
use tidepool_sim::genome::{
    BrainGenome, ConnGene, Genome, HiddenGene, Node, OutGene, PartGene, BODY, FOUNDER_EYE_HISTORY,
    FOUNDER_HISTORIES, KIND_EYE, KIND_FIN, MAX_CONN_GENES, MAX_HIDDEN, PORT_HIDDEN,
};
use tidepool_sim::params::{id, Params};
use tidepool_sim::rng::Rng;
use tidepool_sim::snapshot::{LoadError, Reader, Writer};
use tidepool_sim::world::{SpawnAt, World};

fn founder(seed: u64) -> Genome {
    Genome::founder(&mut Rng::new(seed), &Params::new())
}

fn conn(src: Node, dst: Node, weight: f32, history: u32) -> ConnGene {
    ConnGene {
        src,
        dst,
        weight,
        history,
    }
}

fn saved(g: &Genome) -> Vec<u8> {
    let mut w = Writer::new();
    g.save(&mut w);
    w.bytes
}

fn loaded(g: &Genome) -> Result<Genome, LoadError> {
    Genome::load(&mut Reader::new(&saved(g)))
}

fn at(x: f32) -> SpawnAt {
    SpawnAt {
        x,
        y: 500.0,
        heading: 0.0,
        growth: 1.0,
        energy01: 1.0,
        parent: 0,
        generation: 0,
        mark: 0,
    }
}

/// Where rule B2 puts a neuron of the founder brain: the 6 inputs of the body at 0 to 5, the 3 of
/// the scent at 6 to 8, the 4 of the eye at 9 to 12, hidden 13 to 16, thrust 17, turn 18, accept 19.
fn founder_index(n: Node) -> u16 {
    let first_hidden = FOUNDER_HISTORIES - 3;
    match (n.owner, n.port) {
        (BODY, port @ 0..=5) => port as u16,
        (BODY, port @ 16..=18) => port as u16 - 10,
        (FOUNDER_EYE_HISTORY, port @ 0..=3) => 9 + port as u16,
        (BODY, port @ 128..=130) => port as u16 - 111,
        (id, PORT_HIDDEN) if (first_hidden..=FOUNDER_HISTORIES).contains(&id) => {
            13 + (id - first_hidden) as u16
        }
        _ => panic!("{n:?} is not a neuron of the founder"),
    }
}

#[test]
fn a_founder_expresses_the_m3_block() {
    let p = Params::new();
    let g = founder(7);
    let ids: Vec<u32> = g.brain.hidden.iter().map(|h| h.id).collect();
    assert_eq!(ids, [66, 67, 68, 69]);
    assert_eq!((FOUNDER_EYE_HISTORY, FOUNDER_HISTORIES), (65, 69));

    let mut b = Brains::new(2);
    b.express(1, &g, &p);
    assert_eq!(
        (b.n_in[1], b.n_neur[1], b.n_out[1], b.n_conn[1]),
        (13, 20, 3, 60)
    );
    assert_eq!((b.in_scent[1], b.in_eye[1]), (6, 9));

    // Each connection sits where the rule puts it: sorted by (dst, src, history) on those indexes.
    let mut want: Vec<(u16, u16, u32, u32)> = g
        .brain
        .conns
        .iter()
        .map(|c| {
            (
                founder_index(c.dst),
                founder_index(c.src),
                c.history,
                c.weight.to_bits(),
            )
        })
        .collect();
    want.sort_unstable();
    let got: Vec<(u16, u16, u32)> = (MAX_CONNS..MAX_CONNS + 60)
        .map(|k| (b.dst[k], b.src[k], b.w[k].to_bits()))
        .collect();
    let want: Vec<(u16, u16, u32)> = want.iter().map(|&(d, s, _, w)| (d, s, w)).collect();
    assert_eq!(got, want);

    // The biases of the hidden genes, then those of the outputs. An input has none.
    let block = MAX_NEURONS..MAX_NEURONS + 20;
    let bias: Vec<f32> = (g.brain.hidden.iter().map(|h| h.bias))
        .chain(g.brain.outs.iter().map(|o| o.bias))
        .collect();
    assert_eq!(b.bias[block.clone()][13..], bias[..]);
    assert_eq!(b.bias[block.clone()][..13], [0.0; 13]);
    assert_eq!(b.alpha[block][13..], [1.0; 7]);
}

#[test]
fn a_connection_to_a_missing_name_is_not_expressed_and_costs_nothing() {
    let p = Params::new();
    let plain = founder(7);
    let mut dangling = plain.clone();
    let (thrust, missing) = (Node::body(OUT_THRUST), Node::hidden(9999));
    dangling.brain.conns.extend([
        // No part has this id.
        conn(
            Node {
                owner: 777,
                port: 0,
            },
            thrust,
            5.0,
            200,
        ),
        conn(Node::body(IN_CONST), missing, 5.0, 201),
        conn(missing, thrust, 5.0, 202),
        // An input neuron takes no connection.
        conn(thrust, Node::body(IN_ENERGY), 5.0, 203),
    ]);
    let mut b = Brains::new(2);
    b.express(0, &plain, &p);
    b.express(1, &dangling, &p);
    assert_eq!((b.n_conn[0], b.n_conn[1]), (60, 60));
    assert_eq!(b.w[..60], b.w[MAX_CONNS..][..60]);

    // Two bodies far apart in a world with no plant, both thinking on every tick. They think,
    // swim, and pay the same.
    let mut w = World::new(1, 1536.0, 1024.0);
    w.params.set(id::THINK_EVERY, 1.0);
    let a = w.spawn(plain, at(300.0)).expect("slot") as usize;
    let d = w.spawn(dangling, at(900.0)).expect("slot") as usize;
    // Neither buds: a brood is drawn from the generator, so two parents pay two prices.
    (w.creatures.bud_cooldown[a], w.creatures.bud_cooldown[d]) = (1_000_000, 1_000_000);
    w.run(200);
    let c = &w.creatures;
    assert!(c.energy[a] < c.area(a), "the body paid no upkeep");
    assert!(c.vx[a] != 0.0, "the body did not swim");
    assert_eq!(c.energy[d], c.energy[a]);
    assert_eq!((c.vx[d], c.heading[d]), (c.vx[a], c.heading[a]));
}

#[test]
fn prune_removes_a_dangling_connection_and_the_second_of_a_pair() {
    let start = founder(7);
    let mut same = start.clone();
    same.prune();
    assert_eq!(
        saved(&same),
        saved(&start),
        "a founder holds nothing to prune"
    );

    let mut g = start.clone();
    let (thrust, energy) = (Node::body(OUT_THRUST), Node::body(IN_ENERGY));
    let twin = g.brain.conns[10].clone();
    g.brain.conns.extend([
        conn(Node::hidden(9999), thrust, 1.0, 200),
        conn(energy, Node::hidden(9999), 1.0, 201),
        conn(thrust, energy, 1.0, 202),
        // The pair of connection 11 again: the lower history stays.
        conn(twin.src, twin.dst, 1.0, 300),
        // A new pair, three times. The lowest history is not the first in the list.
        conn(energy, thrust, 0.4, 400),
        conn(energy, thrust, 0.3, 350),
        conn(energy, thrust, 0.5, 450),
    ]);
    g.prune();
    let histories: Vec<u32> = g.brain.conns.iter().map(|c| c.history).collect();
    let want: Vec<u32> = (1..=60).chain([350]).collect();
    assert_eq!(histories, want);
    assert_eq!(g.brain.conns[10], twin);
    assert_eq!(g.brain.conns[60].weight, 0.3);
}

#[test]
fn prune_adds_an_out_gene_for_a_declared_output() {
    let mut g = founder(7);
    let (turn, accept) = (g.brain.outs[1].clone(), g.brain.outs[2].clone());
    assert_eq!(turn.node, Node::body(OUT_TURN));
    assert_eq!(accept.node, Node::body(OUT_ACCEPT));
    // The thrust gene goes, and a gene for an output that no body declares comes.
    g.brain.outs[0] = OutGene {
        node: Node::body(200),
        bias: 0.7,
        alpha: 0.5,
    };
    g.prune();
    let thrust = OutGene {
        node: Node::body(OUT_THRUST),
        bias: 0.0,
        alpha: 1.0,
    };
    assert_eq!(g.brain.outs, [turn, accept, thrust]);

    let mut none = Genome {
        brain: BrainGenome {
            hidden: vec![],
            outs: vec![],
            conns: vec![],
        },
        ..Genome::default()
    };
    none.prune();
    let nodes: Vec<Node> = none.brain.outs.iter().map(|o| o.node).collect();
    assert_eq!(nodes, brain::ports(&none).outputs);
}

/// A constant input feeds thrust straight, and through one hidden neuron.
fn through_a_hidden_neuron(direct: f32, via: f32) -> Genome {
    let (input, hidden, thrust) = (
        Node::body(IN_CONST),
        Node::hidden(900),
        Node::body(OUT_THRUST),
    );
    let mut g = Genome::default();
    g.brain.hidden.push(HiddenGene {
        id: 900,
        bias: 0.0,
        alpha: 1.0,
    });
    g.brain.conns = vec![
        conn(input, thrust, direct, 1),
        conn(input, hidden, 2.0, 2),
        conn(hidden, thrust, via, 3),
    ];
    g
}

#[test]
fn hidden_gain_0_silences_a_hidden_neuron_and_1_changes_no_bit() {
    let (on, mut off) = (Params::new(), Params::new());
    assert_eq!(on.get(id::HIDDEN_GAIN), 1.0);
    off.set(id::HIDDEN_GAIN, 0.0);
    let run = |g: &Genome, p: &Params| {
        let mut b = Brains::new(1);
        b.express(0, g, p);
        for _ in 0..3 {
            b.inputs_mut(0)[IN_CONST as usize] = 1.0;
            b.step_one(0);
        }
        // Thrust, the hidden neuron, and the count of connections.
        let hidden = b.cur[b.n_in[0] as usize];
        (b.output(0, OUT_THRUST), hidden, b.n_conn[0])
    };
    let (wired, cut) = (
        through_a_hidden_neuron(0.3, 1.5),
        through_a_hidden_neuron(0.3, 0.0),
    );
    let (loud, hidden, conns) = run(&wired, &on);
    let (silent, hidden_off, conns_off) = run(&wired, &off);
    // At 0 the neuron still works and still counts. What it sends is worth nothing.
    assert_eq!((hidden_off, conns_off), (hidden, conns));
    assert!(hidden > 0.9 && conns == 3);
    assert_eq!(silent, run(&cut, &on).0);
    assert!(loud > silent + 0.3, "{loud} against {silent}");

    // At 1 a weight is the weight of its gene, bit for bit, whatever its source.
    let g = founder(7);
    let mut b = Brains::new(1);
    b.express(0, &g, &on);
    let mut genes: Vec<u32> = g.brain.conns.iter().map(|c| c.weight.to_bits()).collect();
    let mut block: Vec<u32> = b.w[..60].iter().map(|w| w.to_bits()).collect();
    genes.sort_unstable();
    block.sort_unstable();
    assert_eq!(block, genes);

    // A gain that changes in a live world reaches the brains that are already there, so a world
    // that is saved after the change runs on as the unbroken one does.
    let start = |gain: f32| {
        let mut w = World::new(3, 1536.0, 1024.0);
        w.seed_founders(200, 600);
        w.run(100);
        w.params.set(id::HIDDEN_GAIN, gain);
        w
    };
    let (mut unbroken, mut same) = (start(0.0), start(1.0));
    let mut resumed = World::load(&unbroken.save()).expect("load");
    for w in [&mut unbroken, &mut same, &mut resumed] {
        w.run(200);
    }
    assert_eq!(resumed.state_hash(), unbroken.state_hash());
    assert_ne!(same.state_hash(), unbroken.state_hash());
}

#[test]
fn a_genome_with_65_hidden_genes_does_not_load() {
    let with_hidden = |count: usize| {
        let mut g = founder(7);
        g.brain.hidden = (0..count as u32)
            .map(|k| HiddenGene {
                id: 1000 + k,
                bias: 0.0,
                alpha: 1.0,
            })
            .collect();
        g
    };
    assert_eq!(MAX_HIDDEN, 64);
    let full = loaded(&with_hidden(64)).expect("64 hidden genes load");
    assert_eq!(full.brain.hidden.len(), 64);
    assert_eq!(
        loaded(&with_hidden(65)).err(),
        Some(LoadError::Invalid("brain genome hidden count"))
    );

    // The other two lists have a cap as well.
    let wire = conn(Node::body(IN_CONST), Node::body(OUT_TURN), 0.5, 1);
    let mut g = founder(7);
    g.brain.conns = vec![wire; MAX_CONN_GENES];
    assert!(loaded(&g).is_ok());
    g.brain.conns.push(g.brain.conns[0].clone());
    assert_eq!(
        loaded(&g).err(),
        Some(LoadError::Invalid("brain genome connection count"))
    );
    let mut g = founder(7);
    g.brain.outs = vec![g.brain.outs[0].clone(); N_OUT_MAX];
    assert!(loaded(&g).is_ok());
    g.brain.outs.push(g.brain.outs[0].clone());
    assert_eq!(
        loaded(&g).err(),
        Some(LoadError::Invalid("brain genome output count"))
    );

    // A port is one byte. The word of the port of the first out gene comes after 5 body genes, the
    // part count, 5 words per part, the hidden count, 3 words per hidden gene, the out count, and
    // the owner.
    let g = founder(7);
    let port_at = 4 * (5 + 1 + 5 * g.parts.len() + 1 + 3 * g.brain.hidden.len() + 1 + 1);
    let mut bytes = saved(&g);
    assert_eq!(bytes[port_at..port_at + 4], [OUT_THRUST, 0, 0, 0]);
    bytes[port_at + 1] = 1;
    assert_eq!(
        Genome::load(&mut Reader::new(&bytes)).err(),
        Some(LoadError::Invalid("brain genome port"))
    );

    // A name is not checked: a founder with a connection to nothing loads, and its world runs.
    let mut g = founder(7);
    g.brain.conns.push(conn(
        Node::hidden(9999),
        Node {
            owner: 5,
            port: 250,
        },
        1.0,
        900,
    ));
    let back = loaded(&g).expect("a dangling connection loads");
    assert_eq!(saved(&back), saved(&g));
    let mut w = World::new(1, 1536.0, 1024.0);
    w.spawn(back, at(300.0)).expect("slot");
    let mut w = World::load(&w.save()).expect("the world loads");
    w.run(20);
    assert_eq!(w.brains.n_conn[0], 60);
}

#[test]
fn the_readout_of_a_founder_names_every_neuron() {
    let (header, per_neuron, per_conn) = (
        READOUT_HEADER_WORDS as usize,
        READOUT_NEURON_WORDS as usize,
        READOUT_CONN_WORDS as usize,
    );
    assert_eq!((header, per_neuron, per_conn), (6, 6, 3));
    let mut w = World::new(1, 1536.0, 1024.0);
    w.seed_founders(20, 300);
    w.run(50);
    let (s, uid) = (7, w.creatures.uid[7]);
    let words = brain::readout(&mut w, uid) as usize;
    assert_eq!(words, header + 20 * per_neuron + 60 * per_conn);
    assert_eq!(w.readout.len(), words);
    assert_eq!(w.readout[..header], [uid, 13, 4, 3, 60, 0]);

    let g = &w.genomes[s];
    let ports = brain::ports(g);
    let hidden = g.brain.hidden.iter().map(|h| Node::hidden(h.id));
    let names: Vec<Node> = (ports.inputs.iter().copied())
        .chain(hidden)
        .chain(ports.outputs.iter().copied())
        .collect();
    assert_eq!(names.len(), 20);
    let neurons = w.readout[header..].as_chunks::<6>().0;
    let block = s * MAX_NEURONS;
    for (i, (neuron, name)) in neurons.iter().zip(&names).enumerate() {
        assert_eq!(neuron[..2], [name.owner, name.port as u32], "neuron {i}");
        // Kind 0 is the body. Kind 255 is a hidden neuron, with the index of its gene. An input
        // of the eye has the kind of the eye, with the index of its gene: the fifth part.
        let kind = match i {
            9..13 => KIND_EYE as u32 | 4 << 8,
            13..17 => 255 | (i as u32 - 13) << 8,
            _ => 0,
        };
        assert_eq!(neuron[2], kind, "neuron {i}");
        let floats = [
            w.brains.cur[block + i],
            w.brains.bias[block + i],
            w.brains.alpha[block + i],
        ];
        assert_eq!(neuron[3..], floats.map(f32::to_bits), "neuron {i}");
    }
    // The constant input reads 1, and every name is there once.
    assert_eq!(f32::from_bits(neurons[0][3]), 1.0);
    let mut once = names.clone();
    once.sort_unstable();
    once.dedup();
    assert_eq!(once.len(), 20);

    // The connections in the order of the block, each with the history of its gene.
    let conns = w.readout[header + 20 * per_neuron..].as_chunks::<3>().0;
    assert_eq!(conns.len(), 60);
    let mut histories = Vec::new();
    for (k, word) in conns.iter().enumerate() {
        let at = s * MAX_CONNS + k;
        let ends = w.brains.src[at] as u32 | (w.brains.dst[at] as u32) << 16;
        assert_eq!(
            word[..2],
            [ends, w.brains.w[at].to_bits()],
            "connection {k}"
        );
        let gene = (g.brain.conns.iter())
            .find(|c| c.history == word[2])
            .expect("a gene has this history");
        assert_eq!(names[(word[0] & 0xFFFF) as usize], gene.src);
        assert_eq!(names[(word[0] >> 16) as usize], gene.dst);
        histories.push(word[2]);
    }
    histories.sort_unstable();
    assert_eq!(histories, (1..=60).collect::<Vec<u32>>());

    // The last header word is 1 while the player steers this body.
    assert!(w.possess(uid));
    brain::readout(&mut w, uid);
    assert_eq!(w.readout[5], 0);
    w.input(true, 1.0, 0.0, false, 0);
    brain::readout(&mut w, uid);
    assert_eq!(w.readout[5], 1);
    let other = w.creatures.uid[8];
    brain::readout(&mut w, other);
    assert_eq!((w.readout[0], w.readout[5]), (other, 0));

    // A uid that is not alive gives no words.
    for dead in [0, 9999] {
        assert_eq!(brain::readout(&mut w, dead), 0);
        assert!(w.readout.is_empty());
    }
}

/// A port of a part has the kind of its part and the index of its gene, whatever the place of the
/// gene in the list.
#[test]
fn the_readout_gives_a_port_of_a_part_the_kind_and_the_gene_index_of_its_part() {
    let part = |kind: u8, anchor: f32, history: u32| PartGene {
        kind,
        anchor,
        size: 0.2,
        extra: 0.5,
        history,
    };
    // The four founder parts, then a midline eye, a fin, and a paired eye.
    let mut g = Genome::default();
    g.parts.extend([
        part(KIND_EYE, 0.0, 900),
        part(KIND_FIN, 0.6, 901),
        part(KIND_EYE, 0.3, 902),
    ]);
    let mut w = World::new(1, 1536.0, 1024.0);
    w.spawn(g, at(300.0)).expect("slot");
    let header = READOUT_HEADER_WORDS as usize;
    let words = brain::readout(&mut w, 1) as usize;
    // 9 inputs of the body, 2 of the midline eye, 4 of the pair, and the 3 outputs.
    assert_eq!(w.readout[..header], [1, 15, 0, 3, 0, 0]);
    assert_eq!(words, header + 18 * READOUT_NEURON_WORDS as usize);
    let neurons = w.readout[header..].as_chunks::<6>().0;
    let got: Vec<[u32; 3]> = neurons[9..15].iter().map(|n| [n[0], n[1], n[2]]).collect();
    let eye = KIND_EYE as u32;
    let want = [
        (900, EYE_FOOD_A, 4),
        (900, EYE_BODY_A, 4),
        (902, EYE_FOOD_A, 6),
        (902, EYE_BODY_A, 6),
        (902, EYE_FOOD_B, 6),
        (902, EYE_BODY_B, 6),
    ]
    .map(|(owner, port, gene)| [owner, port as u32, eye | gene << 8]);
    assert_eq!(got, want);
    // Every other neuron is of the body.
    let mut of_body = neurons[..9].iter().chain(&neurons[15..]);
    assert!(of_body.all(|n| n[0] == BODY && n[2] == 0));
}

#[test]
fn a_child_that_loses_its_eye_gene_loses_those_connections() {
    let mut p = Params::new();
    // No part arrives, and no mutation of the brain adds or takes a connection.
    for k in [
        id::MUT_PART_ADD,
        id::MUT_PART_DUP,
        id::MUT_CONN_ADD,
        id::MUT_CONN_REMOVE,
        id::MUT_NEURON_ADD,
        id::MUT_NEURON_REMOVE,
    ] {
        p.set(k, 0.0);
    }
    p.set(id::MUT_PART_REMOVE, 1.0);
    let parent = founder(7);
    let names_eye = |c: &ConnGene| c.src.owner == FOUNDER_EYE_HISTORY;
    assert_eq!(
        parent.brain.conns.iter().filter(|c| names_eye(c)).count(),
        18
    );
    let mut next_history = FOUNDER_HISTORIES + 1;
    let mut blind = 0;
    for seed in 0..64 {
        let mut child = parent.mutated(&mut Rng::new(seed), &p, &mut next_history);
        child.prune();
        assert_eq!(child.parts.len(), 4, "seed {seed}");
        if child.parts.iter().any(|part| part.kind == KIND_EYE) {
            continue;
        }
        blind += 1;
        // The body declares no eye input, so its genome holds no connection from one: the 16 to
        // the hidden neurons and the 2 that turn the body to a plant.
        let ports = brain::ports(&child);
        assert_eq!(ports.inputs.len(), 9);
        assert!(ports.inputs.iter().all(|n| n.owner == BODY));
        let histories: Vec<u32> = child.brain.conns.iter().map(|c| c.history).collect();
        assert_eq!(histories, (1..=39).chain(58..=60).collect::<Vec<u32>>());
        assert!(!child.brain.conns.iter().any(names_eye));
        let mut b = Brains::new(2);
        b.express(0, &parent, &p);
        b.express(1, &child, &p);
        assert_eq!((b.n_in[0], b.n_conn[0], b.in_eye[0]), (13, 60, 9));
        assert_eq!((b.n_in[1], b.n_conn[1]), (9, 42));
        assert_eq!(b.in_eye[1], brain::NO_INPUT);
    }
    assert!(blind > 0, "no child of 64 lost the eye");
}

#[test]
fn a_world_with_a_donor_is_the_same_in_a_reload() {
    // The body in slot 5 holds the genome of the body in slot 9, and a child of a cross lives. No
    // pair mates, so that donor is the only one.
    let start = |donor: bool| {
        let mut w = World::new(4, 1536.0, 1024.0);
        w.params.set(id::MIX_RATE, 0.0);
        w.seed_founders(300, 1200);
        w.run(300);
        if donor {
            w.donors[5] = Some((w.creatures.uid[9], w.genomes[9].clone()));
            w.creatures.mixed_with[11] = w.creatures.uid[2];
            w.creatures.cmd_accept[11] = 0.5;
            (w.creatures.mate_size[11], w.creatures.mate_kin[11]) = (0.4, -0.2);
        }
        w
    };
    let (mut unbroken, plain) = (start(true), start(false));
    assert_ne!(unbroken.state_hash(), plain.state_hash());
    let mut resumed = World::load(&unbroken.save()).expect("load");
    assert_eq!(resumed.state_hash(), unbroken.state_hash());
    let (uid, genome) = resumed.donors[5].as_ref().expect("the donor is loaded");
    assert_eq!(*uid, unbroken.creatures.uid[9]);
    assert_eq!(saved(genome), saved(&unbroken.genomes[9]));
    assert_eq!(resumed.donors.iter().flatten().count(), 1);
    let c = &resumed.creatures;
    assert_eq!(
        (
            c.mixed_with[11],
            c.cmd_accept[11],
            c.mate_size[11],
            c.mate_kin[11]
        ),
        (3, 0.5, 0.4, -0.2)
    );

    unbroken.run(600);
    resumed.run(600);
    assert!(unbroken.stats.births > 0, "no birth after the save");
    assert_eq!(resumed.state_hash(), unbroken.state_hash());

    // A body that dies gives up its slot, and the next body in that slot holds no donor.
    let mut w = start(true);
    w.kill(5, 1, None);
    let born = w.spawn(Genome::default(), at(300.0)).expect("slot");
    assert_eq!(born, 5);
    assert!(w.donors[5].is_none());
    assert_eq!(w.creatures.mixed_with[5], 0);

    // The stream of `mate::step` is its own: it is saved, and it moves no other stream.
    let mut moved = start(true);
    moved.rng_mate.0 ^= 1;
    let back = World::load(&moved.save()).expect("load");
    assert_eq!(back.rng_mate.0, moved.rng_mate.0);
    assert_ne!(moved.state_hash(), start(true).state_hash());
}
