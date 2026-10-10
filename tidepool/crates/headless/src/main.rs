mod bench;

use std::process::exit;
use std::str::FromStr;

use tidepool_sim::world::{size_ok, World, MAX_WORLD_SIZE};

const USAGE: &str = "usage: tidepool-headless run --seed <u32> --ticks <u32> --creatures <u32> [--world <W>x<H>]
       tidepool-headless bench [--creatures <u32>] [--world <W>x<H>] [--ticks <u32>] [--warmup <u32>] [--runs <u32>] [--floor <n>]";

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
            "--world needs two numbers above 0 and at most {MAX_WORLD_SIZE}, like 1536x1024"
        ));
    }
    (w, h)
}

fn run(args: &[String]) {
    let (mut seed, mut ticks, mut creatures) = (None, None, None);
    let (mut w, mut h) = (1536.0f32, 1024.0f32);
    let mut it = args.iter().map(String::as_str);
    while let Some(flag) = it.next() {
        match flag {
            "--seed" => seed = Some(value::<u32>(flag, it.next())),
            "--ticks" => ticks = Some(value::<u32>(flag, it.next())),
            "--creatures" => creatures = Some(value::<u32>(flag, it.next())),
            "--world" => (w, h) = world_size(flag, it.next()),
            _ => usage(&format!("unknown flag {flag}")),
        }
    }
    let (Some(seed), Some(ticks), Some(creatures)) = (seed, ticks, creatures) else {
        usage("--seed, --ticks, and --creatures are required")
    };
    let mut world = World::new(seed, w, h);
    world.spawn_drifters(creatures);
    world.run(ticks);
    println!(
        "tick={} creatures={} plants=0 hash={:08x}",
        world.tick,
        world.creatures.slots.count(),
        world.state_hash()
    );
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("run") => run(&args[1..]),
        Some("bench") => bench::bench(&args[1..]),
        _ => usage("expected the subcommand `run` or `bench`"),
    }
}
