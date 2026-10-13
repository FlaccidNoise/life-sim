// Tests run native only, so a banned float method is safe here.
#![allow(clippy::disallowed_methods)]

use tidepool_sim::creature::{heft, push_of, side_of, MAX_EYES};
use tidepool_sim::genome::*;
use tidepool_sim::math::sin_cos;
use tidepool_sim::params::{id, Params};
use tidepool_sim::rng::Rng;
use tidepool_sim::snapshot::{LoadError, Reader, Writer};
use tidepool_sim::world::{SpawnAt, World};

/// The table with no founder eye and with every M2 mutation at rate 0, as it was before Task 13
/// of the M2 plan switched them on. A test then sets the one that it tests.
fn off() -> Params {
    let mut p = Params::new();
    p.set(id::FOUNDER_EYE, 0.0);
    for k in M2_RATES {
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
    // The eye wires are drawn after every draw of the brain with no eye: `brain::starter`.
    assert_eq!(weights(&eyed)[..39], weights(&plain)[..]);
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
    assert_eq!(conns, (1..=57).collect::<Vec<u32>>());
    assert_eq!(parts, [58, 59, 60, 61, 62]);
    // The 4 hidden genes of the founder take the 4 ids after its parts.
    assert_eq!(hidden, [63, 64, 65, 66]);
    assert_eq!(World::new(1, 64.0, 64.0).next_history, 67);
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
    for kind in [0, 9, 256 + KIND_EYE as u32] {
        assert_eq!(
            patched(kind_at, kind),
            Some(LoadError::Invalid("genome part kind")),
            "kind {kind}"
        );
    }
    // A world that holds such a genome does not load either.
    let mut world = World::new(1, 256.0, 256.0);
    let mut g = Genome::default();
    g.parts[0].kind = 9;
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
    // The defaults have the M2 rates on. `zero` is the defaults with each of them set to 0.
    let (mut zero, mut on) = (Params::new(), Params::new());
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
    // Every kind comes up.
    assert_eq!(kinds, [false, true, true, true, true, true, true]);
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
        assert_eq!((copy.history, next_history), (100, 101));
        // The copy is of the part as this birth left it. This founder has one part of each kind.
        let from = old.iter().find(|x| x.kind == copy.kind).expect("a source");
        assert_eq!((copy.size, copy.extra), (from.size, from.extra));
        assert!((0.0..=1.0).contains(&copy.anchor));
        moved |= copy.anchor != from.anchor;
        let ids: Vec<u32> = old.iter().map(|x| x.history).collect();
        assert_eq!(ids, [58, 59, 60, 61, 62]);
        kinds[copy.kind as usize] = true;
    }
    assert!(moved, "no copy moved along the outline");
    // Each of the five parts is copied in some birth. The founder has no Fin.
    assert_eq!(kinds, [false, true, true, true, true, false, true]);
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
