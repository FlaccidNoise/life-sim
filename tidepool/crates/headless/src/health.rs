//! The health gate and the probes that go with it. All three run the default world.

use std::io::Write;

use tidepool_sim::genome::{KIND_CHEMO, KIND_CILIA, KIND_FILTER, KIND_FLAGELLUM};
use tidepool_sim::params::id;
use tidepool_sim::stats::STAT_MAX_GENERATION;
use tidepool_sim::world::World;

use crate::evolve::mean_sd;
use crate::probes::CARN_ABOVE;
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

// The predation bands, read over a run of 12,000 ticks (choice C6 of the M4 plan). `None` is a
// band that is not set: the gate prints the measure and does not judge it. A band that is set is
// judged only under `--predation`. `docs/gates.md` holds the proofs. Set on 2026-10-16 from the
// three bad worlds of `docs/findings/m4-gates.md`, provisional: `kills_late` and `flesh_late`
// reject a world with no predation (0 and 0.000), `prey_lo` and `hunt_hi` a world where every body
// hunts and any body can be bitten (0 and 1.000). `hunt_lo` is not a gate at 12,000 ticks: a world
// with no founder hunter reads 0.03 to 0.16 by mutation, and one with dead jaws 0.08 to 0.23.
// `carn_hi` and `diet_sd_lo` are printed, not judged yet: set from the shipped world's rows (Task 7
// of the diet retune).
const PREDATION: Bands = Bands {
    hunt_lo: None,
    hunt_hi: Some(0.8),
    prey_lo: Some(150),
    kills_late: Some(20),
    flesh_late: Some(0.01),
    carn_hi: None,
    diet_sd_lo: None,
};
/// The hunter share and the prey count are sampled on each multiple of this many ticks in the second
/// half of the run.
const HUNT_SAMPLE_TICKS: u32 = 500;
/// `kills_late` and `flesh_late` count the last this many ticks of the run.
const LATE_HUNT_TICKS: u32 = 2000;

/// A creature within this many of its own lengths of a plant is near it.
const NEAR_LENGTHS: f32 = 2.0;
/// The side of the cell that `probe-density` counts creatures in.
const DENSITY_CELL: f32 = 32.0;
/// One time-skip (`docs/architecture.md` section 2).
const SKIP_TICKS: u32 = 24000;

pub struct Args {
    pub seeds: Vec<u32>,
    pub ticks: u32,
    pub params: Vec<(usize, f32)>,
}

/// `ticks_flag` names the flag that sets `ticks`. A probe of a fixed length passes none.
pub fn args(args: &[String], seeds: &[u32], ticks_flag: Option<&str>, ticks: u32) -> Args {
    let mut a = Args {
        seeds: seeds.to_vec(),
        ticks,
        params: Vec::new(),
    };
    let mut it = args.iter().map(String::as_str);
    while let Some(flag) = it.next() {
        match flag {
            "--seed" | "--seeds" => {
                let list = it.next().unwrap_or("");
                a.seeds = list.split(',').map(|s| value(flag, Some(s))).collect();
            }
            "--param" => a.params.push(param(flag, it.next())),
            _ if Some(flag) == ticks_flag => {
                a.ticks = value(flag, it.next());
                if a.ticks == 0 {
                    usage(&format!("{flag} needs a value above 0"));
                }
            }
            _ => usage(&format!("unknown flag {flag}")),
        }
    }
    a
}

pub fn default_world(seed: u32, params: &[(usize, f32)]) -> World {
    let mut world = World::new(seed, WORLD.0, WORLD.1);
    // Before the founders: the fertility map and the founder genomes read the parameters.
    for &(i, x) in params {
        world.params.set(i, x);
    }
    world.seed_founders(FOUNDERS.0, FOUNDERS.1);
    world
}

pub fn live(world: &World) -> impl Iterator<Item = usize> + '_ {
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

/// The least and the most of each predation measure that the gate accepts. Each is `None` until
/// its proof sets it. `hunt_hi` is a most. The others are a least, `carn_hi` and `diet_sd_lo`
/// among them: `carn_hi` is the least of the most carnivore share.
pub struct Bands {
    pub hunt_lo: Option<f64>,
    pub hunt_hi: Option<f64>,
    pub prey_lo: Option<u32>,
    pub kills_late: Option<u64>,
    pub flesh_late: Option<f64>,
    pub carn_hi: Option<f64>,
    pub diet_sd_lo: Option<f64>,
}

impl Bands {
    fn any(&self) -> bool {
        self.hunt_lo.is_some()
            || self.hunt_hi.is_some()
            || self.prey_lo.is_some()
            || self.kills_late.is_some()
            || self.flesh_late.is_some()
            || self.carn_hi.is_some()
            || self.diet_sd_lo.is_some()
    }
}

/// Removes `--predation` from the flags. A usage error when it is there and `bands` sets none, so
/// that the flag never passes a world that nothing judged. `name` is where the bands are.
pub fn predation_flag(argv: &[String], bands: &Bands, name: &str) -> (bool, Vec<String>) {
    let on = argv.iter().any(|flag| flag == "--predation");
    if on && !bands.any() {
        usage(&format!(
            "--predation judges no band: every predation band is None. Fix: set the bands in {name} from their proofs in docs/gates.md, or leave out --predation"
        ));
    }
    let others = argv.iter().filter(|flag| *flag != "--predation");
    (on, others.cloned().collect())
}

/// The five measures of "How the gate reads 'predators and prey coexist'" in the M4 plan, and the
/// two diet measures of Task 7 of the diet retune. A hunter is a living body with a `jaw_sum`
/// above 0, and prey is one with none. A carnivore has a `diet` above `CARN_ABOVE`.
#[derive(Default)]
pub struct Coexist {
    /// The least and the most hunter share, and the least prey count, over the samples.
    hunt_lo: f64,
    hunt_hi: f64,
    prey_lo: u32,
    /// The most carnivore share, and the least standard deviation of `diet`, over the samples.
    carn_hi: f64,
    diet_sd_lo: f64,
    samples: u32,
    /// The kills, the flesh, and every energy eaten (plants, debris, flesh) when the late window
    /// opens. Zero for a run shorter than the window: the window is then the whole run.
    before: (u64, f64, f64),
}

/// The kills, the flesh, and every energy eaten so far.
fn hunt_stats(world: &World) -> (u64, f64, f64) {
    let st = &world.stats;
    (st.kills, st.flesh, st.eaten + st.debris_eaten + st.flesh)
}

impl Coexist {
    /// Call after each tick of a run of `ticks`.
    pub fn record(&mut self, world: &World, ticks: u32) {
        if world.tick > ticks / 2 && world.tick.is_multiple_of(HUNT_SAMPLE_TICKS) {
            let c = &world.creatures;
            let living = c.slots.count();
            let hunters = live(world).filter(|&s| c.jaw_sum[s] > 0.0).count() as u32;
            // A world with nobody alive has no hunter.
            let share = f64::from(hunters) / f64::from(living.max(1));
            let carns = live(world).filter(|&s| c.diet[s] > CARN_ABOVE).count();
            let carn = carns as f64 / f64::from(living.max(1));
            let (_, diet_sd) = mean_sd(live(world).map(|s| c.diet[s]));
            if self.samples == 0 {
                (self.hunt_lo, self.hunt_hi, self.prey_lo) = (share, share, u32::MAX);
                (self.carn_hi, self.diet_sd_lo) = (carn, diet_sd);
            }
            self.carn_hi = self.carn_hi.max(carn);
            self.diet_sd_lo = self.diet_sd_lo.min(diet_sd);
            self.hunt_lo = self.hunt_lo.min(share);
            self.hunt_hi = self.hunt_hi.max(share);
            self.prey_lo = self.prey_lo.min(living - hunters);
            self.samples += 1;
        }
        if world.tick == ticks.saturating_sub(LATE_HUNT_TICKS) {
            self.before = hunt_stats(world);
        }
    }

    /// The seven columns of a row, and the bands of `bands` that the run left when `judged`. A run
    /// with no sample prints `none` for the five sampled measures, and fails each of their bands.
    /// `flesh_late` is 0 when nothing was eaten in the window.
    pub fn read(&self, world: &World, bands: &Bands, judged: bool) -> (String, Vec<String>) {
        let (kills, flesh, eaten) = hunt_stats(world);
        let kills_late = kills - self.before.0;
        let eaten_late = eaten - self.before.2;
        let flesh_late = if eaten_late > 0.0 {
            (flesh - self.before.1) / eaten_late
        } else {
            0.0
        };
        let sampled = |v: String| {
            if self.samples > 0 {
                v
            } else {
                "none".to_string()
            }
        };
        let (lo_s, hi_s) = (
            format!("{:.3}", self.hunt_lo),
            format!("{:.3}", self.hunt_hi),
        );
        let (lo_s, hi_s, prey_s) = (
            sampled(lo_s),
            sampled(hi_s),
            sampled(self.prey_lo.to_string()),
        );
        let (carn_s, sd_s) = (
            sampled(format!("{:.3}", self.carn_hi)),
            sampled(format!("{:.2}", self.diet_sd_lo)),
        );
        let row = format!(
            "hunt_lo={lo_s} hunt_hi={hi_s} prey_lo={prey_s} kills_late={kills_late} flesh_late={flesh_late:.3} carn_hi={carn_s} diet_sd_lo={sd_s}"
        );
        let mut failures = Vec::new();
        if !judged {
            return (row, failures);
        }
        let some = self.samples > 0;
        let mut band = |ok: bool, what: String| {
            if !ok {
                failures.push(what);
            }
        };
        if let Some(lo) = bands.hunt_lo {
            band(some && self.hunt_lo >= lo, format!("hunt_lo={lo_s} < {lo}"));
        }
        if let Some(hi) = bands.hunt_hi {
            band(some && self.hunt_hi <= hi, format!("hunt_hi={hi_s} > {hi}"));
        }
        if let Some(lo) = bands.prey_lo {
            band(
                some && self.prey_lo >= lo,
                format!("prey_lo={prey_s} < {lo}"),
            );
        }
        if let Some(lo) = bands.kills_late {
            band(kills_late >= lo, format!("kills_late={kills_late} < {lo}"));
        }
        if let Some(lo) = bands.flesh_late {
            band(
                flesh_late >= lo,
                format!("flesh_late={flesh_late:.3} < {lo}"),
            );
        }
        if let Some(lo) = bands.carn_hi {
            band(
                some && self.carn_hi >= lo,
                format!("carn_hi={carn_s} < {lo}"),
            );
        }
        if let Some(lo) = bands.diet_sd_lo {
            band(
                some && self.diet_sd_lo >= lo,
                format!("diet_sd_lo={sd_s} < {lo}"),
            );
        }
        (row, failures)
    }
}

/// One seed of the gate: the printed measures and the bands that it left. With `predation`, the
/// bands of `PREDATION` that are set apply too.
fn measure(seed: u32, a: &Args, predation: bool) -> (String, Vec<String>) {
    let mut world = default_world(seed, &a.params);
    let mut first_buds = FirstBuds::default();
    let mut coexist = Coexist::default();
    let (mut min_late, mut births_before_late) = (u32::MAX, 0);
    for _ in 0..a.ticks {
        let uid_before = world.next_uid;
        world.tick();
        first_buds.record(&world, uid_before);
        coexist.record(&world, a.ticks);
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
    // Founders are not births, so both shares are of the creatures born in the run.
    let births = world.stats.births.max(1) as f64;
    let juv_starved = world.stats.starved_juv as f64 / births;
    let to_bud = first_buds.count as f64 / births;

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
    let (hunt, hunt_failures) = coexist.read(&world, &PREDATION, predation);
    failures.extend(hunt_failures);
    let row = format!(
        "seed={seed} creatures={creatures} min_late={min_late} plants={plants} births_late={births_late} max_gen={max_gen} mean_chemo={mean_chemo:.2} parked={parked:.2} first_bud={first_bud} juv_starved={juv_starved:.2} to_bud={to_bud:.2} {hunt}"
    );
    (row, failures)
}

/// `gate-health`. `--predation` is this gate's own flag. `args` reads the others.
pub fn gate(argv: &[String]) {
    let (predation, others) = predation_flag(argv, &PREDATION, "PREDATION of health.rs");
    let a = args(&others, &[1, 2, 3], Some("--ticks"), 12000);
    judge("gate-health", &a, |seed, a| measure(seed, a, predation));
}

/// Prints the row that `measure` makes for each seed, with the bands that the seed left. Exit 0
/// only when every seed stays inside every band.
pub fn judge(gate: &str, a: &Args, measure: impl Fn(u32, &Args) -> (String, Vec<String>)) {
    let mut passed = 0;
    for &seed in &a.seeds {
        let (row, failures) = measure(seed, a);
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
        "{gate} {passed}/{} {}",
        a.seeds.len(),
        if pass { "PASS" } else { "FAIL" }
    );
    if !pass {
        std::process::exit(1);
    }
}

/// The middle value. NaN for an empty list.
pub fn median(mut v: Vec<f32>) -> f32 {
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
    let a = args(argv, &[1], Some("--ticks"), 12000);
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
    let a = args(argv, &[1], Some("--ticks"), 12000);
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

#[cfg(test)]
mod tests {
    use tidepool_sim::genome::{Genome, KIND_JAW};
    use tidepool_sim::world::SpawnAt;

    use super::*;

    fn spawn(world: &mut World, jaw: bool) {
        let mut genome = Genome::default();
        if jaw {
            genome.set_size(KIND_JAW, 0.5);
        }
        let at = SpawnAt {
            x: 20.0 + 20.0 * world.creatures.slots.count() as f32,
            y: 100.0,
            heading: 0.0,
            growth: 1.0,
            energy01: 0.5,
            parent: 0,
            generation: 0,
            mark: 0,
        };
        world.spawn(genome, at).expect("slot");
    }

    /// A run of 3,000 ticks, set by hand: samples at 2,000, 2,500, and 3,000, and a late window
    /// from 1,000. The tick at 1,500 is in the first half and is not sampled: it holds no hunter.
    #[test]
    fn the_predation_measures_read_the_second_half_and_the_late_window() {
        let mut world = World::new(1, 256.0, 256.0);
        let mut coexist = Coexist::default();
        let mut at = |world: &mut World, tick: u32| {
            world.tick = tick;
            coexist.record(world, 3000);
        };
        for _ in 0..3 {
            spawn(&mut world, false);
        }
        (world.stats.kills, world.stats.flesh, world.stats.eaten) = (2, 1.0, 5.0);
        at(&mut world, 1000);
        at(&mut world, 1500);
        spawn(&mut world, true);
        at(&mut world, 2000);
        spawn(&mut world, true);
        at(&mut world, 2499);
        at(&mut world, 2500);
        (world.stats.kills, world.stats.flesh) = (5, 4.0);
        (world.stats.eaten, world.stats.debris_eaten) = (8.0, 2.0);
        at(&mut world, 3000);
        let (row, failures) = coexist.read(&world, &PREDATION, false);
        // 1 hunter of 4, then 2 of 5. Flesh 3 of 3 + 2 + 3 eaten.
        assert_eq!(
            row,
            "hunt_lo=0.250 hunt_hi=0.400 prey_lo=3 kills_late=3 flesh_late=0.375 carn_hi=0.000 diet_sd_lo=0.00"
        );
        assert!(failures.is_empty());

        let bands = Bands {
            hunt_lo: Some(0.3),
            hunt_hi: Some(0.3),
            prey_lo: Some(4),
            kills_late: Some(4),
            flesh_late: Some(0.4),
            carn_hi: None,
            diet_sd_lo: None,
        };
        assert_eq!(coexist.read(&world, &bands, false).1.len(), 0);
        assert_eq!(coexist.read(&world, &bands, true).1.len(), 5);
        assert!(Coexist::default()
            .read(&world, &bands, true)
            .0
            .starts_with("hunt_lo=none hunt_hi=none prey_lo=none"));
    }

    /// A sample of a world of 3 bodies at one diet, or of nobody.
    fn diet_row(diet: Option<f32>, bands: &Bands) -> (String, Vec<String>) {
        let mut world = World::new(1, 256.0, 256.0);
        if let Some(d) = diet {
            for _ in 0..3 {
                spawn(&mut world, false);
            }
            for s in live(&world).collect::<Vec<_>>() {
                world.genomes[s].diet = d;
                world.creatures.diet[s] = d;
            }
        }
        let mut coexist = Coexist::default();
        world.tick = 1000;
        coexist.record(&world, 1000);
        coexist.read(&world, bands, true)
    }

    #[test]
    fn the_diet_columns_read_the_share_above_the_cut_and_the_spread() {
        let none = Bands {
            hunt_lo: None,
            hunt_hi: None,
            prey_lo: None,
            kills_late: None,
            flesh_late: None,
            carn_hi: None,
            diet_sd_lo: None,
        };
        let row = |diet| diet_row(diet, &none).0;
        assert!(row(Some(0.9)).ends_with(" carn_hi=1.000 diet_sd_lo=0.00"));
        assert!(row(Some(0.0)).ends_with(" carn_hi=0.000 diet_sd_lo=0.00"));
        // Nobody alive: a sample, not a NaN.
        assert!(row(None).ends_with(" carn_hi=0.000 diet_sd_lo=0.00"));

        let set = Bands {
            carn_hi: Some(0.03),
            diet_sd_lo: Some(0.05),
            ..none
        };
        assert_eq!(diet_row(Some(0.0), &set).1.len(), 2);
        assert_eq!(diet_row(Some(0.9), &set).1, ["diet_sd_lo=0.00 < 0.05"]);
        assert!(Coexist::default()
            .read(&World::new(1, 256.0, 256.0), &set, true)
            .0
            .ends_with(" carn_hi=none diet_sd_lo=none"));
    }
}
