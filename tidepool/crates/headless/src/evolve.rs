//! The evolution gate: what a long run does to bodies, to senses, and to brains. It runs the
//! default world.

use std::collections::HashMap;

use tidepool_sim::brain::{self, IN_GRAD_FWD, IN_GRAD_SIDE, IN_SCENT, MAX_CONNS};
use tidepool_sim::creature::heft;
use tidepool_sim::genome::{Node, BODY, REF_WIDTH};
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
/// A body plan or a brain shape counts when this share of the living holds it.
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

/// What the gate reads of one brain.
pub struct Mind {
    /// Expressed hidden neurons.
    pub hidden: usize,
    /// Those with a way in from an input and a way out to an output.
    pub wired: usize,
    /// Expressed connections.
    pub conns: usize,
    /// Those with no end on an input of a sense.
    pub core: usize,
}

/// True for an input of a sense: a port of an eye gene, or one of the three scent inputs. The body
/// owns the scent inputs, and they come and go with the chemoreceptor all the same.
pub fn of_sense(input: Node) -> bool {
    input.owner != BODY || [IN_SCENT, IN_GRAD_FWD, IN_GRAD_SIDE].contains(&input.port)
}

/// The expressed connections of the slot: source and target as indexes into its block, and the
/// weight. A block holds its inputs in the order of `brain::ports`, then its hidden neurons, then
/// its outputs.
pub fn wires(world: &World, s: usize) -> impl Iterator<Item = (usize, usize, f32)> + '_ {
    let b = &world.brains;
    let at = s * MAX_CONNS..s * MAX_CONNS + b.n_conn[s] as usize;
    at.map(|i| (b.src[i] as usize, b.dst[i] as usize, b.w[i]))
}

/// How many hidden neurons of a block of `n` neurons have a way in from an input and a way out to
/// an output along `wires`. Each wire is a source and a target. The weight of a wire is not read,
/// so a neuron that `hidden_gain` silences still counts.
pub fn wired_hidden(n_in: usize, n_hidden: usize, n: usize, wires: &[(usize, usize)]) -> usize {
    // Every neuron that a path of wires joins to one of `seen`. `back` follows a wire from its
    // target to its source.
    let reach = |mut seen: Vec<bool>, back: bool| {
        let mut grew = true;
        while grew {
            grew = false;
            for &(src, dst) in wires {
                let (from, to) = if back { (dst, src) } else { (src, dst) };
                if seen[from] && !seen[to] {
                    (seen[to], grew) = (true, true);
                }
            }
        }
        seen
    };
    let hidden = n_in..n_in + n_hidden;
    let fed = reach((0..n).map(|i| i < hidden.start).collect(), false);
    let heard = reach((0..n).map(|i| i >= hidden.end).collect(), true);
    hidden.filter(|&h| fed[h] && heard[h]).count()
}

/// The brain of the slot as its block expresses it.
pub fn mind(world: &World, s: usize) -> Mind {
    let b = &world.brains;
    let (n, n_in) = (b.n_neur[s] as usize, b.n_in[s] as usize);
    let hidden = n - n_in - b.n_out[s] as usize;
    let inputs = brain::ports(&world.genomes[s]).inputs;
    let wires: Vec<(usize, usize)> = wires(world, s).map(|(src, dst, _)| (src, dst)).collect();
    // No connection runs into an input, so only the source of one can be an input of a sense.
    let sense = |&&(src, _): &&(usize, usize)| inputs.get(src).is_some_and(|&i| of_sense(i));
    Mind {
        hidden,
        wired: wired_hidden(n_in, hidden, n, &wires),
        conns: wires.len(),
        core: wires.len() - wires.iter().filter(sense).count(),
    }
}

/// The brains of the living, in slot order.
pub fn minds(world: &World) -> Vec<Mind> {
    live(world).map(|s| mind(world, s)).collect()
}

/// A brain shape by the rule of the `shapes` band: its hidden neurons, and its connections with no
/// end on an input of a sense. A body that gains or loses a sense keeps its shape.
pub fn shape(m: &Mind) -> (usize, usize) {
    (m.hidden, m.core)
}

/// The shapes with the number of brains that hold each, the most common first. Of two as common,
/// the lower one comes first.
pub fn shapes(of: fn(&Mind) -> (usize, usize), minds: &[Mind]) -> Vec<((usize, usize), usize)> {
    let mut by_shape: HashMap<(usize, usize), usize> = HashMap::new();
    for m in minds {
        *by_shape.entry(of(m)).or_default() += 1;
    }
    let mut shapes: Vec<_> = by_shape.into_iter().collect();
    shapes.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    shapes
}

/// The four brain measures of a row: `hidden`, `conns`, `shapes`, and `shapes_raw`.
fn brain_measures(minds: &[Mind]) -> (f64, f64, usize, usize) {
    let held = |of: fn(&Mind) -> (usize, usize)| {
        let common =
            |shape: &&((usize, usize), usize)| shape.1 as f64 >= PLAN_SHARE * minds.len() as f64;
        shapes(of, minds).iter().filter(common).count()
    };
    (
        mean_sd(minds.iter().map(|m| m.wired as f32)).0,
        mean_sd(minds.iter().map(|m| m.conns as f32)).0,
        held(shape),
        held(|m| (m.hidden, m.conns)),
    )
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
/// time: the world as given, then with the scent sense blind, then with the eyes blind. With
/// `brain`, a fourth: the world with `hidden_gain=0`, where a hidden neuron sends nothing.
fn measure(seed: u32, a: &Args, brain: bool) -> (String, Vec<String>) {
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
    let (hidden, conns, shapes, shapes_raw) = brain_measures(&minds(&world));

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
    let mut row = format!(
        "seed={seed} creatures={creatures} creatures_noscent={creatures_noscent} creatures_noeye={creatures_noeye} len={len:.1} len_sd={len_sd:.2} parts={parts:.1} chemo={chemo:.2} chemo_blind={chemo_blind:.2} eye={eye:.2} eye_blind={eye_blind:.2} plans={plans} speed_cv={speed_cv:.2} speed={speed:.2} area={area:.1} hidden={hidden:.2} conns={conns:.1} shapes={shapes} shapes_raw={shapes_raw}"
    );
    if brain {
        let null = minds(&world_after(seed, a, Some(id::HIDDEN_GAIN)));
        let (hidden_null, conns_null, ..) = brain_measures(&null);
        row += &format!(" hidden_null={hidden_null:.2} conns_null={conns_null:.1}");
    }
    (row, failures)
}

/// `gate-evolve`. `--brain` is this gate's own flag. `args` reads the others.
pub fn gate(argv: &[String]) {
    let brain = argv.iter().any(|flag| flag == "--brain");
    let others: Vec<String> = (argv.iter().filter(|flag| *flag != "--brain"))
        .cloned()
        .collect();
    let a = args(&others, &[1, 2, 3], Some("--ticks"), 36000);
    if brain {
        judge("gate-evolve", &a, |seed, a| measure(seed, a, true));
    } else {
        judge("gate-evolve", &a, |seed, a| measure(seed, a, false));
    }
}

#[cfg(test)]
mod tests {
    use tidepool_sim::genome::{Genome, KIND_CHEMO, KIND_EYE, KIND_FLAGELLUM};
    use tidepool_sim::rng::Rng;
    use tidepool_sim::world::SpawnAt;

    use super::*;

    /// A block of 2 inputs, the 5 hidden neurons 2 to 6, and the output 7.
    #[test]
    fn a_hidden_neuron_counts_only_with_a_way_in_and_a_way_out() {
        let wired = |wires: &[(usize, usize)]| wired_hidden(2, 5, 8, wires);
        assert_eq!(wired(&[]), 0);
        // A way in and no way out, a way out and no way in, and a loop on itself.
        assert_eq!(wired(&[(0, 2), (3, 7), (4, 4)]), 0);
        assert_eq!(wired(&[(0, 2), (2, 7)]), 1);
        // A chain, and a neuron on a loop off the chain: each is on a path from in to out.
        assert_eq!(wired(&[(1, 2), (2, 3), (3, 7), (3, 4), (4, 3)]), 3);
        // 5 hears an input through the output. 6 sends to 5 and hears nothing.
        assert_eq!(wired(&[(0, 7), (7, 5), (5, 7), (6, 5)]), 1);
    }

    /// Two bodies with one founder brain. The second has no eye and no chemoreceptor, so its
    /// block leaves out the 18 connections of the eye and the 14 of the scent. The two differ in
    /// no hidden neuron and in no other connection: one shape, and two raw shapes.
    #[test]
    fn a_lost_sense_changes_the_raw_shape_and_not_the_shape() {
        let mut world = World::new(1, 256.0, 256.0);
        let seeing = Genome::founder(&mut Rng::new(1), &world.params);
        let mut blind = seeing.clone();
        (blind.parts).retain(|part| part.kind != KIND_EYE && part.kind != KIND_CHEMO);
        for (genome, x) in [(seeing, 50.0), (blind, 150.0)] {
            let at = SpawnAt {
                x,
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
        let minds = minds(&world);
        let read = |m: &Mind| (m.hidden, m.wired, m.conns, m.core);
        assert_eq!(read(&minds[0]), (4, 4, 60, 28));
        assert_eq!(read(&minds[1]), (4, 4, 28, 28));
        assert_eq!(brain_measures(&minds), (4.0, 44.0, 1, 2));
    }

    /// 40 brains. A shape that one of them holds is under 5% and does not count. A shape that two
    /// hold is at 5% and counts.
    #[test]
    fn a_shape_counts_when_5_percent_of_the_living_hold_it() {
        let brain = |core: usize| Mind {
            hidden: 4,
            wired: 4,
            conns: 60,
            core,
        };
        let mut minds: Vec<Mind> = (0..40).map(|_| brain(28)).collect();
        minds[0] = brain(29);
        assert_eq!(brain_measures(&minds), (4.0, 60.0, 1, 1));
        minds[1] = brain(29);
        assert_eq!(brain_measures(&minds), (4.0, 60.0, 2, 1));
    }

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
