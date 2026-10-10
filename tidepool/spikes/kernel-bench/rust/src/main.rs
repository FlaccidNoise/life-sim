// Native runner. Same protocol and JSON shape as ts/cell.ts.
// usage: kernel_native <N> <S|L> <bench|profile>
//        kernel_native_par <N> <S|L> <bench|profile> <threads>   (built with --features par)

use kernel_bench::Sim;
use std::time::Instant;

const SEED: u32 = 0x9E3779B9;
const WARM: u32 = 200;
const TICKS: u32 = 1000;
const REPS: usize = 5;

#[cfg(not(feature = "par"))]
fn run(sim: &mut Sim, ticks: u32) {
    sim.run(ticks)
}
#[cfg(not(feature = "par"))]
fn phase(sim: &mut Sim, p: u32) {
    sim.phase(p)
}
#[cfg(feature = "par")]
fn run(sim: &mut Sim, ticks: u32) {
    sim.run_par(ticks)
}
#[cfg(feature = "par")]
fn phase(sim: &mut Sim, p: u32) {
    sim.phase_par(p)
}

fn main() {
    let a: Vec<String> = std::env::args().collect();
    if a.len() < 4 {
        eprintln!("usage: kernel_native <N> <S|L> <bench|profile>");
        std::process::exit(2);
    }
    let n: usize = a[1].parse().expect("N must be an integer");
    let profile = if a[2] == "L" { 1 } else { 0 };
    let mode = a[3].as_str();
    #[cfg(not(feature = "par"))]
    let variant = "native".to_string();
    #[cfg(feature = "par")]
    let variant = {
        let threads: usize = a.get(4).and_then(|t| t.parse().ok()).expect("threads must be an integer");
        rayon::ThreadPoolBuilder::new().num_threads(threads).build_global().expect("rayon pool");
        format!("native-par-{threads}")
    };

    let mut sim = Sim::new(n, profile, SEED);
    let hash = sim.state_hash();
    run(&mut sim, 1);
    let tick0 = [sim.counter(0), sim.counter(1), sim.counter(2)];

    let mut tps = [0f64; REPS];
    let mut phase_us = [[0f64; REPS]; 6];
    for rep in 0..REPS {
        sim = Sim::new(n, profile, SEED);
        run(&mut sim, WARM);
        if mode == "profile" {
            let mut acc = [0f64; 6];
            let t0 = Instant::now();
            for _ in 0..TICKS {
                for p in 0..6 {
                    let t = Instant::now();
                    phase(&mut sim, p as u32);
                    acc[p] += t.elapsed().as_secs_f64();
                }
            }
            tps[rep] = TICKS as f64 / t0.elapsed().as_secs_f64();
            for p in 0..6 {
                phase_us[p][rep] = acc[p] * 1e6 / TICKS as f64;
            }
        } else {
            let t0 = Instant::now();
            run(&mut sim, TICKS);
            tps[rep] = TICKS as f64 / t0.elapsed().as_secs_f64();
        }
    }
    let list = |v: &[f64]| v.iter().map(|x| format!("{x}")).collect::<Vec<_>>().join(",");
    let phases = phase_us.iter().map(|p| format!("[{}]", list(p))).collect::<Vec<_>>().join(",");
    let stats: Vec<f64> = (0..6).map(|k| sim.stat(k)).collect();
    println!(
        "{{\"variant\":\"{variant}\",\"n\":{n},\"profile\":\"{}\",\"mode\":\"{mode}\",\"hash\":{hash},\"tick0\":[{},{},{}],\"total\":[{},{},{}],\"tps\":[{}],\"phaseUs\":[{phases}],\"stats\":[{}]}}",
        a[2],
        tick0[0],
        tick0[1],
        tick0[2],
        sim.counter(0),
        sim.counter(1),
        sim.counter(2),
        list(&tps),
        list(&stats),
    );
}
