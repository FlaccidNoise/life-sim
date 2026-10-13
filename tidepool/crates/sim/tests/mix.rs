//! Crossover: `mix::cross` lines two genomes up by history id and takes each gene from one of them.

use tidepool_sim::brain::{self, EYE_FOOD_A, IN_CONST, OUT_THRUST, OUT_TURN};
use tidepool_sim::genome::{
    BrainGenome, ConnGene, Genome, HiddenGene, Node, PartGene, KIND_EYE, KIND_FIN, MAX_CONN_GENES,
    MAX_HIDDEN, MAX_PART_GENES,
};
use tidepool_sim::mix::cross;
use tidepool_sim::params::{id, Params};
use tidepool_sim::rng::Rng;
use tidepool_sim::snapshot::{Reader, Writer};

/// A founder in which every number differs from that of a founder of another seed. A founder draws
/// no anchor, no `extra`, no alpha, no `egg`, and no `old`, so these are set from the seed.
fn founder(seed: u64) -> Genome {
    let mut g = Genome::founder(&mut Rng::new(seed), &Params::new());
    let own = seed as f32 / 16.0;
    (g.egg, g.old) = (0.3 + own, 3000.0 + own);
    for part in &mut g.parts {
        (part.anchor, part.extra) = (own, own);
    }
    for gene in &mut g.brain.hidden {
        gene.alpha = own;
    }
    for gene in &mut g.brain.outs {
        gene.alpha = own;
    }
    g
}

fn rates(swap: f32, foreign: f32) -> Params {
    let mut p = Params::new();
    p.set(id::MIX_SWAP, swap);
    p.set(id::MIX_FOREIGN, foreign);
    p
}

fn conn(src: Node, dst: Node, weight: f32, history: u32) -> ConnGene {
    ConnGene {
        src,
        dst,
        weight,
        history,
    }
}

/// Three genes that no founder holds, with the ids `first` to `first + 2`: an eye, a hidden
/// neuron, and a connection from a port of the eye to the turn output. Their numbers follow
/// `first`, so the genes of two calls differ in every number.
fn own(first: u32) -> (PartGene, HiddenGene, ConnGene) {
    let v = first as f32 / 1024.0;
    let eye = PartGene {
        kind: KIND_EYE,
        anchor: v,
        size: v,
        extra: v,
        history: first,
    };
    let hidden = HiddenGene {
        id: first + 1,
        bias: v,
        alpha: v,
    };
    let port = Node {
        owner: first,
        port: EYE_FOOD_A,
    };
    let wire = conn(port, Node::body(OUT_TURN), v, first + 2);
    (eye, hidden, wire)
}

/// `g` with the three genes on the ends of its lists.
fn with(mut g: Genome, (part, hidden, wire): (PartGene, HiddenGene, ConnGene)) -> Genome {
    g.parts.push(part);
    g.brain.hidden.push(hidden);
    g.brain.conns.push(wire);
    g
}

/// A genome with this many parts, hidden genes, and connections. Their ids count up from `first`.
fn sized(first: u32, parts: usize, hidden: usize, conns: usize) -> Genome {
    let mut ids = first..;
    let parts = ids.by_ref().take(parts).map(|history| PartGene {
        kind: KIND_FIN,
        anchor: 0.5,
        size: 0.5,
        extra: 0.0,
        history,
    });
    let parts: Vec<PartGene> = parts.collect();
    let hidden = ids.by_ref().take(hidden).map(|id| HiddenGene {
        id,
        bias: 0.0,
        alpha: 1.0,
    });
    let hidden: Vec<HiddenGene> = hidden.collect();
    let (src, dst) = (Node::body(IN_CONST), Node::body(OUT_THRUST));
    let conns = ids.take(conns).map(|history| conn(src, dst, 0.1, history));
    Genome {
        parts,
        brain: BrainGenome {
            hidden,
            conns: conns.collect(),
            ..BrainGenome::default()
        },
        ..Genome::default()
    }
}

/// Every field of a genome, as its saved bytes.
fn saved(g: &Genome) -> Vec<u8> {
    let mut w = Writer::new();
    g.save(&mut w);
    w.bytes
}

/// The sizes of the three lists that have a cap.
fn counts(g: &Genome) -> (usize, usize, usize) {
    (g.parts.len(), g.brain.hidden.len(), g.brain.conns.len())
}

const CAPS: (usize, usize, usize) = (MAX_PART_GENES, MAX_HIDDEN, MAX_CONN_GENES);

#[test]
fn a_cross_with_itself_is_itself() {
    let g = with(founder(1), own(900));
    for p in [Params::new(), rates(1.0, 1.0)] {
        let child = cross(&g, &g, &mut Rng::new(5), &p);
        assert!(saved(&child) == saved(&g), "the child is not its parent");
    }
}

#[test]
fn mix_swap_0_and_mix_foreign_0_give_the_home_genome_and_1_and_1_give_every_donor_value() {
    let home = with(founder(1), own(800));
    let donor = with(founder(2), own(900));

    let child = cross(&home, &donor, &mut Rng::new(5), &rates(0.0, 0.0));
    assert!(saved(&child) == saved(&home), "a gene left the home genome");

    // Each gene that both hold has the donor's numbers. The genes that only the home holds stay
    // where they are, and those that only the donor holds follow them.
    let child = cross(&home, &donor, &mut Rng::new(5), &rates(1.0, 1.0));
    let shared = Genome {
        hue: home.hue,
        ..founder(2)
    };
    let want = with(with(shared, own(800)), own(900));
    assert!(saved(&child) == saved(&want), "a donor value is missing");
}

#[test]
fn genes_line_up_by_history_and_not_by_position() {
    let home = founder(1);
    let mut donor = founder(2);
    donor.parts.reverse();
    donor.brain.hidden.reverse();
    donor.brain.outs.reverse();
    donor.brain.conns.reverse();

    // The donor's numbers, each on the home gene of the same id, in the home's order.
    let child = cross(&home, &donor, &mut Rng::new(5), &rates(1.0, 1.0));
    let want = Genome {
        hue: home.hue,
        ..founder(2)
    };
    assert!(
        saved(&child) == saved(&want),
        "a gene took the numbers of a gene with another id"
    );
}

#[test]
fn a_donor_only_part_brings_its_ports_and_a_connection_from_them_can_follow() {
    let home = founder(1);
    let (eye, hidden, wire) = own(900);
    let donor = with(founder(2), (eye.clone(), hidden, wire.clone()));

    let child = cross(&home, &donor, &mut Rng::new(5), &rates(0.5, 1.0));
    assert_eq!(child.parts.last(), Some(&eye));
    assert_eq!(child.brain.conns.last(), Some(&wire));
    assert_eq!(wire.src.owner, eye.history);

    // The body of the child declares the port, so the connection lives.
    assert!(brain::ports(&child).inputs.contains(&wire.src));
    let mut pruned = child;
    pruned.prune();
    assert!(pruned.brain.conns.contains(&wire));
}

#[test]
fn a_donor_only_connection_with_a_missing_end_does_not_survive_prune() {
    let home = founder(1);
    let mut donor = founder(2);
    let neuron = HiddenGene {
        id: 900,
        bias: 0.0,
        alpha: 1.0,
    };
    let wire = conn(Node::body(IN_CONST), Node::hidden(900), 1.5, 901);
    donor.brain.hidden.push(neuron.clone());
    donor.brain.conns.push(wire.clone());

    let mut dangling = 0;
    for seed in 0..64 {
        let mut child = cross(&home, &donor, &mut Rng::new(seed), &rates(0.5, 0.5));
        let has_neuron = child.brain.hidden.contains(&neuron);
        let has_wire = child.brain.conns.contains(&wire);
        dangling += (has_wire && !has_neuron) as u32;
        child.prune();
        assert_eq!(
            child.brain.conns.contains(&wire),
            has_wire && has_neuron,
            "seed {seed}"
        );
    }
    assert!(
        dangling > 0,
        "no cross took the connection without its neuron"
    );
}

#[test]
fn the_child_keeps_the_home_hue() {
    let (home, donor) = (founder(1), founder(2));
    assert_ne!(home.hue, donor.hue);
    for p in [Params::new(), rates(1.0, 1.0)] {
        for seed in 0..16 {
            let child = cross(&home, &donor, &mut Rng::new(seed), &p);
            assert_eq!(child.hue.to_bits(), home.hue.to_bits());
        }
    }
}

#[test]
fn a_cross_never_passes_a_cap() {
    let donor = sized(5000, MAX_PART_GENES, MAX_HIDDEN, MAX_CONN_GENES);
    assert_eq!(counts(&donor), CAPS);
    // A home with room for 2 parts, 4 hidden genes, and 4 connections, and a home with no room.
    for home in [sized(1000, 10, 60, 380), sized(1000, 12, 64, 384)] {
        let child = cross(&home, &donor, &mut Rng::new(5), &rates(0.5, 1.0));
        // Full, and no more: a gene is taken while there is room.
        assert_eq!(counts(&child), CAPS);
        assert!(Genome::load(&mut Reader::new(&saved(&child))).is_ok());
        for seed in 0..16 {
            let child = cross(&home, &donor, &mut Rng::new(seed), &Params::new());
            let (parts, hidden, conns) = counts(&child);
            assert!(parts <= CAPS.0 && hidden <= CAPS.1 && conns <= CAPS.2);
        }
    }
}

#[test]
fn two_crosses_from_one_generator_state_are_equal() {
    let home = with(founder(1), own(800));
    let donor = with(founder(2), own(900));
    let p = Params::new();
    let (mut a, mut b) = (Rng::new(9), Rng::new(9));
    let (first, second) = (
        cross(&home, &donor, &mut a, &p),
        cross(&home, &donor, &mut b, &p),
    );
    assert!(saved(&first) == saved(&second), "two children differ");
    assert_eq!(a.0, b.0);

    // The draws, in the order of rule X2. In each list: one for each gene that both hold, then
    // one for the gene that only the donor holds, which is its last. The gene that only the home
    // holds makes none.
    let (swap, foreign) = (p.get(id::MIX_SWAP), p.get(id::MIX_FOREIGN));
    let mut replay = Rng::new(9);
    let mut drawn = |rate: f32| replay.unit() < rate;
    let (h, d, c) = (&home, &donor, &first);
    for (ours, theirs, got) in [
        (h.len, d.len, c.len),
        (h.wid, d.wid, c.wid),
        (h.egg, d.egg, c.egg),
        (h.old, d.old, c.old),
    ] {
        assert_ne!(ours, theirs);
        assert_eq!(got == theirs, drawn(swap));
    }
    for k in 0..d.parts.len() - 1 {
        assert_eq!(c.parts[k].anchor == d.parts[k].anchor, drawn(swap));
    }
    assert_eq!(c.parts.len() > h.parts.len(), drawn(foreign));
    let (hh, dh, ch) = (&h.brain.hidden, &d.brain.hidden, &c.brain.hidden);
    for k in 0..dh.len() - 1 {
        assert_eq!(ch[k].alpha == dh[k].alpha, drawn(swap));
    }
    assert_eq!(ch.len() > hh.len(), drawn(foreign));
    for (got, theirs) in c.brain.outs.iter().zip(&d.brain.outs) {
        assert_eq!(got.alpha == theirs.alpha, drawn(swap));
    }
    let (hc, dc, cc) = (&h.brain.conns, &d.brain.conns, &c.brain.conns);
    for k in 0..dc.len() - 1 {
        let from_donor = drawn(swap);
        // The wired weights of two founders are equal.
        if hc[k].weight != dc[k].weight {
            assert_eq!(cc[k].weight == dc[k].weight, from_donor);
        }
    }
    assert_eq!(cc.len() > hc.len(), drawn(foreign));
    assert_eq!(a.0, replay.0, "the cross made a draw that rule X2 does not");
}
