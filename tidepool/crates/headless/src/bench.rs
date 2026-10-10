use std::time::{Duration, Instant};

use tidepool_sim::world::World;

use crate::{usage, value, world_size};

/// Ticks between two population samples. The sample is outside the timed section.
const CHUNK: u32 = 100;
/// A run whose mean alive count is below this share of `--creatures` is void.
const MIN_ALIVE_SHARE: f64 = 0.8;

pub fn bench(args: &[String]) {
    let (mut creatures, mut plants) = (1500u32, 3000u32);
    let (mut ticks, mut warmup, mut runs) = (2000u32, 200u32, 5u32);
    let (mut w, mut h) = (3072.0f32, 1536.0f32);
    let mut floor = 2400.0f64;
    let mut it = args.iter().map(String::as_str);
    while let Some(flag) = it.next() {
        match flag {
            "--creatures" => creatures = value(flag, it.next()),
            "--plants" => plants = value(flag, it.next()),
            "--ticks" => ticks = value(flag, it.next()),
            "--warmup" => warmup = value(flag, it.next()),
            "--runs" => runs = value(flag, it.next()),
            "--floor" => floor = value(flag, it.next()),
            "--world" => (w, h) = world_size(flag, it.next()),
            _ => usage(&format!("unknown flag {flag}")),
        }
    }
    if creatures == 0 || ticks == 0 || runs == 0 {
        usage("--creatures, --ticks, and --runs need a value above 0");
    }

    let (mut tps, mut alive_means) = (Vec::new(), Vec::new());
    for run in 1..=runs {
        let mut world = World::new(1, w, h);
        world.seed_founders(creatures, plants);
        world.run(warmup);
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
        if alive < MIN_ALIVE_SHARE * f64::from(creatures) {
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
