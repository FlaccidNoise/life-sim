//! The health gate and the probes that go with it. All three run the default world.

use std::io::Write;

use tidepool_sim::genome::{KIND_CHEMO, KIND_CILIA, KIND_FILTER, KIND_FLAGELLUM};
use tidepool_sim::params::id;
use tidepool_sim::stats::STAT_MAX_GENERATION;
use tidepool_sim::world::World;

use crate::{param, usage, value, FOUNDERS, WORLD};

// The bands of the gate. `docs/gates.md` holds the table.
const CREATURES: (u32, u32) = (150, 3000);
const MIN_LATE: u32 = 100;
const PLANTS: (u32, u32) = (300, 7000);
const BIRTHS_LATE: u64 = 20;
const MAX_GEN: u32 = 8;
const MEAN_CHEMO: f64 = 0.15;
const PARKED: f64 = 0.25;
/// `births_late` counts the births of this many ticks at the end of the run.
const LATE_BIRTH_TICKS: u32 = 2000;
/// A parked adult holds more than this share of its capacity and moves slower than this.
const PARKED_ENERGY01: f32 = 0.9;
const PARKED_SPEED: f32 = 0.05;

/// A creature within this many of its own lengths of a plant is near it.
const NEAR_LENGTHS: f32 = 2.0;
/// The side of the cell that `probe-density` counts creatures in.
const DENSITY_CELL: f32 = 32.0;
/// One time-skip (`docs/architecture.md` section 2).
const SKIP_TICKS: u32 = 24000;

struct Args {
    seeds: Vec<u32>,
    ticks: u32,
    params: Vec<(usize, f32)>,
}

fn args(args: &[String], seeds: &[u32]) -> Args {
    let mut a = Args {
        seeds: seeds.to_vec(),
        ticks: 12000,
        params: Vec::new(),
    };
    let mut it = args.iter().map(String::as_str);
    while let Some(flag) = it.next() {
        match flag {
            "--seed" | "--seeds" => {
                let list = it.next().unwrap_or("");
                a.seeds = list.split(',').map(|s| value(flag, Some(s))).collect();
            }
            "--ticks" => a.ticks = value(flag, it.next()),
            "--param" => a.params.push(param(flag, it.next())),
            _ => usage(&format!("unknown flag {flag}")),
        }
    }
    if a.ticks == 0 {
        usage("--ticks needs a value above 0");
    }
    a
}

fn default_world(seed: u32, params: &[(usize, f32)]) -> World {
    let mut world = World::new(seed, WORLD.0, WORLD.1);
    // Before the founders: the fertility map and the founder genomes read the parameters.
    for &(i, x) in params {
        world.params.set(i, x);
    }
    world.seed_founders(FOUNDERS.0, FOUNDERS.1);
    world
}

fn live(world: &World) -> impl Iterator<Item = usize> + '_ {
    let slots = &world.creatures.slots;
    (0..slots.high_water() as usize).filter(|&s| slots.is_alive(s as u32))
}

/// The age at which each creature born in the run first budded. A founder is left out: it starts
/// as an adult at a random age, so its age at its first bud is not the length of a generation.
#[derive(Default)]
struct FirstBuds {
    /// By uid.
    budded: Vec<bool>,
    age_sum: u64,
    count: u64,
}

impl FirstBuds {
    /// Call after each tick with the value of `next_uid` from before it. A creature with a uid at
    /// or above that was born on this tick, and its parent is still alive: `repro::step` runs after
    /// the deaths of the tick.
    fn record(&mut self, world: &World, uid_before: u32) {
        if world.next_uid == uid_before {
            return;
        }
        let c = &world.creatures;
        self.budded.resize(world.next_uid as usize, false);
        let parents: Vec<u32> = live(world)
            .filter(|&s| c.uid[s] >= uid_before)
            .map(|s| c.parent[s])
            .collect();
        for s in live(world) {
            let uid = c.uid[s];
            if c.generation[s] > 0 && parents.contains(&uid) && !self.budded[uid as usize] {
                self.budded[uid as usize] = true;
                self.age_sum += u64::from(c.age[s]);
                self.count += 1;
            }
        }
    }
}

/// One seed of the gate: the printed measures and the bands that it left.
fn measure(seed: u32, a: &Args) -> (String, Vec<String>) {
    let mut world = default_world(seed, &a.params);
    let mut first_buds = FirstBuds::default();
    let (mut min_late, mut births_before_late) = (u32::MAX, 0);
    for _ in 0..a.ticks {
        let uid_before = world.next_uid;
        world.tick();
        first_buds.record(&world, uid_before);
        if world.tick > a.ticks / 2 {
            min_late = min_late.min(world.creatures.slots.count());
        }
        if world.tick == a.ticks.saturating_sub(LATE_BIRTH_TICKS) {
            births_before_late = world.stats.births;
        }
    }

    let c = &world.creatures;
    let per_mass = world.params.get(id::ENERGY_PER_MASS);
    let creatures = c.slots.count();
    let plants = world.plants.slots.count();
    let births_late = world.stats.births - births_before_late;
    let max_gen = world.stat(STAT_MAX_GENERATION) as u32;
    // A fold from 0, because the sum of no floats is -0 and would print as `-0.00`.
    let chemo_sum = live(&world).fold(0.0, |sum, s| sum + f64::from(c.chemo[s]));
    let mean_chemo = chemo_sum / f64::from(creatures.max(1));
    let adults: Vec<usize> = live(&world).filter(|&s| c.growth[s] >= 1.0).collect();
    let is_parked = |s: usize| {
        let speed = (c.vx[s] * c.vx[s] + c.vy[s] * c.vy[s]).sqrt();
        c.energy01(s, per_mass) > PARKED_ENERGY01 && speed < PARKED_SPEED
    };
    let parked_count = adults.iter().filter(|&&s| is_parked(s)).count();
    let parked = parked_count as f64 / adults.len().max(1) as f64;
    let first_bud = match first_buds.count {
        0 => "none".to_string(),
        n => format!("{:.0}", first_buds.age_sum as f64 / n as f64),
    };

    let mut failures = Vec::new();
    let mut band = |ok: bool, what: String| {
        if !ok {
            failures.push(what);
        }
    };
    band(
        creatures >= CREATURES.0,
        format!("creatures={creatures} < {}", CREATURES.0),
    );
    band(
        creatures <= CREATURES.1,
        format!("creatures={creatures} > {}", CREATURES.1),
    );
    band(
        min_late >= MIN_LATE,
        format!("min_late={min_late} < {MIN_LATE}"),
    );
    band(
        plants >= PLANTS.0,
        format!("plants={plants} < {}", PLANTS.0),
    );
    band(
        plants <= PLANTS.1,
        format!("plants={plants} > {}", PLANTS.1),
    );
    band(
        births_late >= BIRTHS_LATE,
        format!("births_late={births_late} < {BIRTHS_LATE}"),
    );
    band(max_gen >= MAX_GEN, format!("max_gen={max_gen} < {MAX_GEN}"));
    band(
        mean_chemo >= MEAN_CHEMO,
        format!("mean_chemo={mean_chemo:.2} < {MEAN_CHEMO}"),
    );
    band(parked <= PARKED, format!("parked={parked:.2} > {PARKED}"));
    let row = format!(
        "seed={seed} creatures={creatures} min_late={min_late} plants={plants} births_late={births_late} max_gen={max_gen} mean_chemo={mean_chemo:.2} parked={parked:.2} first_bud={first_bud}"
    );
    (row, failures)
}

/// `gate-health`. Exit 0 only when every seed stays inside every band.
pub fn gate(argv: &[String]) {
    let a = args(argv, &[1, 2, 3]);
    let mut passed = 0;
    for &seed in &a.seeds {
        let (row, failures) = measure(seed, &a);
        if failures.is_empty() {
            passed += 1;
            println!("{row} PASS");
        } else {
            println!("{row} FAIL({})", failures.join(", "));
        }
        // A killed run keeps the rows it finished.
        std::io::stdout().flush().expect("flush stdout");
    }
    let pass = passed == a.seeds.len();
    println!(
        "gate-health {passed}/{} {}",
        a.seeds.len(),
        if pass { "PASS" } else { "FAIL" }
    );
    if !pass {
        std::process::exit(1);
    }
}

/// The middle value. NaN for an empty list.
fn median(mut v: Vec<f32>) -> f32 {
    v.sort_by(f32::total_cmp);
    v.get(v.len() / 2).copied().unwrap_or(f32::NAN)
}

/// The distance from `(x, y)` to the nearest of `points`. Infinity when there is none.
fn nearest(x: f32, y: f32, points: impl Iterator<Item = (f32, f32)>) -> f32 {
    points
        .map(|(px, py)| (px - x) * (px - x) + (py - y) * (py - y))
        .fold(f32::INFINITY, f32::min)
        .sqrt()
}

fn density_row(seed: u32, world: &World) {
    let (c, p) = (&world.creatures, &world.plants);
    let slots: Vec<usize> = live(world).collect();
    let plants: Vec<(f32, f32)> = (0..p.slots.high_water() as usize)
        .filter(|&s| p.slots.is_alive(s as u32))
        .map(|s| (p.x[s], p.y[s]))
        .collect();
    let to_creature = slots.iter().map(|&s| {
        let others = slots.iter().filter(|&&o| o != s).map(|&o| (c.x[o], c.y[o]));
        nearest(c.x[s], c.y[s], others)
    });
    // In world units, then in lengths of the creature that looks.
    let to_plant: Vec<f32> = slots
        .iter()
        .map(|&s| nearest(c.x[s], c.y[s], plants.iter().copied()))
        .collect();
    let in_lengths: Vec<f32> = slots
        .iter()
        .zip(&to_plant)
        .map(|(&s, d)| d / c.length(s))
        .collect();
    let near = in_lengths.iter().filter(|&&d| d <= NEAR_LENGTHS).count();
    let mut cells: Vec<(u32, u32)> = slots
        .iter()
        .map(|&s| {
            (
                (c.x[s] / DENSITY_CELL) as u32,
                (c.y[s] / DENSITY_CELL) as u32,
            )
        })
        .collect();
    cells.sort_unstable();
    cells.dedup();
    println!(
        "seed={seed} tick={} creatures={} plants={} nearest_creature={:.1} nearest_plant={:.1} nearest_plant_lengths={:.2} near_plant={:.2} per_cell={:.2}",
        world.tick,
        slots.len(),
        plants.len(),
        median(to_creature.collect()),
        median(to_plant),
        median(in_lengths),
        near as f64 / slots.len().max(1) as f64,
        slots.len() as f64 / cells.len().max(1) as f64,
    );
}

/// `probe-density`. One row at a quarter, a half, and the end of the run.
pub fn probe_density(argv: &[String]) {
    let a = args(argv, &[1]);
    for &seed in &a.seeds {
        let mut world = default_world(seed, &a.params);
        for at in [a.ticks / 4, a.ticks / 2, a.ticks] {
            world.run(at - world.tick);
            density_row(seed, &world);
        }
    }
}

const SKIP_MEASURES: [&str; 7] = [
    "len",
    "wid",
    "flagellum",
    "cilia",
    "filter",
    "chemo",
    "brain_weight",
];

/// The mean and the standard deviation over the living of each of `SKIP_MEASURES`. A part measure
/// is the sum of the sizes of the parts of that kind. A creature's brain weight is the mean size
/// of its connection weights.
fn gene_stats(world: &World) -> [(f64, f64); 7] {
    let c = &world.creatures;
    let weight = |s: usize| {
        let conns = &world.genomes[s].brain.conns;
        conns.iter().map(|k| k.weight.abs()).sum::<f32>() / conns.len().max(1) as f32
    };
    let n = c.slots.count().max(1) as f64;
    let mut out = [(0.0, 0.0); 7];
    for (g, stat) in out.iter_mut().enumerate() {
        let value = |s: usize| {
            f64::from(match g {
                0 => c.len[s],
                1 => c.wid[s],
                2 => world.genomes[s].size_of(KIND_FLAGELLUM),
                3 => world.genomes[s].size_of(KIND_CILIA),
                4 => world.genomes[s].size_of(KIND_FILTER),
                5 => world.genomes[s].size_of(KIND_CHEMO),
                _ => weight(s),
            })
        };
        let mean = live(world).map(value).sum::<f64>() / n;
        let var = live(world).map(|s| (value(s) - mean) * (value(s) - mean));
        *stat = (mean, (var.sum::<f64>() / n).sqrt());
    }
    out
}

/// `probe-skip`. Runs `--ticks` to settle, then one time-skip, and prints how far each mean moved.
pub fn probe_skip(argv: &[String]) {
    let a = args(argv, &[1]);
    for &seed in &a.seeds {
        let mut world = default_world(seed, &a.params);
        world.run(a.ticks);
        let start = gene_stats(&world);
        let counts = |w: &World| {
            format!(
                "creatures={} plants={} max_gen={}",
                w.creatures.slots.count(),
                w.plants.slots.count(),
                w.stat(STAT_MAX_GENERATION)
            )
        };
        println!("seed={seed} tick={} {}", world.tick, counts(&world));
        world.run(SKIP_TICKS);
        let end = gene_stats(&world);
        println!("seed={seed} tick={} {}", world.tick, counts(&world));
        for (name, (s, e)) in SKIP_MEASURES.iter().zip(start.iter().zip(&end)) {
            println!(
                "seed={seed} gene={name} start_mean={:.4} start_sd={:.4} end_mean={:.4} end_sd={:.4} shift_sd={:+.2}",
                s.0,
                s.1,
                e.0,
                e.1,
                (e.0 - s.0) / s.1,
            );
        }
        std::io::stdout().flush().expect("flush stdout");
    }
}
