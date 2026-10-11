use std::time::{Duration, Instant};

use tidepool_sim::world::World;

use crate::{param, usage, value, world_size, FOUNDERS, WORLD};

/// Ticks between two population samples. The sample is outside the timed section.
const CHUNK: u32 = 100;
/// A run whose mean alive count is below this share of `--reference` is void.
const MIN_ALIVE_SHARE: f64 = 0.8;

/// `bench`. Settles the default world once, then times each run from a snapshot of it, so every
/// run does the same work.
pub fn bench(args: &[String]) {
    let (mut creatures, mut plants) = FOUNDERS;
    let (mut settle, mut ticks, mut runs) = (12000u32, 2000u32, 5u32);
    let (mut w, mut h) = WORLD;
    let mut seed = 1u32;
    let (mut reference, mut floor) = (1500u32, 2400.0f64);
    let mut params = Vec::new();
    let mut it = args.iter().map(String::as_str);
    while let Some(flag) = it.next() {
        match flag {
            "--seed" => seed = value(flag, it.next()),
            "--creatures" => creatures = value(flag, it.next()),
            "--plants" => plants = value(flag, it.next()),
            "--settle" => settle = value(flag, it.next()),
            "--ticks" => ticks = value(flag, it.next()),
            "--runs" => runs = value(flag, it.next()),
            "--reference" => reference = value(flag, it.next()),
            "--floor" => floor = value(flag, it.next()),
            "--world" => (w, h) = world_size(flag, it.next()),
            "--param" => params.push(param(flag, it.next())),
            _ => usage(&format!("unknown flag {flag}")),
        }
    }
    if creatures == 0 || ticks == 0 || runs == 0 {
        usage("--creatures, --ticks, and --runs need a value above 0");
    }

    let mut world = World::new(seed, w, h);
    // Before the founders: the fertility map and the founder genomes read the parameters.
    for (i, x) in params {
        world.params.set(i, x);
    }
    world.seed_founders(creatures, plants);
    world.run(settle);
    println!(
        "settled tick={} creatures={} plants={}",
        world.tick,
        world.creatures.slots.count(),
        world.plants.slots.count()
    );
    let snapshot = world.save();

    let (mut tps, mut alive_means) = (Vec::new(), Vec::new());
    for run in 1..=runs {
        let mut world = World::load(&snapshot).expect("a snapshot that this run saved loads");
        let (mut timed, mut alive_sum, mut chunks) = (Duration::ZERO, 0.0f64, 0u32);
        let mut left = ticks;
        while left > 0 {
            let n = left.min(CHUNK);
            let start = Instant::now();
            world.run(n);
            timed += start.elapsed();
            left -= n;
            alive_sum += f64::from(world.creatures.slots.count());
            chunks += 1;
        }
        let alive = alive_sum / f64::from(chunks);
        let run_tps = f64::from(ticks) / timed.as_secs_f64();
        println!("run {run} creatures={alive:.0} tps={run_tps:.0}");
        if alive < MIN_ALIVE_SHARE * f64::from(reference) {
            println!("VOID: population fell");
            std::process::exit(1);
        }
        tps.push(run_tps);
        alive_means.push(alive);
    }

    tps.sort_by(f64::total_cmp);
    let mid = tps.len() / 2;
    let median = if tps.len() % 2 == 1 {
        tps[mid]
    } else {
        (tps[mid - 1] + tps[mid]) / 2.0
    };
    let alive = alive_means.iter().sum::<f64>() / alive_means.len() as f64;
    let pass = median >= floor;
    println!(
        "bench creatures={alive:.0} median_tps={median:.0} floor={floor:.0} {}",
        if pass { "PASS" } else { "FAIL" }
    );
    if !pass {
        std::process::exit(1);
    }
}
