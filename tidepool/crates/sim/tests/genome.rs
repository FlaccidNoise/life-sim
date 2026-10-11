// Tests run native only, so a banned float method is safe here.
#![allow(clippy::disallowed_methods)]

use tidepool_sim::creature::{heft, push_of, side_of, MAX_EYES};
use tidepool_sim::genome::*;
use tidepool_sim::params::{id, Params};
use tidepool_sim::rng::Rng;
use tidepool_sim::snapshot::{LoadError, Reader, Writer};
use tidepool_sim::world::{SpawnAt, World};

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
    let p = Params::new();
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
    let mut p = Params::new();
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
    assert_eq!(weights(&eyed), weights(&plain));
    assert_eq!(eyed_rng.0, plain_rng.0);
}

#[test]
fn a_founder_holds_the_history_ids_that_the_world_keeps_for_it() {
    let mut p = Params::new();
    p.set(id::FOUNDER_EYE, 0.2);
    let g = Genome::founder(&mut Rng::new(7), &p);
    let conns: Vec<u32> = g.brain.conns.iter().map(|c| c.history).collect();
    let parts: Vec<u32> = g.parts.iter().map(|x| x.history).collect();
    assert_eq!(conns, (1..=39).collect::<Vec<u32>>());
    assert_eq!(parts, [58, 59, 60, 61, 62]);
    assert_eq!(World::new(1, 64.0, 64.0).next_history, 63);
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
    assert!(w.creatures.n_eyes[s] as usize <= MAX_EYES);
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
