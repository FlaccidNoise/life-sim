use std::process::exit;
use std::str::FromStr;

use tidepool_sim::world::World;

const USAGE: &str =
    "usage: tidepool-headless run --seed <u32> --ticks <u32> --creatures <u32> [--world <W>x<H>]";

fn usage(problem: &str) -> ! {
    eprintln!("error: {problem}\n{USAGE}");
    exit(2)
}

fn value<T: FromStr>(flag: &str, v: Option<&str>) -> T {
    v.and_then(|s| s.parse().ok())
        .unwrap_or_else(|| usage(&format!("{flag} needs a valid value")))
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
            "--world" => {
                let (ws, hs) = it.next().and_then(|s| s.split_once('x')).unzip();
                (w, h) = (value(flag, ws), value(flag, hs));
                if !(w > 0.0 && h > 0.0 && w.is_finite() && h.is_finite()) {
                    usage("--world needs two positive finite numbers, like 1536x1024");
                }
            }
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
        _ => usage("expected the subcommand `run`"),
    }
}
