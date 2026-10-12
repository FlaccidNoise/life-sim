// Tests run native only, so a banned float method is safe here.
#![allow(clippy::disallowed_methods)]

use tidepool_sim::control::CAUSE_OLD_AGE;
use tidepool_sim::creature::{MAX_CREATURES, MAX_RADIUS};
use tidepool_sim::genome::{
    Genome, KIND_CHEMO, KIND_CILIA, KIND_FILTER, KIND_FLAGELLUM, LEN_RANGE, SIZE_RANGE, WID_RANGE,
};
use tidepool_sim::params::{id, Params};
use tidepool_sim::rng::Rng;
use tidepool_sim::stats::{
    STAT_BIRTHS, STAT_CREATURES, STAT_DEATHS, STAT_LINEAGE_ALIVE, STAT_MAX_GENERATION,
    STAT_MEAN_ENERGY01, STAT_PLANTS,
};
use tidepool_sim::world::{SpawnAt, World};

fn at(x: f32, y: f32) -> SpawnAt {
    SpawnAt {
        x,
        y,
        heading: 0.0,
        growth: 1.0,
        energy01: 0.5,
        parent: 0,
        generation: 0,
        mark: 0,
    }
}

fn empty() -> World {
    World::new(1, 1536.0, 1024.0)
}

/// len, wid, and the sizes of the four parts of the reference body.
const GENE_DEFAULT: [f32; 6] = [12.0, 0.5, 0.6, 0.4, 0.6, 0.5];
const GENE_RANGE: [(f32, f32); 6] = [
    LEN_RANGE,
    WID_RANGE,
    SIZE_RANGE[KIND_FLAGELLUM as usize],
    SIZE_RANGE[KIND_CILIA as usize],
    SIZE_RANGE[KIND_FILTER as usize],
    SIZE_RANGE[KIND_CHEMO as usize],
];

fn genes(g: &Genome) -> [f32; 6] {
    [
        g.len,
        g.wid,
        g.size_of(KIND_FLAGELLUM),
        g.size_of(KIND_CILIA),
        g.size_of(KIND_FILTER),
        g.size_of(KIND_CHEMO),
    ]
}

fn live(w: &World) -> Vec<usize> {
    (0..w.creatures.slots.high_water() as usize)
        .filter(|&s| w.creatures.slots.is_alive(s as u32))
        .collect()
}

#[test]
fn the_default_genome_is_the_default_body() {
    let g = Genome::default();
    assert_eq!(genes(&g), GENE_DEFAULT);
    assert_eq!(g.parts.len(), 4);
    assert_eq!((g.egg, g.old), (0.7, 4800.0));
}

#[test]
fn a_founder_genome_is_near_the_defaults_and_inside_the_ranges() {
    let p = Params::new();
    let mut rng = Rng::new(7);
    let mut hues = Vec::new();
    for _ in 0..500 {
        let g = Genome::founder(&mut rng, &p);
        for ((v, (lo, hi)), d) in genes(&g).iter().zip(GENE_RANGE).zip(GENE_DEFAULT) {
            assert!(*v >= lo && *v <= hi);
            assert!((v - d).abs() <= 0.25 * (hi - lo), "{v} is far from {d}");
        }
        assert!((0.0..1.0).contains(&g.hue));
        hues.push(g.hue);
    }
    hues.sort_by(f32::total_cmp);
    assert!(hues[0] < 0.1 && hues[499] > 0.9);
}

#[test]
fn spawn_sets_the_creature_from_the_genome_and_the_place() {
    let mut w = empty();
    let g = Genome {
        hue: 0.25,
        ..Genome::default()
    };
    let place = SpawnAt {
        x: 100.0,
        y: 200.0,
        heading: 1.0,
        growth: 0.5,
        energy01: 0.5,
        parent: 0,
        generation: 3,
        mark: 1,
    };
    let s = w.spawn(g, place).expect("slot") as usize;
    let c = &w.creatures;
    assert_eq!((s, c.uid[s], w.next_uid), (0, 1, 2));
    assert_eq!((c.x[s], c.y[s], c.heading[s]), (100.0, 200.0, 1.0));
    assert!((c.hc[s] - 1.0f32.cos()).abs() < 1e-4 && (c.hs[s] - 1.0f32.sin()).abs() < 1e-4);
    // The default body is 12 long and half as wide. At growth 0.5 it is 6 by 3.
    assert_eq!(
        (c.length(s), c.width(s), c.area(s), c.radius(s)),
        (6.0, 3.0, 18.0, 2.25)
    );
    assert_eq!(c.energy[s], 0.5 * w.params.get(id::ENERGY_PER_MASS) * 18.0);
    assert_eq!(
        (c.age[s], c.generation[s], c.parent[s], c.mark[s]),
        (0, 3, 0, 1)
    );
    assert_eq!((c.bud_cooldown[s], c.hue[s]), (0, 0.25));
    // The flagellum of the default body is at the tail, so all of its size pushes.
    assert_eq!(
        (c.flag_push[s], c.flag_side[s], c.cilia[s]),
        (0.6, 0.0, 0.4)
    );
    assert_eq!((c.filter[s], c.chemo[s], c.fin[s]), (0.6, 0.5, 0.0));
    assert_eq!((c.plain_sum[s], c.eye_sum[s], c.n_eyes[s]), (2.1, 0.0, 0));
    assert_eq!((c.egg[s], c.old[s]), (0.7, 4800.0));
    assert_eq!(w.genomes[s].hue, 0.25);
}

#[test]
fn spawn_wraps_the_heading_and_keeps_the_creature_inside_the_world() {
    let mut w = empty();
    let s = w
        .spawn(
            Genome::default(),
            SpawnAt {
                heading: 7.0,
                ..at(-5.0, 2000.0)
            },
        )
        .expect("slot") as usize;
    let c = &w.creatures;
    assert_eq!((c.x[s], c.y[s]), (0.0, 1024.0));
    assert!((c.heading[s] - (7.0 - std::f32::consts::TAU)).abs() < 1e-5);
}

#[test]
fn the_largest_body_fits_the_neighbour_reach() {
    let mut w = empty();
    let g = Genome {
        len: LEN_RANGE.1,
        wid: WID_RANGE.1,
        ..Genome::default()
    };
    let s = w.spawn(g, at(100.0, 100.0)).expect("slot") as usize;
    assert_eq!(w.creatures.radius(s), MAX_RADIUS);
}

#[test]
fn spawn_fails_when_the_pool_is_full() {
    let mut w = empty();
    for _ in 0..MAX_CREATURES {
        assert!(w.spawn(Genome::default(), at(100.0, 100.0)).is_some());
    }
    assert_eq!(w.spawn(Genome::default(), at(100.0, 100.0)), None);
    assert_eq!(w.next_uid, MAX_CREATURES + 1);
}

#[test]
fn a_spawn_with_a_parent_is_a_birth_and_a_spawn_without_one_is_not() {
    let mut w = empty();
    w.spawn(Genome::default(), at(100.0, 100.0)).expect("slot");
    assert_eq!(w.stat(STAT_BIRTHS), 0.0);
    let child = SpawnAt {
        parent: 1,
        generation: 1,
        ..at(120.0, 100.0)
    };
    w.spawn(Genome::default(), child).expect("slot");
    assert_eq!(w.stat(STAT_BIRTHS), 1.0);
    assert_eq!(w.stat(STAT_MAX_GENERATION), 1.0);
}

#[test]
fn kill_frees_the_slot_and_the_next_creature_there_has_a_new_uid() {
    let mut w = empty();
    for _ in 0..3 {
        w.spawn(Genome::default(), at(100.0, 100.0)).expect("slot");
    }
    w.kill(1, CAUSE_OLD_AGE);
    assert_eq!((w.stat(STAT_CREATURES), w.stat(STAT_DEATHS)), (2.0, 1.0));
    assert_eq!(w.creatures.uid[1], 0);
    assert_eq!(w.pick(100.0, 100.0, 1.0), 1);
    let s = w.spawn(Genome::default(), at(300.0, 300.0)).expect("slot") as usize;
    assert_eq!((s, w.creatures.uid[s]), (1, 4));
}

#[test]
fn stats_describe_the_living() {
    let mut w = empty();
    assert_eq!(w.stat(STAT_MEAN_ENERGY01), 0.0);
    assert_eq!(w.stat(STAT_MAX_GENERATION), 0.0);
    for (energy01, generation, mark) in [(0.2, 4, 1), (0.6, 9, 0), (1.0, 2, 1)] {
        let place = SpawnAt {
            energy01,
            generation,
            mark,
            ..at(100.0, 100.0)
        };
        w.spawn(Genome::default(), place).expect("slot");
    }
    assert_eq!(w.stat(STAT_CREATURES), 3.0);
    assert_eq!(w.stat(STAT_PLANTS), 0.0);
    assert_eq!(w.stat(STAT_MAX_GENERATION), 9.0);
    assert_eq!(w.stat(STAT_LINEAGE_ALIVE), 2.0);
    assert!((w.stat(STAT_MEAN_ENERGY01) - 0.6).abs() < 1e-6);
    w.kill(1, CAUSE_OLD_AGE);
    assert_eq!(w.stat(STAT_MAX_GENERATION), 4.0);
    assert_eq!(w.stat(99), -1.0);
}

#[test]
fn founders_are_adults_at_half_energy_with_ages_below_half_a_lifespan() {
    let mut w = World::new(2, 1536.0, 1024.0);
    w.seed_founders(400, 0);
    assert_eq!(w.creatures.slots.count(), 400);
    assert_eq!((w.stat(STAT_BIRTHS), w.next_uid), (0.0, 401));
    assert!((w.stat(STAT_MEAN_ENERGY01) - 0.5).abs() < 1e-6);
    let c = &w.creatures;
    let half = (w.params.get(id::LIFESPAN) / 2.0) as u32;
    let (mut oldest, mut left, mut top) = (0, 0, 0);
    for s in live(&w) {
        assert_eq!((c.growth[s], c.parent[s], c.generation[s]), (1.0, 0, 0));
        assert!(c.age[s] < half);
        assert!((0.0..=1536.0).contains(&c.x[s]) && (0.0..=1024.0).contains(&c.y[s]));
        assert!(c.heading[s].abs() <= std::f32::consts::PI);
        assert_eq!(c.len[s], w.genomes[s].len);
        oldest = oldest.max(c.age[s]);
        left += u32::from(c.x[s] < 768.0);
        top += u32::from(c.y[s] < 512.0);
    }
    assert!(oldest > half / 2);
    // With no fertility map yet, founders are spread evenly.
    assert!((150..=250).contains(&left) && (150..=250).contains(&top));
}

#[test]
fn the_lifespan_parameter_sets_the_founder_ages() {
    let mut w = World::new(2, 1536.0, 1024.0);
    w.params.set(id::LIFESPAN, 1200.0);
    w.seed_founders(400, 0);
    assert!(live(&w).into_iter().all(|s| w.creatures.age[s] < 600));
}

#[test]
fn seed_founders_stops_at_a_full_pool() {
    let mut w = World::new(2, 1536.0, 1024.0);
    w.seed_founders(MAX_CREATURES + 50, 0);
    assert_eq!(w.creatures.slots.count(), MAX_CREATURES);
}

#[test]
fn founders_swim_and_every_tick_adds_one_to_each_age() {
    let mut w = World::new(2, 1536.0, 1024.0);
    // Nothing starves, so the test holds after Task 13 adds upkeep.
    for k in [
        id::BASAL,
        id::PART_UPKEEP,
        id::NEURON_UPKEEP,
        id::CONN_UPKEEP,
        id::MOVE_COST,
    ] {
        w.params.set(k, 0.0);
    }
    w.seed_founders(400, 0);
    let before: Vec<(f32, f32, u32)> = live(&w)
        .into_iter()
        .map(|s| (w.creatures.x[s], w.creatures.y[s], w.creatures.age[s]))
        .collect();
    w.run(200);
    assert_eq!(w.tick, 200);
    let mut moved = 0;
    for (s, (x, y, age)) in live(&w).into_iter().zip(before) {
        assert_eq!(w.creatures.age[s], age + 200);
        moved += u32::from((w.creatures.x[s] - x).hypot(w.creatures.y[s] - y) > 5.0);
    }
    assert!(moved > 350, "only {moved} of 400 moved");
}
