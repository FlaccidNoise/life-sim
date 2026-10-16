// Tests run native only, so a banned float method is safe here.
#![allow(clippy::disallowed_methods)]

use tidepool_sim::brain::{
    self, Brains, EYE_BODY_A, EYE_BODY_B, EYE_FOOD_A, IN_CONST, MAX_CONNS, MAX_NEURONS, OUT_THRUST,
    OUT_TURN,
};
use tidepool_sim::creature::{heft, push_of, side_of, MAX_EYES};
use tidepool_sim::genome::*;
use tidepool_sim::math::sin_cos;
use tidepool_sim::params::{id, Params};
use tidepool_sim::rng::Rng;
use tidepool_sim::snapshot::{LoadError, Reader, Writer};
use tidepool_sim::world::{SpawnAt, World};

/// The table with no founder eye, with every M2 and M3 mutation at rate 0, and with `part_wires`
/// at 0, as it was before Task 13 of the M2 plan and Task 10 of the M3 plan switched them on. A
/// test then sets the one that it tests.
fn off() -> Params {
    let mut p = Params::new();
    p.set(id::FOUNDER_EYE, 0.0);
    for k in M2_RATES.into_iter().chain(M3_RATES).chain([id::PART_WIRES]) {
        p.set(k, 0.0);
    }
    p
}

/// The biases of a brain in the order of its block: the hidden genes, then the outputs.
fn biases(g: &Genome) -> Vec<f32> {
    let hidden = g.brain.hidden.iter().map(|h| h.bias);
    hidden.chain(g.brain.outs.iter().map(|o| o.bias)).collect()
}

/// The alphas, in the same order.
fn alphas(g: &Genome) -> Vec<f32> {
    let hidden = g.brain.hidden.iter().map(|h| h.alpha);
    hidden.chain(g.brain.outs.iter().map(|o| o.alpha)).collect()
}

fn at(x: f32) -> SpawnAt {
    SpawnAt {
        x,
        y: 10.0,
        heading: 0.0,
        growth: 1.0,
        energy01: 1.0,
        parent: 0,
        generation: 0,
        mark: 0,
    }
}

#[test]
fn a_founder_is_the_m1_body_as_parts() {
    let p = off();
    let g = Genome::founder(&mut Rng::new(7), &p);
    let kinds: Vec<u8> = g.parts.iter().map(|x| x.kind).collect();
    assert_eq!(kinds, [KIND_FLAGELLUM, KIND_CILIA, KIND_FILTER, KIND_CHEMO]);
    assert_eq!(g.parts[0].anchor, 1.0);
    assert_eq!(g.egg, p.get(id::BIRTH_GROWTH));
    assert_eq!(g.old, p.get(id::LIFESPAN));
    assert!((g.len - 12.0).abs() < 4.0 && (g.size_of(KIND_FILTER) - 0.6).abs() < 0.3);
}

#[test]
fn founder_eye_adds_a_fifth_part_and_moves_no_other_draw() {
    let mut p = off();
    let (mut plain_rng, mut eyed_rng) = (Rng::new(7), Rng::new(7));
    let plain = Genome::founder(&mut plain_rng, &p);
    p.set(id::FOUNDER_EYE, 0.2);
    let eyed = Genome::founder(&mut eyed_rng, &p);
    assert_eq!(eyed.parts.len(), 5);
    assert_eq!((eyed.parts[4].kind, eyed.parts[4].size), (KIND_EYE, 0.2));
    assert_eq!(eyed.parts[..4], plain.parts[..]);
    assert_eq!(
        (eyed.len, eyed.wid, eyed.hue),
        (plain.len, plain.wid, plain.hue)
    );
    let weights = |g: &Genome| g.brain.conns.iter().map(|c| c.weight).collect::<Vec<_>>();
    // The eye wires are drawn after every draw of the brain with no eye: `brain::starter`. They
    // sit between its first 39 connections and its 3 accept wires.
    assert_eq!(weights(&eyed)[..39], weights(&plain)[..39]);
    assert_eq!(weights(&eyed)[57..60], weights(&plain)[39..42]);
    assert_eq!(biases(&eyed), biases(&plain));
}

#[test]
fn a_founder_holds_the_history_ids_that_the_world_keeps_for_it() {
    let mut p = Params::new();
    p.set(id::FOUNDER_EYE, 0.2);
    let g = Genome::founder(&mut Rng::new(7), &p);
    let conns: Vec<u32> = g.brain.conns.iter().map(|c| c.history).collect();
    let parts: Vec<u32> = g.parts.iter().map(|x| x.history).collect();
    let hidden: Vec<u32> = g.brain.hidden.iter().map(|h| h.id).collect();
    // The wires of the triggers take the ids after the jaw of a hunter.
    assert_eq!(conns, (1..=60).chain(71..=75).collect::<Vec<u32>>());
    assert_eq!(parts, [61, 62, 63, 64, 65]);
    // The 4 hidden genes of the founder take the 4 ids after its parts.
    assert_eq!(hidden, [66, 67, 68, 69]);
    // A hunter holds the rest: its jaw and the 4 wires that chase.
    let mut hunter = g.clone();
    hunter.arm(&p);
    assert_eq!(
        hunter.parts.last().map(|x| x.history),
        Some(FOUNDER_JAW_HISTORY)
    );
    let conns: Vec<u32> = hunter.brain.conns.iter().map(|c| c.history).collect();
    assert_eq!(conns, (1..=60).chain(71..=79).collect::<Vec<u32>>());
    assert_eq!((FOUNDER_JAW_HISTORY, FOUNDER_HISTORIES), (70, 79));
    assert_eq!(World::new(1, 64.0, 64.0).next_history, 80);
}

#[test]
fn the_founder_parts_sum_to_the_reference_sum() {
    let g = Genome::default();
    assert!((g.part_sum(1.0) - REF_PARTS).abs() < 1e-6);
    assert_eq!((REF_WIDTH, REF_AREA), (6.0, 72.0));
}

#[test]
fn set_size_sets_the_first_part_of_a_kind_or_adds_one() {
    let mut g = Genome::default();
    g.set_size(KIND_CILIA, 0.9);
    assert_eq!((g.parts.len(), g.size_of(KIND_CILIA)), (4, 0.9));
    g.set_size(KIND_FIN, 0.5);
    g.set_size(KIND_EYE, 0.3);
    let added: Vec<(u8, f32, f32, f32, u32)> = g.parts[4..]
        .iter()
        .map(|x| (x.kind, x.anchor, x.size, x.extra, x.history))
        .collect();
    let eye = (FOUNDER_EYE_ANCHOR, FOUNDER_EYE_EXTRA);
    assert_eq!(
        added,
        [
            (KIND_FIN, 0.6, 0.5, 0.0, 0),
            (KIND_EYE, eye.0, 0.3, eye.1, 0)
        ]
    );
    // An eye's size is times `eye_cost` in the part sum. The other sizes count once.
    assert!((g.part_sum(2.0) - (0.6 + 0.9 + 0.6 + 0.5 + 0.5 + 2.0 * 0.3)).abs() < 1e-6);
    assert_eq!(g.size_of(KIND_FIN), 0.5);
}

#[test]
fn a_tail_part_pushes_and_a_side_part_does_not() {
    assert_eq!((push_of(1.0), side_of(1.0)), (1.0, 0.0));
    assert_eq!((push_of(0.5), side_of(0.5)), (0.0, 1.0));
    assert_eq!(push_of(0.2), 0.0);
    assert!(push_of(0.75) > 0.2 && push_of(0.75) < 0.3);
}

/// `side_of` is `4a(1 - a)`: a curve, not two straight lines to the middle.
#[test]
fn a_part_between_the_middle_and_an_end_works_across_the_body_by_the_curve() {
    for (anchor, side) in [(0.25, 0.75), (0.75, 0.75), (0.1, 0.36), (0.9, 0.36)] {
        assert!((side_of(anchor) - side).abs() < 1e-6, "at {anchor}");
    }
}

#[test]
fn the_founder_body_has_a_heft_of_one_at_any_part_mass() {
    for part_mass in [0.0, 0.1, 0.5] {
        assert!((heft(REF_PARTS, part_mass) - 1.0).abs() < 1e-6);
    }
    assert!(heft(REF_PARTS + 1.0, 0.1) > 1.0 && heft(0.5, 0.1) < 1.0);
}

#[test]
fn mass_is_the_area_at_part_mass_0_and_follows_the_parts_above_it() {
    let mut w = World::new(1, 256.0, 256.0);
    let mut heavy = Genome::default();
    heavy.set_size(KIND_FIN, 1.0);
    let light = w.spawn(Genome::default(), at(10.0)).expect("slot") as usize;
    let heavy = w.spawn(heavy, at(100.0)).expect("slot") as usize;
    let c = &w.creatures;
    assert_eq!((c.area(light), c.area(heavy)), (72.0, 72.0));
    assert_eq!(
        (c.mass(light, 0.0, 1.0), c.mass(heavy, 0.0, 1.0)),
        (72.0, 72.0)
    );
    assert!((c.mass(light, 0.3, 1.0) - 72.0).abs() < 1e-4);
    assert!((c.mass(heavy, 0.3, 1.0) - 72.0 * 1.93 / 1.63).abs() < 1e-3);
}

#[test]
fn an_eye_makes_a_pair_of_cones_and_a_midline_eye_makes_one() {
    let mut w = World::new(1, 256.0, 256.0);
    let mut g = Genome::default();
    for (anchor, size, extra) in [(0.2, 0.3, 0.4), (0.0, 0.5, 0.0), (1.0, 0.1, 1.0)] {
        g.parts.push(PartGene {
            kind: KIND_EYE,
            anchor,
            size,
            extra,
            history: 0,
        });
    }
    let s = w.spawn(g, at(10.0)).expect("slot") as usize;
    let c = &w.creatures;
    assert_eq!(c.n_eyes[s], 4);
    let pi = std::f32::consts::PI;
    let cones = [
        (0.2 * pi, 0.6f32, 0.3),
        (-0.2 * pi, 0.6, 0.3),
        (0.0, 0.2, 0.5),
        (pi, 1.2, 0.1),
    ];
    for (k, (dir, half, size)) in cones.into_iter().enumerate() {
        let eye = s * MAX_EYES + k;
        assert!((c.eye_dir[eye] - dir).abs() < 1e-6, "cone {k}");
        assert!((c.eye_cos[eye] - half.cos()).abs() < 1e-4, "cone {k}");
        assert_eq!(c.eye_size[eye], size, "cone {k}");
        // The axis of the cone for a heading of 0, which `eye::see` turns by the heading.
        let (sin, cos) = sin_cos(c.eye_dir[eye]);
        assert!((c.eye_ax[eye] - cos).abs() < 1e-6, "cone {k}");
        assert!((c.eye_ay[eye] - sin).abs() < 1e-6, "cone {k}");
    }
    assert!((c.eye_sum[s] - 0.9).abs() < 1e-6);
    // The eyes are not in the plain sum.
    assert_eq!(c.plain_sum[s], Genome::default().part_sum(0.0));
}

#[test]
fn express_is_safe_for_any_genome() {
    let mut w = World::new(1, 256.0, 256.0);
    let mut g = Genome::founder(&mut Rng::new(1), &w.params);
    for i in 0..MAX_PART_GENES {
        let v = [f32::NAN, f32::INFINITY, -1.0, 2.0][i % 4];
        g.parts.push(PartGene {
            kind: KIND_EYE,
            anchor: v,
            size: v,
            extra: v,
            history: 0,
        });
    }
    g.parts.truncate(MAX_PART_GENES);
    let s = w.spawn(g, at(10.0)).expect("slot") as usize;
    let c = &w.creatures;
    assert!(c.n_eyes[s] as usize <= MAX_EYES);
    let sums = [c.plain_sum[s], c.eye_sum[s], c.flag_push[s], c.flag_side[s]];
    assert!(sums.iter().all(|v| v.is_finite()), "{sums:?}");
    assert!(c.mass(s, 0.3, 1.0).is_finite());
    w.run(5); // must not panic
}

/// `spawn` does not check a genome. Parts past `MAX_PART_GENES`, cones past `MAX_EYES`, and a kind
/// that is not a kind must not panic in the tick or in the frame.
#[test]
fn a_genome_that_spawn_did_not_check_is_safe() {
    let mut w = World::new(1, 256.0, 256.0);
    let mut g = Genome::default();
    for i in 0..3 * MAX_PART_GENES {
        g.parts.push(PartGene {
            kind: [KIND_EYE, 0, 9, 255][i % 4],
            anchor: 0.3,
            size: 0.5,
            extra: 0.5,
            history: 0,
        });
    }
    let s = w.spawn(g, at(10.0)).expect("slot") as usize;
    assert_eq!(w.creatures.n_eyes[s] as usize, MAX_EYES);
    assert!((w.creatures.eye_sum[s] - 4.5).abs() < 1e-5);
    assert!(w.possess(1));
    w.run(5);
    tidepool_sim::frame::write(&mut w, 0.0, 0.0, 256.0, 256.0);
    assert_eq!(
        World::load(&w.save()).err(),
        Some(LoadError::Invalid("genome part count"))
    );
}

#[test]
fn a_genome_with_too_many_parts_or_a_bad_kind_does_not_load() {
    let mut w = Writer::new();
    Genome::founder(&mut Rng::new(1), &Params::new()).save(&mut w);
    assert!(Genome::load(&mut Reader::new(&w.bytes)).is_ok());
    // After the 5 floats: the part count, then the kind of the first part.
    let (count_at, kind_at) = (5 * 4, 6 * 4);
    let patched = |at: usize, v: u32| {
        let mut bytes = w.bytes.clone();
        bytes[at..at + 4].copy_from_slice(&v.to_le_bytes());
        Genome::load(&mut Reader::new(&bytes)).err()
    };
    let too_many = MAX_PART_GENES as u32 + 1;
    assert_eq!(
        patched(count_at, too_many),
        Some(LoadError::Invalid("genome part count"))
    );
    for kind in [0, KINDS as u32 + 1, 256 + KIND_EYE as u32] {
        assert_eq!(
            patched(kind_at, kind),
            Some(LoadError::Invalid("genome part kind")),
            "kind {kind}"
        );
    }
    // A world that holds such a genome does not load either.
    let mut world = World::new(1, 256.0, 256.0);
    let mut g = Genome::default();
    g.parts[0].kind = KINDS + 1;
    world.spawn(g, at(10.0)).expect("slot");
    assert_eq!(
        World::load(&world.save()).err(),
        Some(LoadError::Invalid("genome part kind"))
    );
}

#[test]
fn a_full_genome_loads_as_it_was_saved() {
    let mut g = Genome::founder(&mut Rng::new(1), &Params::new());
    while g.parts.len() < MAX_PART_GENES {
        let n = g.parts.len() as u32;
        g.parts.push(PartGene {
            kind: 1 + (n % KINDS as u32) as u8,
            anchor: 0.05 * n as f32,
            size: 0.5,
            extra: 0.25,
            history: 100 + n,
        });
    }
    (g.egg, g.old) = (0.3, 2000.0);
    let mut w = Writer::new();
    g.save(&mut w);
    let mut r = Reader::new(&w.bytes);
    let loaded = Genome::load(&mut r).expect("load");
    assert_eq!(r.end(), Ok(()));
    assert_eq!(loaded.parts, g.parts);
    assert_eq!(
        (loaded.len, loaded.wid, loaded.egg, loaded.old, loaded.hue),
        (g.len, g.wid, 0.3, 2000.0, g.hue)
    );
    assert_eq!(loaded.brain.conns.len(), g.brain.conns.len());
}

const M2_RATES: [usize; 5] = [
    id::MUT_SHAPE_RATE,
    id::MUT_LIFE_RATE,
    id::MUT_PART_REMOVE,
    id::MUT_PART_DUP,
    id::MUT_PART_ADD,
];

/// A founder with an eye, so that the genome has a part that reads `extra`.
fn eyed_founder(rng: &mut Rng) -> Genome {
    let mut p = Params::new();
    p.set(id::FOUNDER_EYE, 0.3);
    Genome::founder(rng, &p)
}

fn saved(g: &Genome) -> Vec<u8> {
    let mut w = Writer::new();
    g.save(&mut w);
    w.bytes
}

#[test]
fn with_every_m2_rate_at_0_a_mutation_makes_the_m1_draws_and_no_more() {
    let g = eyed_founder(&mut Rng::new(7));
    let (mut zero_rng, mut on_rng) = (Rng::new(11), Rng::new(11));
    // The defaults have the M2 rates on. `zero` is the defaults with each of them set to 0. Both
    // have every M3 rate and `part_wires` at 0: the M3 draws come after these and have their own
    // test.
    let (mut zero, mut on) = (Params::new(), Params::new());
    for k in M3_RATES.into_iter().chain([id::PART_WIRES]) {
        zero.set(k, 0.0);
        on.set(k, 0.0);
    }
    for k in M2_RATES {
        zero.set(k, 0.0);
        on.set(k, 1.0);
    }
    let by_zero = g.mutated(&mut zero_rng, &zero, &mut 100);
    let brain = &g.brain;
    // One draw for each weight, and one for the bias and one for the alpha of each neuron that is
    // not an input.
    let brain_draws = brain.conns.len() + 2 * (brain.hidden.len() + brain.outs.len());

    // The M1 draws, stepped by hand at the M1 rates of the defaults: one draw for the chance of
    // each gene and a `gauss` for each hit, in the M1 order, and a `gauss` for the hue. The
    // mutation with every M2 rate at 0 must leave the generator in the same place.
    let (mut stepped, mut hits) = (Rng::new(11), 0);
    let mut step = |rng: &mut Rng, rate: f32, genes: usize| {
        for _ in 0..genes {
            if rng.unit() < rate {
                rng.gauss();
                hits += 1;
            }
        }
    };
    step(&mut stepped, zero.get(id::MUT_RATE), 2 + g.parts.len());
    stepped.gauss();
    step(&mut stepped, zero.get(id::MUT_WEIGHT_RATE), brain_draws);
    assert!(hits > 0, "no gene mutated, so a hit is not tested");
    assert_eq!(zero_rng.0, stepped.0);
    assert_ne!(saved(&by_zero), saved(&g));

    // With the M1 rates at 0 too, the count of draws is known: one for each body gene and each
    // brain number, and four for the hue.
    let mut still = zero.clone();
    still.set(id::MUT_RATE, 0.0);
    still.set(id::MUT_WEIGHT_RATE, 0.0);
    let (mut still_rng, mut counted) = (Rng::new(11), Rng::new(11));
    g.mutated(&mut still_rng, &still, &mut 100);
    for _ in 0..2 + g.parts.len() + 4 + brain_draws {
        counted.next_u64();
    }
    assert_eq!(still_rng.0, counted.0);

    // With the groups on, the generator goes further and every M1 gene is as it was: each new
    // draw comes after every M1 draw. No part is lost here, so the five sizes line up.
    on.set(id::MUT_PART_REMOVE, 0.0);
    let by_on = g.mutated(&mut on_rng, &on, &mut 100);
    assert_ne!(on_rng.0, zero_rng.0);
    let m1 = |g: &Genome| {
        let sizes: Vec<f32> = g.parts[..5].iter().map(|x| x.size).collect();
        let weights: Vec<f32> = g.brain.conns.iter().map(|c| c.weight).collect();
        let (bias, alpha) = (biases(g), alphas(g));
        (g.len, g.wid, g.hue, sizes, weights, bias, alpha)
    };
    assert_eq!(m1(&by_on), m1(&by_zero));
}

#[test]
fn mutation_changes_a_gene() {
    let p = Params::new();
    let mut rng = Rng::new(3);
    let start = Genome::founder(&mut rng, &p);
    let mut g = start.clone();
    for _ in 0..100 {
        g = g.mutated(&mut rng, &p, &mut 100);
    }
    let sizes = |g: &Genome| g.parts.iter().map(|x| x.size).collect::<Vec<_>>();
    assert_ne!(g.len, start.len);
    assert_ne!(sizes(&g), sizes(&start));
}

#[test]
fn add_puts_a_small_new_part_on_the_end_with_a_new_id() {
    let mut p = off();
    p.set(id::MUT_PART_ADD, 1.0);
    let mut rng = Rng::new(5);
    let g = Genome::founder(&mut rng, &p);
    let ids = |g: &Genome| g.parts[..4].iter().map(|x| x.history).collect::<Vec<_>>();
    let mut kinds = [false; KINDS as usize + 1];
    for _ in 0..64 {
        let mut next_history = 100;
        let child = g.mutated(&mut rng, &p, &mut next_history);
        assert_eq!(child.parts.len(), 5);
        let new = &child.parts[4];
        assert!((1..=KINDS).contains(&new.kind));
        // A new Filter is held at 0.2, the least size of a Filter.
        let (lo, hi) = SIZE_RANGE[new.kind as usize];
        assert_eq!(new.size, p.get(id::PART_NEW_SIZE).clamp(lo, hi));
        assert!((0.0..1.0).contains(&new.anchor) && (0.0..1.0).contains(&new.extra));
        assert_eq!((new.history, next_history), (100, 101));
        assert_eq!(ids(&child), ids(&g));
        kinds[new.kind as usize] = true;
    }
    // Every kind comes up: the mutation draws from `ADDABLE_KINDS`, which is `KINDS`.
    assert_eq!(
        kinds,
        [false, true, true, true, true, true, true, true, true, true, true]
    );
}

#[test]
fn a_full_genome_takes_no_more_parts() {
    let mut p = off();
    p.set(id::MUT_PART_ADD, 1.0);
    p.set(id::MUT_PART_DUP, 1.0);
    let mut rng = Rng::new(5);
    let mut g = Genome::founder(&mut rng, &p);
    let mut next_history = 100;
    // Each birth copies one part and adds one, until the list is full.
    for _ in 0..4 {
        g = g.mutated(&mut rng, &p, &mut next_history);
    }
    assert_eq!((g.parts.len(), next_history), (MAX_PART_GENES, 108));
    let child = g.mutated(&mut rng, &p, &mut next_history);
    assert_eq!((child.parts.len(), next_history), (MAX_PART_GENES, 108));
    assert_eq!(child.parts.last().map(|x| x.history), Some(107));
}

#[test]
fn remove_takes_one_part_and_an_empty_list_stays_empty() {
    let mut p = off();
    p.set(id::MUT_PART_REMOVE, 1.0);
    // So that a part that stays is equal to the parent's.
    p.set(id::MUT_RATE, 0.0);
    let mut rng = Rng::new(5);
    let founder = Genome::founder(&mut rng, &p);
    // The slot in `parent` of the one part that `child` lacks, with the others in their order.
    let gone = |parent: &Genome, child: &Genome| {
        let mut slots = (0..parent.parts.len()).filter(|&i| {
            let mut rest = parent.parts.clone();
            rest.remove(i);
            rest == child.parts
        });
        slots.next().expect("the parent's list less one part")
    };
    let mut g = founder.clone();
    for left in (0..4).rev() {
        let child = g.mutated(&mut rng, &p, &mut 100);
        assert_eq!(child.parts.len(), left);
        gone(&g, &child);
        g = child;
    }
    assert!(g.mutated(&mut rng, &p, &mut 100).parts.is_empty());
    // The choice is even: each of the four goes in some birth.
    let mut lost = [false; 4];
    for _ in 0..64 {
        lost[gone(&founder, &founder.mutated(&mut rng, &p, &mut 100))] = true;
    }
    assert_eq!(lost, [true; 4]);
}

#[test]
fn duplicate_copies_kind_size_and_extra_under_a_new_id() {
    let mut p = off();
    p.set(id::MUT_PART_DUP, 1.0);
    let mut rng = Rng::new(5);
    let g = eyed_founder(&mut rng);
    let mut kinds = [false; KINDS as usize + 1];
    let mut moved = false;
    for _ in 0..64 {
        let mut next_history = 100;
        let child = g.mutated(&mut rng, &p, &mut next_history);
        assert_eq!(child.parts.len(), 6);
        let (old, copy) = (&child.parts[..5], &child.parts[5]);
        // The copy of the eye takes a copy of each of the 22 connections that name the eye, with
        // a new id each: the 18 of M3 and the 4 that flee from teeth. No connection names
        // another part.
        let wires = child.brain.conns.len() - g.brain.conns.len();
        assert_eq!(wires, if copy.kind == KIND_EYE { 22 } else { 0 });
        assert_eq!((copy.history, next_history), (100, 101 + wires as u32));
        // The copy is of the part as this birth left it. This founder has one part of each kind.
        let from = old.iter().find(|x| x.kind == copy.kind).expect("a source");
        assert_eq!((copy.size, copy.extra), (from.size, from.extra));
        assert!((0.0..=1.0).contains(&copy.anchor));
        moved |= copy.anchor != from.anchor;
        let ids: Vec<u32> = old.iter().map(|x| x.history).collect();
        assert_eq!(ids, [61, 62, 63, 64, 65]);
        kinds[copy.kind as usize] = true;
    }
    assert!(moved, "no copy moved along the outline");
    // Each of the five parts is copied in some birth. The founder has no Fin and no part of M4.
    assert_eq!(
        kinds,
        [false, true, true, true, true, false, true, false, false, false, false]
    );
    // With no part there is nothing to copy.
    let mut bare = Genome::default();
    bare.parts.clear();
    let mut next_history = 100;
    let child = bare.mutated(&mut rng, &p, &mut next_history);
    assert_eq!((child.parts.len(), next_history), (0, 100));
}

#[test]
fn shape_and_life_genes_move_and_stay_in_range() {
    let mut p = off();
    p.set(id::MUT_SHAPE_RATE, 1.0);
    p.set(id::MUT_LIFE_RATE, 1.0);
    let mut rng = Rng::new(5);
    let start = eyed_founder(&mut rng);
    let mut g = start.clone();
    for _ in 0..200 {
        g = g.mutated(&mut rng, &p, &mut 100);
        for part in &g.parts {
            assert!((0.0..=1.0).contains(&part.anchor));
            assert!((0.0..=1.0).contains(&part.extra));
        }
        assert!((EGG_RANGE.0..=EGG_RANGE.1).contains(&g.egg));
        assert!((OLD_RANGE.0..=OLD_RANGE.1).contains(&g.old));
    }
    let anchors = |g: &Genome| g.parts.iter().map(|x| x.anchor).collect::<Vec<_>>();
    let extras = |g: &Genome| g.parts.iter().map(|x| x.extra).collect::<Vec<_>>();
    assert_ne!(anchors(&g), anchors(&start));
    assert!(g.egg != start.egg && g.old != start.old);
    // Only an eye reads `extra`, and only an eye's `extra` moves.
    assert_eq!(extras(&g)[..4], extras(&start)[..4]);
    assert_ne!(extras(&g)[4], extras(&start)[4]);
}

const M3_RATES: [usize; 4] = [
    id::MUT_CONN_REMOVE,
    id::MUT_NEURON_REMOVE,
    id::MUT_CONN_ADD,
    id::MUT_NEURON_ADD,
];

/// The table with every mutation at rate 0 and no founder eye. A child then differs from its
/// parent by its hue and by the one rule that a test switches on.
fn quiet() -> Params {
    let mut p = off();
    p.set(id::MUT_RATE, 0.0);
    p.set(id::MUT_WEIGHT_RATE, 0.0);
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

fn hidden_genes(ids: std::ops::Range<u32>) -> Vec<HiddenGene> {
    let gene = |id| HiddenGene {
        id,
        bias: 0.0,
        alpha: 1.0,
    };
    ids.map(gene).collect()
}

/// What a connection can run into: the hidden neurons, then the outputs that the body declares.
fn targets(g: &Genome) -> Vec<Node> {
    let hidden = g.brain.hidden.iter().map(|h| Node::hidden(h.id));
    hidden.chain(brain::ports(g).outputs).collect()
}

/// Every neuron that the genome declares: the inputs, then the targets.
fn declared(g: &Genome) -> Vec<Node> {
    let mut all = brain::ports(g).inputs;
    all.extend(targets(g));
    all
}

/// A connection for each pair of a declared neuron and a target, with histories from 1.
fn every_pair(g: &Genome) -> Vec<ConnGene> {
    let (sources, ends) = (declared(g), targets(g));
    let all = sources
        .iter()
        .flat_map(|&s| ends.iter().map(move |&t| (s, t)));
    (1..)
        .zip(all)
        .map(|(h, (s, t))| conn(s, t, 0.5, h))
        .collect()
}

/// The two ends of each connection, sorted.
fn pairs(g: &Genome) -> Vec<(Node, Node)> {
    let mut pairs: Vec<(Node, Node)> = g.brain.conns.iter().map(|c| (c.src, c.dst)).collect();
    pairs.sort_unstable();
    pairs
}

/// True if an end of the connection belongs to this owner.
fn names(c: &ConnGene, owner: u32) -> bool {
    c.src.owner == owner || c.dst.owner == owner
}

/// The draws of a mutation with every rate at 0: one for each body gene and each brain number, and
/// four for the hue.
fn m1_draws(g: &Genome) -> usize {
    let b = &g.brain;
    2 + g.parts.len() + 4 + b.conns.len() + 2 * (b.hidden.len() + b.outs.len())
}

/// The state of a generator after this many draws.
fn after(mut rng: Rng, draws: usize) -> u64 {
    for _ in 0..draws {
        rng.next_u64();
    }
    rng.0
}

/// The largest weight that `gauss * new_conn_sigma` can give.
fn new_weight_limit(p: &Params) -> f32 {
    2.0 * 1.732_050_8 * p.get(id::NEW_CONN_SIGMA) + 1e-6
}

#[test]
fn with_every_m3_rate_at_0_a_mutation_makes_the_m2_draws() {
    // A founder with no eye, so that no connection names a part in any layout of `brain::ports`.
    let g = Genome::founder(&mut Rng::new(7), &off());
    // `zero`: every M1 rate at 0, every M2 group at 1, every M3 rate and `part_wires` at 0. `on`:
    // the M3 rules as well.
    let mut zero = quiet();
    for k in M2_RATES {
        zero.set(k, 1.0);
    }
    let mut on = zero.clone();
    for k in M3_RATES {
        on.set(k, 1.0);
    }
    on.set(id::PART_WIRES, 2.0);

    // The count of the M2 draws is known here. Shape: a chance and a `gauss` for each of the 4
    // anchors. Life: the same for `egg` and `old`. Remove: a chance and a choice. Duplicate: a
    // chance, a choice, and a `gauss`. Add: a chance, a kind, an anchor, and an `extra`.
    let m2_draws = m1_draws(&g) + 4 * 5 + 2 * 5 + 2 + 6 + 4;
    let (mut zero_rng, mut next_history) = (Rng::new(11), 100);
    let by_zero = g.mutated(&mut zero_rng, &zero, &mut next_history);
    assert_eq!(zero_rng.0, after(Rng::new(11), m2_draws));
    // The copy and the new part take one id each. Nothing in the brain takes one.
    assert_eq!((by_zero.parts.len(), next_history), (5, 102));
    assert_eq!(by_zero.brain.conns, g.brain.conns);
    assert_eq!(by_zero.brain.hidden, g.brain.hidden);
    assert_eq!(by_zero.brain.outs, g.brain.outs);

    // With the M3 rules on, the generator goes further and every M2 gene is as it was: each new
    // draw comes after every M2 draw.
    let m2 = |g: &Genome| (g.len, g.wid, g.egg, g.old, g.hue, g.parts.clone());
    let mut on_rng = Rng::new(11);
    let by_on = g.mutated(&mut on_rng, &on, &mut 100);
    assert_ne!(on_rng.0, zero_rng.0);
    assert_eq!(m2(&by_on), m2(&by_zero));
    assert_ne!(pairs(&by_on), pairs(&by_zero));

    // The same at the rates of the defaults, where a draw decides whether the next is made.
    let (mut zero, mut on) = (Params::new(), Params::new());
    for k in M3_RATES {
        zero.set(k, 0.0);
        on.set(k, 1.0);
    }
    zero.set(id::PART_WIRES, 0.0);
    on.set(id::PART_WIRES, 2.0);
    let g = eyed_founder(&mut Rng::new(7));
    // The connections that name no part of the parent or of the genome, without their weights. A
    // child that lost a part still holds the connections of that part: `prune` has not run.
    let of_the_body = |child: &Genome| {
        let part = |c: &ConnGene| {
            let owners = g.parts.iter().chain(&child.parts).map(|x| x.history);
            owners.filter(|&o| o != BODY).any(|o| names(c, o))
        };
        let rest = child.brain.conns.iter().filter(|c| !part(c));
        rest.map(|c| (c.src, c.dst, c.history)).collect::<Vec<_>>()
    };
    let ids = |g: &Genome| g.brain.hidden.iter().map(|h| h.id).collect::<Vec<_>>();
    for seed in 0..200 {
        let by_zero = g.mutated(&mut Rng::new(seed), &zero, &mut 100);
        let by_on = g.mutated(&mut Rng::new(seed), &on, &mut 100);
        assert_eq!(m2(&by_on), m2(&by_zero), "seed {seed}");
        // The structure of the brain is the parent's. Only the copy of a part can add to the
        // list, and only connections that name the copy.
        assert_eq!(ids(&by_zero), ids(&g), "seed {seed}");
        assert_eq!(of_the_body(&by_zero), of_the_body(&g), "seed {seed}");
    }
}

#[test]
fn a_removed_connection_is_gone_and_the_others_keep_their_history() {
    let mut p = quiet();
    p.set(id::MUT_CONN_REMOVE, 1.0);
    let mut rng = Rng::new(5);
    let g = Genome::founder(&mut rng, &p);
    let count = g.brain.conns.len();
    let mut lost = vec![false; count];
    for _ in 0..40 * count {
        let mut next_history = 100;
        let child = g.mutated(&mut rng, &p, &mut next_history);
        assert_eq!((child.brain.conns.len(), next_history), (count - 1, 100));
        // The one slot whose loss gives the child's list: the others are equal, in their order.
        let gone = (0..count).find(|&i| {
            let mut rest = g.brain.conns.clone();
            rest.remove(i);
            rest == child.brain.conns
        });
        lost[gone.expect("the parent's list less one connection")] = true;
        assert_eq!(child.brain.hidden, g.brain.hidden);
    }
    // The choice is even: each connection goes in some birth.
    assert!(lost.iter().all(|&l| l), "{lost:?}");

    // A brain with no connection loses none.
    let bare = Genome::default();
    assert!(bare.brain.conns.is_empty());
    assert!(bare.mutated(&mut rng, &p, &mut 100).brain.conns.is_empty());
}

#[test]
fn a_removed_hidden_neuron_takes_its_connections() {
    let mut p = quiet();
    p.set(id::MUT_NEURON_REMOVE, 1.0);
    let mut rng = Rng::new(5);
    let mut g = Genome::founder(&mut rng, &p);
    // A loop, and a connection each way between two hidden neurons: a name can be at either end.
    let (a, b) = (
        Node::hidden(g.brain.hidden[0].id),
        Node::hidden(g.brain.hidden[1].id),
    );
    g.brain.conns.extend([
        conn(a, a, 0.5, 900),
        conn(a, b, 0.5, 901),
        conn(b, a, 0.5, 902),
    ]);
    let mut lost = [false; 4];
    for _ in 0..64 {
        let mut next_history = 100;
        let child = g.mutated(&mut rng, &p, &mut next_history);
        assert_eq!((child.brain.hidden.len(), next_history), (3, 100));
        let gone = (0..4).find(|&i| {
            let mut rest = g.brain.hidden.clone();
            rest.remove(i);
            rest == child.brain.hidden
        });
        let gone = gone.expect("the parent's list less one hidden gene");
        lost[gone] = true;
        // Each connection that named it is gone, before any `prune`. The others stay in order.
        let owner = g.brain.hidden[gone].id;
        let rest: Vec<ConnGene> = (g.brain.conns.iter())
            .filter(|c| !names(c, owner))
            .cloned()
            .collect();
        assert!(rest.len() < g.brain.conns.len());
        assert_eq!(child.brain.conns, rest);
    }
    assert_eq!(lost, [true; 4]);

    // A brain with no hidden neuron loses none, and keeps its connections.
    for _ in 0..4 {
        g = g.mutated(&mut rng, &p, &mut 100);
    }
    assert!(g.brain.hidden.is_empty());
    let child = g.mutated(&mut rng, &p, &mut 100);
    assert!(child.brain.hidden.is_empty());
    assert_eq!(child.brain.conns, g.brain.conns);
    assert!(!g.brain.conns.is_empty());
}

#[test]
fn an_added_connection_has_a_new_history_and_joins_two_declared_neurons() {
    let mut p = quiet();
    p.set(id::MUT_CONN_ADD, 1.0);
    let mut rng = Rng::new(5);
    let g = Genome::founder(&mut rng, &p);
    let (targets, declared) = (targets(&g), declared(&g));
    let brain::Ports { inputs, outputs } = brain::ports(&g);
    let count = g.brain.conns.len();
    // What came up: a source that is an input, a hidden neuron, an output. A target that is a
    // hidden neuron, an output. A loop on one neuron. A pair that was joined already.
    let mut seen = [false; 7];
    for _ in 0..400 {
        let mut next_history = 100;
        let child = g.mutated(&mut rng, &p, &mut next_history);
        assert_eq!(child.brain.conns[..count], g.brain.conns[..]);
        assert_eq!(child.brain.hidden, g.brain.hidden);
        let Some(new) = child.brain.conns.get(count) else {
            assert_eq!(next_history, 100);
            seen[6] = true;
            continue;
        };
        assert_eq!((child.brain.conns.len(), next_history), (count + 1, 101));
        assert_eq!(new.history, 100);
        assert!(declared.contains(&new.src) && targets.contains(&new.dst));
        assert!(!pairs(&g).contains(&(new.src, new.dst)));
        assert!(new.weight != 0.0 && new.weight.abs() <= new_weight_limit(&p));
        seen[0] |= inputs.contains(&new.src);
        seen[1] |= new.src.port == PORT_HIDDEN;
        seen[2] |= outputs.contains(&new.src);
        seen[3] |= new.dst.port == PORT_HIDDEN;
        seen[4] |= outputs.contains(&new.dst);
        seen[5] |= new.src == new.dst;
    }
    assert_eq!(seen, [true; 7]);
}

#[test]
fn no_second_connection_joins_one_pair() {
    let mut p = quiet();
    p.set(id::MUT_CONN_ADD, 1.0);
    // A brain in which every pair is joined takes no connection. The draws are made: a chance,
    // a source, a target, and a `gauss`, after the M1 draws.
    let mut g = Genome::default();
    g.brain.conns = every_pair(&g);
    let (mut rng, mut next_history) = (Rng::new(5), 1000);
    let child = g.mutated(&mut rng, &p, &mut next_history);
    assert_eq!(child.brain.conns, g.brain.conns);
    assert_eq!(next_history, 1000);
    assert_eq!(rng.0, after(Rng::new(5), m1_draws(&g) + 1 + 2 + 4));

    // A line of births fills every pair of a founder brain once, and no pair twice.
    let mut g = Genome::founder(&mut rng, &p);
    let full = declared(&g).len() * targets(&g).len();
    assert!(g.brain.conns.len() < full && full <= MAX_CONN_GENES);
    for _ in 0..5000 {
        g = g.mutated(&mut rng, &p, &mut next_history);
        let mut once = pairs(&g);
        once.dedup();
        assert_eq!(once.len(), g.brain.conns.len());
    }
    assert_eq!(g.brain.conns.len(), full);
}

#[test]
fn a_split_keeps_the_old_weight_on_the_way_out_and_1_on_the_way_in() {
    let mut p = quiet();
    p.set(id::MUT_NEURON_ADD, 1.0);
    let mut rng = Rng::new(5);
    let g = Genome::founder(&mut rng, &p);
    let (count, hidden) = (g.brain.conns.len(), g.brain.hidden.len());
    let mut split = vec![false; count];
    for _ in 0..40 * count {
        let mut next_history = 100;
        let child = g.mutated(&mut rng, &p, &mut next_history);
        assert_eq!(next_history, 103);
        assert_eq!(child.brain.hidden[..hidden], g.brain.hidden[..]);
        assert_eq!(child.brain.hidden[hidden..], hidden_genes(100..101)[..]);
        assert_eq!(child.brain.conns.len(), count + 1);
        // The one connection that the child lacks. The others are equal, in their order.
        let gone = (0..count).find(|&i| {
            let mut rest = g.brain.conns.clone();
            rest.remove(i);
            rest == child.brain.conns[..count - 1]
        });
        let gone = gone.expect("the parent's list less one connection");
        split[gone] = true;
        let (old, new) = (&g.brain.conns[gone], Node::hidden(100));
        let way_in = conn(old.src, new, 1.0, 101);
        let way_out = conn(new, old.dst, old.weight, 102);
        assert_eq!(child.brain.conns[count - 1..], [way_in, way_out]);
    }
    // The choice is even: each connection is split in some birth.
    assert!(split.iter().all(|&s| s), "{split:?}");

    // A brain with no connection has nothing to split.
    let mut next_history = 100;
    let child = Genome::default().mutated(&mut rng, &p, &mut next_history);
    assert!(child.brain.hidden.is_empty() && child.brain.conns.is_empty());
    assert_eq!(next_history, 100);
}

/// Thrust and turn after the brain has settled on one value at every input.
fn outputs(g: &Genome, p: &Params, input: f32) -> [f32; 2] {
    let mut b = Brains::new(1);
    b.express(0, g, p);
    for _ in 0..8 {
        b.inputs_mut(0).fill(input);
        b.step_one(0);
    }
    [b.output(0, OUT_THRUST), b.output(0, OUT_TURN)]
}

#[test]
fn a_split_brain_gives_nearly_the_same_output_for_a_small_input() {
    let mut p = quiet();
    p.set(id::MUT_NEURON_ADD, 1.0);
    let mut rng = Rng::new(5);
    let g = Genome::founder(&mut rng, &p);
    let whole = outputs(&g, &p, 0.1);
    assert!(whole[0] > 0.05 && whole[1].abs() > 0.05, "{whole:?}");
    let mut moved = false;
    for _ in 0..400 {
        let child = g.mutated(&mut rng, &p, &mut 100);
        assert_eq!(child.brain.hidden.len(), g.brain.hidden.len() + 1);
        // A new neuron passes a small value on as it is: `act(x)` is near `x` close to 0.
        let split = outputs(&child, &p, 0.1);
        for (was, is) in whole.iter().zip(split) {
            assert!((was - is).abs() < 1e-3, "{whole:?} against {split:?}");
        }
        // It is not the same brain. At a large input the new neuron holds its value back.
        moved |= outputs(&child, &p, 1.0) != outputs(&g, &p, 1.0);
    }
    assert!(moved, "no split changed an output at a large input");
}

#[test]
fn a_new_eye_arrives_with_part_wires_connections_from_its_own_ports() {
    let mut p = quiet();
    p.set(id::MUT_PART_ADD, 1.0);
    let plain_p = p.clone();
    p.set(id::PART_WIRES, 2.0);
    let g = Genome::founder(&mut Rng::new(5), &p);
    let (count, before) = (g.brain.conns.len(), brain::ports(&g).inputs);
    let (mut eyes, mut wired_eyes) = (0, 0);
    for seed in 0..400 {
        let (mut rng, mut plain_rng, mut next_history) = (Rng::new(seed), Rng::new(seed), 100);
        let child = g.mutated(&mut rng, &p, &mut next_history);
        let plain = g.mutated(&mut plain_rng, &plain_p, &mut 100);
        // The wires move no draw of the part, and with `part_wires` at 0 there is none.
        assert_eq!(child.parts, plain.parts);
        assert_eq!(plain.brain.conns, g.brain.conns);
        let part = child.parts.last().expect("a new part");
        assert_eq!((child.parts.len(), part.history), (5, 100));
        // The ports that the body declares with the part and not without it.
        let ports: Vec<Node> = (brain::ports(&child).inputs.into_iter())
            .filter(|n| !before.contains(n))
            .collect();
        let new = &child.brain.conns[count..];
        assert_eq!(child.brain.conns[..count], g.brain.conns[..]);
        eyes += (part.kind == KIND_EYE) as u32;
        if brain::ports(&child).outputs != brain::ports(&g).outputs {
            // A jaw or a gland declares an output: `a_new_jaw_arrives_with_part_wires_into_lunge`.
            continue;
        }
        if ports.is_empty() {
            // A part with no port of its own arrives with no wire and makes no draw.
            assert!(new.is_empty());
            assert_eq!((next_history, rng.0), (101, plain_rng.0));
            continue;
        }
        // Each wire draws a source, a target, and a `gauss`. Two wires that join one pair make one
        // connection, so the first always arrives.
        assert_eq!(rng.0, after(plain_rng, 2 * (1 + 1 + 4)));
        assert!((1..=2).contains(&new.len()));
        assert_eq!(next_history, 101 + new.len() as u32);
        for (wire, history) in new.iter().zip(101..) {
            assert_eq!(wire.history, history);
            assert!(ports.contains(&wire.src) && targets(&child).contains(&wire.dst));
            assert!(wire.weight.abs() <= new_weight_limit(&p));
        }
        if part.kind == KIND_EYE {
            // The ports of an eye are its own: their owner is the history of its gene.
            assert!(ports.iter().all(|n| n.owner == part.history));
            wired_eyes += (new.len() == 2) as u32;
        }
    }
    assert!(eyes > 0, "no birth added an eye");
    // In the layout of M2 no part declares a port, so no eye is wired. Once `brain::ports` gives
    // an eye its ports, an eye arrives with both wires in some birth.
    let mut eyed = g.clone();
    eyed.set_size(KIND_EYE, 0.1);
    eyed.parts[4].history = 100;
    let eye_has_ports = brain::ports(&eyed).inputs.len() > before.len();
    assert_eq!(wired_eyes > 0, eye_has_ports);
}

/// One eye and one hidden neuron, with two connections that name the eye and one that does not.
fn one_eyed() -> Genome {
    let eye = PartGene {
        kind: KIND_EYE,
        anchor: 0.3,
        size: 0.5,
        extra: 0.5,
        history: 500,
    };
    let mut g = Genome {
        parts: vec![eye],
        ..Genome::default()
    };
    g.brain.hidden = hidden_genes(700..701);
    let port = |port| Node { owner: 500, port };
    g.brain.conns = vec![
        conn(port(EYE_FOOD_A), Node::body(OUT_TURN), 0.7, 600),
        conn(Node::body(IN_CONST), Node::body(OUT_THRUST), 0.9, 601),
        conn(port(EYE_BODY_B), Node::hidden(700), -0.3, 602),
    ];
    g
}

#[test]
fn a_copied_eye_gets_a_copy_of_each_wire_with_a_new_history() {
    let mut p = quiet();
    p.set(id::MUT_PART_DUP, 1.0);
    let g = one_eyed();
    let (mut rng, mut next_history) = (Rng::new(5), 1000);
    let child = g.mutated(&mut rng, &p, &mut next_history);
    let ids: Vec<u32> = child.parts.iter().map(|x| x.history).collect();
    assert_eq!(ids, [500, 1000]);
    let port = |port| Node { owner: 1000, port };
    let copies = [
        conn(port(EYE_FOOD_A), Node::body(OUT_TURN), 0.7, 1001),
        conn(port(EYE_BODY_B), Node::hidden(700), -0.3, 1002),
    ];
    assert_eq!(child.brain.conns[..3], g.brain.conns[..]);
    assert_eq!(child.brain.conns[3..], copies);
    assert_eq!(next_history, 1003);
    // No draw: the generator is where the copy of the part left it.
    assert_eq!(rng.0, after(Rng::new(5), m1_draws(&g) + 1 + 1 + 4));

    // A part with history 0 owns no port: 0 is the body. Its copy takes no connection.
    let mut g = Genome::default();
    g.parts.clear();
    g.set_size(KIND_FIN, 0.5);
    assert_eq!(g.parts[0].history, BODY);
    g.brain.conns = vec![conn(Node::body(IN_CONST), Node::body(OUT_THRUST), 0.9, 601)];
    let mut next_history = 1000;
    let child = g.mutated(&mut rng, &p, &mut next_history);
    assert_eq!((child.parts.len(), next_history), (2, 1001));
    assert_eq!(child.brain.conns, g.brain.conns);
}

#[test]
fn a_lost_part_leaves_no_connection_behind_after_prune() {
    let mut p = quiet();
    p.set(id::MUT_PART_REMOVE, 1.0);
    let mut rng = Rng::new(5);
    let mut g = eyed_founder(&mut rng);
    let eye = g.parts[4].history;
    let port = Node {
        owner: eye,
        port: EYE_BODY_A,
    };
    g.brain
        .conns
        .push(conn(port, Node::body(OUT_THRUST), 0.5, 900));
    // What the body holds while it has every part.
    let mut whole = g.clone();
    whole.prune(-1.0);
    let mut lost_eye = false;
    for _ in 0..64 {
        let mut child = g.mutated(&mut rng, &p, &mut 1000);
        // The mutation leaves the wires of the part to `prune`.
        assert_eq!(child.brain.conns, g.brain.conns);
        let gone = g.parts.iter().find(|x| !child.parts.contains(x));
        let gone = gone.expect("one part is lost").history;
        child.prune(-1.0);
        assert!(child.brain.conns.iter().all(|c| !names(c, gone)));
        if gone == eye {
            lost_eye = true;
            // Every connection that did not name the eye stays.
            let rest: Vec<ConnGene> = (whole.brain.conns.iter())
                .filter(|c| !names(c, eye))
                .cloned()
                .collect();
            assert_eq!(child.brain.conns, rest);
            assert!(!rest.is_empty());
        }
    }
    assert!(lost_eye, "no birth lost the eye");
}

#[test]
fn a_full_brain_takes_no_neuron_and_no_connection() {
    let mut p = quiet();
    p.set(id::MUT_NEURON_ADD, 1.0);
    let mut rng = Rng::new(5);
    // `MAX_HIDDEN` hidden genes: no connection is split. Only the chance is drawn.
    let mut g = Genome::founder(&mut rng, &p);
    g.brain.hidden = hidden_genes(2000..2000 + MAX_HIDDEN as u32);
    let (mut one, mut next_history) = (Rng::new(9), 100);
    let child = g.mutated(&mut one, &p, &mut next_history);
    assert_eq!((child.brain.hidden.len(), next_history), (MAX_HIDDEN, 100));
    assert_eq!(child.brain.conns, g.brain.conns);
    assert_eq!(one.0, after(Rng::new(9), m1_draws(&g) + 1));

    // `MAX_CONN_GENES` connections: none is added, and none is split, since a split makes one
    // more. Only the two chances are drawn.
    p.set(id::MUT_CONN_ADD, 1.0);
    g.brain.hidden.truncate(32);
    g.brain.conns = every_pair(&g);
    assert!(g.brain.conns.len() > MAX_CONN_GENES);
    g.brain.conns.truncate(MAX_CONN_GENES);
    let mut one = Rng::new(9);
    let child = g.mutated(&mut one, &p, &mut next_history);
    assert_eq!((child.brain.hidden.len(), next_history), (32, 100));
    assert_eq!(child.brain.conns, g.brain.conns);
    assert_eq!(one.0, after(Rng::new(9), m1_draws(&g) + 2));

    // Nor does a part bring one: not the copy of an eye that has a wire, and not a new part.
    g.set_size(KIND_EYE, 0.3);
    g.parts[4].history = 500;
    g.brain.conns[0].src = Node {
        owner: 500,
        port: EYE_FOOD_A,
    };
    p.set(id::MUT_PART_DUP, 1.0);
    p.set(id::MUT_PART_ADD, 1.0);
    p.set(id::PART_WIRES, 8.0);
    let mut copied_eye = false;
    for _ in 0..64 {
        let mut next_history = 100;
        let child = g.mutated(&mut rng, &p, &mut next_history);
        assert_eq!(child.brain.conns, g.brain.conns);
        // Only the two new parts take an id.
        assert_eq!((child.parts.len(), next_history), (7, 102));
        copied_eye |= child.parts[5].kind == KIND_EYE;
    }
    assert!(copied_eye, "no birth copied the eye");
}

#[test]
fn a_thousand_mutations_at_high_rates_always_load_and_express() {
    let mut p = Params::new();
    let rates = [
        (id::MUT_PART_ADD, 0.5),
        (id::MUT_PART_DUP, 0.5),
        (id::MUT_PART_REMOVE, 0.3),
        (id::MUT_CONN_ADD, 1.0),
        (id::MUT_NEURON_ADD, 1.0),
        (id::MUT_CONN_REMOVE, 0.2),
        (id::MUT_NEURON_REMOVE, 0.03),
        (id::PART_WIRES, 8.0),
    ];
    for (k, rate) in rates {
        p.set(k, rate);
    }
    let mut rng = Rng::new(5);
    let mut g = eyed_founder(&mut rng);
    let mut next_history = FOUNDER_HISTORIES + 1;
    let mut brains = Brains::new(1);
    let (mut most_hidden, mut most_conns, mut shrank) = (0, 0, false);
    for birth in 0..1000 {
        let before: Vec<u32> = g.brain.hidden.iter().map(|h| h.id).collect();
        // As `repro::step` makes a child.
        g = g.mutated(&mut rng, &p, &mut next_history);
        g.prune(-1.0);
        let (hidden, conns) = (g.brain.hidden.len(), g.brain.conns.len());
        assert!(g.parts.len() <= MAX_PART_GENES, "birth {birth}");
        assert!(
            hidden <= MAX_HIDDEN && conns <= MAX_CONN_GENES,
            "birth {birth}"
        );
        most_hidden = most_hidden.max(hidden);
        most_conns = most_conns.max(conns);
        shrank |= (before.iter()).any(|id| g.brain.hidden.iter().all(|h| h.id != *id));
        let mut once = pairs(&g);
        once.dedup();
        assert_eq!(once.len(), conns, "birth {birth}");
        // No two genes share a number.
        let mut ids: Vec<u32> = (g.parts.iter().map(|x| x.history))
            .chain(g.brain.hidden.iter().map(|h| h.id))
            .chain(g.brain.conns.iter().map(|c| c.history))
            .collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), g.parts.len() + hidden + conns, "birth {birth}");

        let bytes = saved(&g);
        let back = Genome::load(&mut Reader::new(&bytes)).expect("the child loads");
        assert_eq!(saved(&back), bytes, "birth {birth}");
        // A living genome holds what its body expresses: every gene is in the block, but for the
        // hidden genes past its room and their connections. Since M4 the ports of a body can take
        // that room: 35 inputs and 6 outputs leave 55 of `MAX_HIDDEN` 64.
        brains.express(0, &back, &p);
        let neurons = brains.n_neur[0] as usize;
        assert!(
            neurons <= MAX_NEURONS && conns <= MAX_CONNS,
            "birth {birth}"
        );
        let in_out = (brains.n_in[0] + brains.n_out[0]) as usize;
        let room = MAX_NEURONS - in_out;
        assert_eq!(neurons - in_out, hidden.min(room), "birth {birth}");
        if hidden <= room {
            assert_eq!(brains.n_conn[0] as usize, conns, "birth {birth}");
        }
        for _ in 0..3 {
            brains.inputs_mut(0).fill(0.5);
            brains.step_one(0);
        }
        assert!(brains.output(0, OUT_THRUST).is_finite(), "birth {birth}");
    }
    // The line reached both caps, and a brain lost a neuron in some birth.
    assert_eq!((most_hidden, most_conns), (MAX_HIDDEN, MAX_CONN_GENES));
    assert!(shrank, "no birth lost a hidden neuron");
}

#[test]
fn a_new_jaw_arrives_with_part_wires_into_lunge() {
    let mut p = quiet();
    p.set(id::MUT_PART_ADD, 1.0);
    let plain_p = p.clone();
    p.set(id::PART_WIRES, 2.0);
    let g = Genome::founder(&mut Rng::new(5), &p);
    let count = g.brain.conns.len();
    let before = brain::ports(&g).outputs;
    let (mut jaws, mut glands) = (0, 0);
    for seed in 0..400 {
        let (mut rng, mut plain_rng, mut next_history) = (Rng::new(seed), Rng::new(seed), 100);
        let child = g.mutated(&mut rng, &p, &mut next_history);
        let plain = g.mutated(&mut plain_rng, &plain_p, &mut 100);
        assert_eq!(child.parts, plain.parts);
        let part = child.parts.last().expect("a new part");
        let ports = brain::ports(&child);
        let outputs: Vec<Node> = (ports.outputs.iter())
            .filter(|n| !before.contains(n))
            .copied()
            .collect();
        let new = &child.brain.conns[count..];
        match part.kind {
            KIND_JAW => {
                assert_eq!(outputs, [Node::body(brain::OUT_LUNGE)]);
                jaws += 1;
            }
            KIND_TOXIN => {
                assert_eq!(outputs, [Node::body(brain::OUT_TOXIN)]);
                glands += 1;
            }
            // The founder has a flagellum, so a new one declares nothing new.
            _ => assert!(outputs.is_empty(), "{}", part.kind),
        }
        if outputs.is_empty() {
            continue;
        }
        // Each wire draws a source and a `gauss`: no target, since the output is the target.
        // Two wires that join one pair make one connection, so the first always arrives.
        assert_eq!(rng.0, after(plain_rng, 2 * (1 + 4)));
        assert!((1..=2).contains(&new.len()));
        assert_eq!(next_history, 101 + new.len() as u32);
        let hidden = g.brain.hidden.iter().map(|h| Node::hidden(h.id));
        let sources: Vec<Node> = ports.inputs.iter().copied().chain(hidden).collect();
        for (wire, history) in new.iter().zip(101..) {
            assert_eq!((wire.history, wire.dst), (history, outputs[0]));
            assert!(sources.contains(&wire.src));
            assert!(wire.weight.abs() <= new_weight_limit(&p));
        }
    }
    assert!(jaws > 0 && glands > 0, "{jaws} jaws, {glands} glands");
}

#[test]
fn with_founder_jaw_0_no_founder_draw_is_added() {
    // The draws of `seed_founders` as the M3 rule makes them: a genome, 8 places of 3 draws, a
    // heading, and an age.
    let p = Params::new();
    assert_eq!(p.get(id::FOUNDER_JAW), 0.0);
    let mut w = World::new(3, 1536.0, 1024.0);
    let mut rng = w.rng_spawn.clone();
    w.seed_founders(5, 0);
    let mut genomes = Vec::new();
    for _ in 0..5 {
        genomes.push(Genome::founder(&mut rng, &p));
        for _ in 0..8 * 3 + 2 {
            rng.next_u64();
        }
    }
    assert_eq!(w.rng_spawn.0, rng.0);
    for (s, g) in genomes.iter().enumerate() {
        assert_eq!((w.genomes[s].len, w.genomes[s].hue), (g.len, g.hue));
        assert_eq!(w.genomes[s].parts, g.parts);
    }
    // Above 0, each founder makes one draw more, after its genome. The first genome is the same.
    let mut jaw = World::new(3, 1536.0, 1024.0);
    jaw.params.set(id::FOUNDER_JAW, 1e-9);
    jaw.seed_founders(5, 0);
    assert_eq!(jaw.rng_spawn.0, after(w.rng_spawn.clone(), 5));
    assert_eq!(jaw.genomes[0].parts, genomes[0].parts);
    assert_eq!(jaw.genomes[0].hue, genomes[0].hue);
}
