mod bench;
mod health;

use std::process::exit;
use std::str::FromStr;

use tidepool_sim::params::{Params, DEFS};
use tidepool_sim::world::{size_ok, World, MAX_WORLD_SIZE};

const USAGE: &str = "usage: tidepool-headless run --seed <u32> --ticks <u32> --creatures <u32> [--plants <u32>] [--world <W>x<H>] [--param <name>=<value>]...
       tidepool-headless bench [--seed <u32>] [--creatures <u32>] [--plants <u32>] [--world <W>x<H>] [--settle <u32>] [--ticks <u32>] [--runs <u32>] [--reference <u32>] [--floor <n>] [--param <name>=<value>]...
       tidepool-headless gate-health [--seeds <u32>,<u32>,...] [--ticks <u32>] [--param <name>=<value>]...
       tidepool-headless probe-density [--seed <u32>] [--ticks <u32>] [--param <name>=<value>]...
       tidepool-headless probe-skip [--seed <u32>] [--ticks <settle ticks>] [--param <name>=<value>]...";

/// The default world: 1536 by 1024, 400 founder creatures, 1,200 founder plants. The health gate
/// judges it and the bench times it.
const WORLD: (f32, f32) = (1536.0, 1024.0);
const FOUNDERS: (u32, u32) = (400, 1200);

fn usage(problem: &str) -> ! {
    eprintln!("error: {problem}\n{USAGE}");
    exit(2)
}

fn value<T: FromStr>(flag: &str, v: Option<&str>) -> T {
    v.and_then(|s| s.parse().ok())
        .unwrap_or_else(|| usage(&format!("{flag} needs a valid value")))
}

fn world_size(flag: &str, v: Option<&str>) -> (f32, f32) {
    let (ws, hs) = v.and_then(|s| s.split_once('x')).unzip();
    let (w, h) = (value(flag, ws), value(flag, hs));
    if !size_ok(w, h) {
        usage(&format!(
            "--world needs two numbers from 1 to {MAX_WORLD_SIZE}, like 1536x1024"
        ));
    }
    (w, h)
}

/// One `--param name=value`: the parameter's index and the value. An unknown name or a value
/// outside the parameter's range is a usage error.
fn param(flag: &str, v: Option<&str>) -> (usize, f32) {
    let Some((name, number)) = v.and_then(|s| s.split_once('=')) else {
        usage(&format!("{flag} needs <name>=<value>, like drag_fwd=0.1"))
    };
    let Some(i) = Params::index_of(name) else {
        let names: Vec<&str> = DEFS.iter().map(|d| d.name).collect();
        usage(&format!(
            "unknown parameter {name}. Valid names: {}",
            names.join(", ")
        ))
    };
    let (x, d) = (value::<f32>(flag, Some(number)), &DEFS[i]);
    if !(d.min..=d.max).contains(&x) {
        usage(&format!(
            "{flag} {name}={number} is outside the range {} to {}",
            d.min, d.max
        ));
    }
    (i, x)
}

fn run(args: &[String]) {
    let (mut seed, mut ticks, mut creatures, mut plants) = (None, None, None, 0u32);
    let (mut w, mut h) = WORLD;
    let mut params = Vec::new();
    let mut it = args.iter().map(String::as_str);
    while let Some(flag) = it.next() {
        match flag {
            "--seed" => seed = Some(value::<u32>(flag, it.next())),
            "--ticks" => ticks = Some(value::<u32>(flag, it.next())),
            "--creatures" => creatures = Some(value::<u32>(flag, it.next())),
            "--plants" => plants = value(flag, it.next()),
            "--world" => (w, h) = world_size(flag, it.next()),
            "--param" => params.push(param(flag, it.next())),
            _ => usage(&format!("unknown flag {flag}")),
        }
    }
    let (Some(seed), Some(ticks), Some(creatures)) = (seed, ticks, creatures) else {
        usage("--seed, --ticks, and --creatures are required")
    };
    let mut world = World::new(seed, w, h);
    // Before the founders: the fertility map and the founder genomes read the parameters.
    for (i, x) in params {
        world.params.set(i, x);
    }
    world.seed_founders(creatures, plants);
    world.run(ticks);
    println!(
        "tick={} creatures={} plants={} hash={:08x}",
        world.tick,
        world.creatures.slots.count(),
        world.plants.slots.count(),
        world.state_hash()
    );
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("run") => run(&args[1..]),
        Some("bench") => bench::bench(&args[1..]),
        Some("gate-health") => health::gate(&args[1..]),
        Some("probe-density") => health::probe_density(&args[1..]),
        Some("probe-skip") => health::probe_skip(&args[1..]),
        _ => usage("expected a subcommand: run, bench, gate-health, probe-density, or probe-skip"),
    }
}
