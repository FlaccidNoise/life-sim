//! The evolution gate: what a long run does to bodies and to senses. It runs the default world.

use std::collections::HashMap;

use tidepool_sim::creature::heft;
use tidepool_sim::genome::REF_WIDTH;
use tidepool_sim::params::id;
use tidepool_sim::world::World;

use crate::health::{args, default_world, judge, live, Args};

// The bands of the gate. `docs/gates.md` holds the table.
/// A run that ends with fewer creatures than this has died out. The same number is the low end of
/// the `creatures` band of the health gate. A blind run under it makes its gap void.
const CREATURES: u32 = 150;
/// A tenth of the range of the length gene in from each wall.
const LEN: (f64, f64) = (7.8, 22.2);
const LEN_SD: f64 = 0.5;
/// A body needs 2 parts to live.
const PARTS: f64 = 3.0;
/// The least that the mean sum of a sense's parts must stand above the same mean in the blind run
/// of that sense. Two worlds with the same useless sense read gaps from -0.116 to 0.073 by chance
/// (`gates.md`).
const CHEMO_GAP: f64 = 0.10;
const EYE_GAP: f64 = 0.10;
/// A body plan counts when this share of the living holds it.
const PLAN_SHARE: f64 = 0.05;

/// The mean and the standard deviation. Both are 0 for no values.
pub fn mean_sd(values: impl Iterator<Item = f32>) -> (f64, f64) {
    let v: Vec<f64> = values.map(f64::from).collect();
    let n = v.len().max(1) as f64;
    // A fold from 0, because the sum of no floats is -0 and would print as `-0.00`.
    let mean = v.iter().fold(0.0, |sum, x| sum + x) / n;
    let var = v.iter().fold(0.0, |sum, x| sum + (x - mean) * (x - mean)) / n;
    (mean, var.sqrt())
}

/// The speed that the full-grown body of the slot settles at with full thrust and nothing in its
/// way, by rule S3 of the M2 plan: each tick adds `accel` and then keeps `1 - drag_fwd` of the
/// speed.
pub fn top_speed(world: &World, s: usize) -> f32 {
    let (p, c) = (&world.params, &world.creatures);
    let drag = p.get(id::DRAG_FWD);
    let drive = p.get(id::FLAG_FORCE) * c.flag_push[s] + p.get(id::CILIA_FORCE) * c.cilia[s];
    let heft = heft(c.part_sum(s, p.get(id::EYE_COST)), p.get(id::PART_MASS));
    let accel = drive / (REF_WIDTH * heft);
    (accel * (1.0 - drag) / drag).min(p.get(id::V_MAX))
}

/// The radians per tick that the same body settles at with the turn command at 1, at full thrust
/// and at its top speed, by the same rule.
pub fn turn_rate(world: &World, s: usize) -> f32 {
    let (p, c) = (&world.params, &world.creatures);
    let drag = p.get(id::DRAG_ANG);
    let heft = heft(c.part_sum(s, p.get(id::EYE_COST)), p.get(id::PART_MASS));
    let steer = p.get(id::CILIA_TORQUE) * c.cilia[s]
        + p.get(id::FLAG_TORQUE) * (c.flag_push[s] + c.flag_side[s])
        + p.get(id::FIN_TORQUE) * c.fin[s] * top_speed(world, s) / p.get(id::V_MAX);
    let a_ang = steer / (2.0 * p.get(id::INERTIA_K) * c.len[s] * REF_WIDTH * heft);
    a_ang * (1.0 - drag) / drag
}

/// The live slots by body plan, the most common plan first. A plan is the sorted list of the part
/// kinds of a genome. Of two plans as common, the lower list comes first.
pub fn plans(world: &World) -> Vec<(Vec<u8>, Vec<usize>)> {
    let mut by_plan: HashMap<Vec<u8>, Vec<usize>> = HashMap::new();
    for s in live(world) {
        let mut plan: Vec<u8> = world.genomes[s].parts.iter().map(|p| p.kind).collect();
        plan.sort_unstable();
        by_plan.entry(plan).or_default().push(s);
    }
    let mut plans: Vec<_> = by_plan.into_iter().collect();
    plans.sort_by(|a, b| b.1.len().cmp(&a.1.len()).then_with(|| a.0.cmp(&b.0)));
    plans
}

/// The default world of the seed at the end of the run. `blind` names a sense gain to hold at 0.
fn world_after(seed: u32, a: &Args, blind: Option<usize>) -> World {
    let mut params = a.params.clone();
    // After the flags of the command line, so that it wins.
    params.extend(blind.map(|gain| (gain, 0.0)));
    let mut world = default_world(seed, &params);
    world.run(a.ticks);
    world
}

/// One seed of the gate: the printed measures and the bands that it left. Three runs, one at a
/// time: the world as given, then with the scent sense blind, then with the eyes blind.
fn measure(seed: u32, a: &Args) -> (String, Vec<String>) {
    let world = world_after(seed, a, None);
    let c = &world.creatures;
    let creatures = c.slots.count();
    let (len, len_sd) = mean_sd(live(&world).map(|s| c.len[s]));
    let parts = mean_sd(live(&world).map(|s| world.genomes[s].parts.len() as f32)).0;
    let chemo = mean_sd(live(&world).map(|s| c.chemo[s])).0;
    let eye = mean_sd(live(&world).map(|s| c.eye_sum[s])).0;
    let held =
        |plan: &&(Vec<u8>, Vec<usize>)| plan.1.len() as f64 >= PLAN_SHARE * f64::from(creatures);
    let plans = plans(&world).iter().filter(held).count();
    let adults = live(&world).filter(|&s| c.growth[s] >= 1.0);
    let (speed, speed_sd) = mean_sd(adults.map(|s| top_speed(&world, s)));
    let speed_cv = if speed > 0.0 { speed_sd / speed } else { 0.0 };
    // Two readings with no band. Each is a mean over the living, as `probe-census` prints it.
    let speed = mean_sd(live(&world).map(|s| top_speed(&world, s))).0;
    let area = mean_sd(live(&world).map(|s| c.len[s] * c.len[s] * c.wid[s])).0;

    let blind = world_after(seed, a, Some(id::CHEMO_GAIN));
    let creatures_noscent = blind.creatures.slots.count();
    let chemo_blind = mean_sd(live(&blind).map(|s| blind.creatures.chemo[s])).0;
    let blind = world_after(seed, a, Some(id::EYE_GAIN));
    let creatures_noeye = blind.creatures.slots.count();
    let eye_blind = mean_sd(live(&blind).map(|s| blind.creatures.eye_sum[s])).0;
    let (chemo_gap, eye_gap) = (chemo - chemo_blind, eye - eye_blind);

    let mut failures = Vec::new();
    let mut band = |ok: bool, what: String| {
        if !ok {
            failures.push(what);
        }
    };
    band(
        creatures >= CREATURES,
        format!("creatures={creatures} < {CREATURES}"),
    );
    band(len >= LEN.0, format!("len={len:.2} < {}", LEN.0));
    band(len <= LEN.1, format!("len={len:.2} > {}", LEN.1));
    band(len_sd >= LEN_SD, format!("len_sd={len_sd:.2} < {LEN_SD}"));
    band(parts >= PARTS, format!("parts={parts:.2} < {PARTS}"));
    band(
        chemo_gap >= CHEMO_GAP,
        format!("chemo_gap={chemo_gap:.3} < {CHEMO_GAP}"),
    );
    band(
        creatures_noscent >= CREATURES,
        "chemo_blind run died".to_string(),
    );
    band(
        eye_gap >= EYE_GAP,
        format!("eye_gap={eye_gap:.3} < {EYE_GAP}"),
    );
    band(
        creatures_noeye >= CREATURES,
        "eye_blind run died".to_string(),
    );
    let row = format!(
        "seed={seed} creatures={creatures} creatures_noscent={creatures_noscent} creatures_noeye={creatures_noeye} len={len:.1} len_sd={len_sd:.2} parts={parts:.1} chemo={chemo:.2} chemo_blind={chemo_blind:.2} eye={eye:.2} eye_blind={eye_blind:.2} plans={plans} speed_cv={speed_cv:.2} speed={speed:.2} area={area:.1}"
    );
    (row, failures)
}

/// `gate-evolve`.
pub fn gate(argv: &[String]) {
    judge(
        "gate-evolve",
        &args(argv, &[1, 2, 3], Some("--ticks"), 36000),
        measure,
    );
}

#[cfg(test)]
mod tests {
    use tidepool_sim::genome::{Genome, KIND_CHEMO, KIND_FLAGELLUM};
    use tidepool_sim::world::SpawnAt;

    use super::*;

    /// One lone full-grown body with no fin, under the player's hand for 150 ticks at full thrust:
    /// first with no turn, then with the turn at 1. The two formulas must read what the motor
    /// settles at.
    #[test]
    fn the_formulas_read_what_the_motor_settles_at() {
        let bodies = [
            (12.0, 0.5, 0.5, 0.6),
            (8.0, 0.3, 1.0, 0.3),
            (20.0, 0.8, 0.0, 1.0),
        ];
        for (len, wid, chemo, flagellum) in bodies {
            let settle = |turn: f32| {
                let mut world = World::new(1, 1536.0, 1024.0);
                let mut genome = Genome::default();
                (genome.len, genome.wid) = (len, wid);
                genome.set_size(KIND_CHEMO, chemo);
                genome.set_size(KIND_FLAGELLUM, flagellum);
                let at = SpawnAt {
                    x: 200.0,
                    y: 512.0,
                    heading: 0.0,
                    growth: 1.0,
                    energy01: 0.9,
                    parent: 0,
                    generation: 0,
                    mark: 0,
                };
                let s = world.spawn(genome, at).expect("slot") as usize;
                world.creatures.bud_cooldown[s] = 1_000_000;
                assert!(world.possess(world.creatures.uid[s]));
                world.input(true, 1.0, turn, false);
                world.run(150);
                let c = &world.creatures;
                let speed = (c.vx[s] * c.vx[s] + c.vy[s] * c.vy[s]).sqrt();
                (
                    speed,
                    c.omega[s],
                    top_speed(&world, s),
                    turn_rate(&world, s),
                )
            };
            let (speed, _, top, _) = settle(0.0);
            let (_, omega, _, rate) = settle(1.0);
            assert!(
                (speed / top - 1.0).abs() < 0.01,
                "speed {speed} against {top}"
            );
            assert!(
                (omega / rate - 1.0).abs() < 0.01,
                "turn {omega} against {rate}"
            );
        }
    }
}
