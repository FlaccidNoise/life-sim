//! The probes of the M2 rules. Each runs the default world and prints what it reads. None has a
//! band.

use std::cmp::Reverse;
use std::collections::HashMap;
use std::io::Write;

use tidepool_sim::creature::MAX_EYES;
use tidepool_sim::eye::{EYE_HALF_MIN, EYE_HALF_SPAN};
use tidepool_sim::genome::{Genome, KIND_EYE};
use tidepool_sim::grid::CELL;
use tidepool_sim::world::World;

use crate::evolve::{self, mean_sd, top_speed, turn_rate};
use crate::health::{args, default_world, live, median};

/// Ticks between two rows of `probe-plants`.
const PLANT_ROW_TICKS: u32 = 4000;
/// `probe-crowd` takes its body at this tick, counts the bodies within this many units of it, and
/// holds full thrust for this many ticks.
const CROWD_TICK: u32 = 3000;
const CROWD_RADIUS: f32 = 30.0;
const CROWD_HOLD: u32 = 200;
/// `probe-plans` prints this many plans.
const PLANS_SHOWN: usize = 8;
/// By kind.
const KIND_NAMES: [&str; 7] = [
    "none",
    "flagellum",
    "cilia",
    "filter",
    "chemo",
    "fin",
    "eye",
];

/// `probe-plants`. One row every 4,000 ticks and one at the end of the run: where the plants are
/// and how fast they turn over.
pub fn plants(argv: &[String]) {
    let a = args(argv, &[1], Some("--ticks"), 36000);
    for &seed in &a.seeds {
        let mut world = default_world(seed, &a.params);
        let (mut alive, mut deaths) = (u64::from(world.plants.slots.count()), 0);
        while world.tick < a.ticks {
            world.run(PLANT_ROW_TICKS.min(a.ticks - world.tick));
            let p = &world.plants;
            let slots: Vec<usize> = (0..p.slots.high_water() as usize)
                .filter(|&s| p.slots.is_alive(s as u32))
                .collect();
            let mut cells: Vec<(u32, u32)> = slots
                .iter()
                .map(|&s| ((p.x[s] / CELL) as u32, (p.y[s] / CELL) as u32))
                .collect();
            cells.sort_unstable();
            cells.dedup();
            let died = world.stats.plant_deaths - deaths;
            // Every plant since the founders is a seedling, so the count moves by the seedlings
            // less the dead.
            let seedlings = slots.len() as u64 + died - alive;
            println!(
                "seed={seed} tick={} plants={} plant_deaths={died} seedlings={seedlings} cells={} reserve01={:.2} creatures={}",
                world.tick,
                slots.len(),
                cells.len(),
                mean_sd(slots.iter().map(|&s| p.reserve[s] / p.cap[s])).0,
                world.creatures.slots.count(),
            );
            (alive, deaths) = (slots.len() as u64, world.stats.plant_deaths);
            std::io::stdout().flush().expect("flush stdout");
        }
    }
}

/// One pick of `probe-heirs` at its death.
struct End {
    /// Full-grown at the pick tick.
    adult: bool,
    /// A living creature held the lineage mark of the pick at the end of the tick of its death.
    heir: bool,
    /// From the pick to the death.
    ticks: u32,
}

/// Takes every creature alive now as a pick, runs the world until the last of them has died, and
/// returns by uid what a player who possessed each one now, and left its brain to drive, would be
/// offered at its death.
///
/// A possession with no input changes no body, so one run of the world serves every pick. The
/// lineage mark of a pick is followed as `World::possess` and `repro::step` hand it on: now to the
/// living descendants through living parents, and later from each parent to its child. An heir is
/// a living creature with the mark, as in `World::write_heirs`.
fn follow(world: &mut World) -> HashMap<u32, End> {
    let (c, start) = (&world.creatures, world.tick);
    let mut picks: Vec<(u32, usize)> = live(world).map(|s| (c.uid[s], s)).collect();
    picks.sort_unstable();
    // By uid, for the living: the picks whose mark the creature carries. Its own is one.
    let mut marks: HashMap<u32, Vec<u32>> = HashMap::new();
    // By pick: the living that carry its mark.
    let mut carriers: HashMap<u32, u32> = HashMap::new();
    // By pick: full-grown now.
    let mut adult: HashMap<u32, bool> = HashMap::new();
    for &(uid, s) in &picks {
        // A parent has a lower uid than its child, so the marks of a living parent are here.
        let mut carried = marks.get(&c.parent[s]).cloned().unwrap_or_default();
        carried.push(uid);
        for &pick in &carried {
            *carriers.entry(pick).or_default() += 1;
        }
        marks.insert(uid, carried);
        adult.insert(uid, c.growth[s] >= 1.0);
    }

    let mut ends = HashMap::new();
    while ends.len() < picks.len() {
        let (uid_before, uids_before) = (world.next_uid, world.creatures.uid.clone());
        world.tick();
        let c = &world.creatures;
        // The dead of a tick go before its births, so a slot that was freed and filled again
        // holds another uid. A dead slot holds uid 0.
        let dead: Vec<u32> = (uids_before.iter().zip(&c.uid))
            .filter(|&(&before, &now)| before != 0 && now != before)
            .map(|(&before, _)| before)
            .collect();
        for uid in &dead {
            for pick in marks.remove(uid).unwrap_or_default() {
                *carriers.entry(pick).or_default() -= 1;
            }
        }
        for s in live(world).filter(|&s| c.uid[s] >= uid_before) {
            let carried = marks.get(&c.parent[s]).cloned().unwrap_or_default();
            for &pick in &carried {
                *carriers.entry(pick).or_default() += 1;
            }
            marks.insert(c.uid[s], carried);
        }
        for &uid in &dead {
            if let Some(&adult) = adult.get(&uid) {
                let (heir, ticks) = (carriers[&uid] > 0, world.tick - start);
                ends.insert(uid, End { adult, heir, ticks });
            }
        }
    }
    ends
}

/// `probe-heirs`. Runs to the pick tick and follows every creature alive then to its death. One
/// row for all picks, one for the picks that were full-grown, and one for the others: the share
/// with an heir at death, and the median ticks from the pick to the death.
pub fn heirs(argv: &[String]) {
    let a = args(argv, &[1], Some("--pick"), 3000);
    for &seed in &a.seeds {
        let mut world = default_world(seed, &a.params);
        world.run(a.ticks);
        let ends = follow(&mut world);
        for (group, keep) in [
            ("all", None),
            ("adults", Some(true)),
            ("juveniles", Some(false)),
        ] {
            let of_group = ends.values().filter(|e| keep.is_none_or(|k| k == e.adult));
            let picks = of_group.clone().count();
            let with_heir = of_group.clone().filter(|e| e.heir).count();
            println!(
                "seed={seed} pick={} group={group} picks={picks} heir={:.2} median_ticks={:.0}",
                a.ticks,
                with_heir as f64 / picks.max(1) as f64,
                median(of_group.map(|e| e.ticks as f32).collect()),
            );
        }
        std::io::stdout().flush().expect("flush stdout");
    }
}

/// `probe-crowd`. At tick 3,000 it possesses the adult with the most bodies near it and holds full
/// thrust. It prints the mean speed of that body over its top speed alone.
pub fn crowd(argv: &[String]) {
    let a = args(argv, &[1], None, CROWD_TICK);
    for &seed in &a.seeds {
        let mut world = default_world(seed, &a.params);
        world.run(a.ticks);
        let c = &world.creatures;
        let neighbours = |s: usize| {
            let near = |o: &usize| {
                let (dx, dy) = (c.x[*o] - c.x[s], c.y[*o] - c.y[s]);
                *o != s && dx * dx + dy * dy <= CROWD_RADIUS * CROWD_RADIUS
            };
            live(&world).filter(near).count()
        };
        // Of two adults as crowded, the lower slot.
        let most = live(&world)
            .filter(|&s| c.growth[s] >= 1.0)
            .max_by_key(|&s| (neighbours(s), Reverse(s)));
        let Some(s) = most else {
            println!("seed={seed} tick={} no adult", world.tick);
            continue;
        };
        let (uid, near, alone) = (c.uid[s], neighbours(s), top_speed(&world, s));
        world.possess(uid);
        world.input(true, 1.0, 0.0);
        // The body can die while it is held. The mean is over the ticks that it lived.
        let (mut speed_sum, mut held) = (0.0, 0u32);
        while held < CROWD_HOLD {
            world.tick();
            if world.control.possessed == 0 {
                break;
            }
            let c = &world.creatures;
            speed_sum += f64::from((c.vx[s] * c.vx[s] + c.vy[s] * c.vy[s]).sqrt());
            held += 1;
        }
        let speed = speed_sum / f64::from(held.max(1));
        println!(
            "seed={seed} tick={} uid={uid} neighbours={near} held={held} mean_speed={speed:.2} top_speed={alone:.2} ratio={:.2}",
            a.ticks,
            speed / f64::from(alone),
        );
    }
}

/// A plan as text: its kinds joined by `+`, with a count before a kind that it holds more than
/// once. `flagellum+cilia+filter+chemo+2eye`.
fn plan_name(plan: &[u8]) -> String {
    let kinds = plan.chunk_by(|a, b| a == b).map(|same| {
        let name = KIND_NAMES.get(same[0] as usize).copied().unwrap_or("?");
        match same.len() {
            1 => name.to_string(),
            n => format!("{n}{name}"),
        }
    });
    match kinds.collect::<Vec<_>>() {
        kinds if kinds.is_empty() => "none".to_string(),
        kinds => kinds.join("+"),
    }
}

/// The angles of the eye cones of a body, summed, in radians. An eye off the midline is a pair,
/// and cones past `MAX_EYES` are not made, as in `Creatures::express`.
fn eye_angle(genome: &Genome) -> f32 {
    let eyes = genome.parts.iter().filter(|part| part.kind == KIND_EYE);
    let cones = eyes.flat_map(|eye| {
        let midline = eye.anchor <= 0.0 || eye.anchor >= 1.0;
        let angle = 2.0 * (EYE_HALF_MIN + EYE_HALF_SPAN * eye.extra.clamp(0.0, 1.0));
        std::iter::repeat_n(angle, if midline { 1 } else { 2 })
    });
    cones.take(MAX_EYES).fold(0.0, |sum, angle| sum + angle)
}

/// `probe-plans`. The most common body plans at the end of the run, and how a body of each moves
/// and sees. Each number is a mean over the living that hold the plan.
pub fn plans(argv: &[String]) {
    let a = args(argv, &[1], Some("--ticks"), 36000);
    for &seed in &a.seeds {
        let mut world = default_world(seed, &a.params);
        world.run(a.ticks);
        let (c, plans) = (&world.creatures, evolve::plans(&world));
        println!(
            "seed={seed} tick={} creatures={} plans={}",
            world.tick,
            c.slots.count(),
            plans.len()
        );
        for (plan, held) in plans.iter().take(PLANS_SHOWN) {
            let mean = |of: &dyn Fn(usize) -> f32| mean_sd(held.iter().map(|&s| of(s))).0;
            println!(
                "seed={seed} plan={} share={:.2} len={:.1} top_speed={:.2} turn_rate={:.3} eye_angle={:.2}",
                plan_name(plan),
                held.len() as f64 / f64::from(c.slots.count()),
                mean(&|s| c.len[s]),
                mean(&|s| top_speed(&world, s)),
                mean(&|s| turn_rate(&world, s)),
                mean(&|s| eye_angle(&world.genomes[s])),
            );
        }
        std::io::stdout().flush().expect("flush stdout");
    }
}

#[cfg(test)]
mod tests {
    use tidepool_sim::params::id;

    use super::*;

    /// `follow` hands the lineage mark on by its own count. This holds it to the real thing: for
    /// some picks, possess the pick in a copy of the world, run to its death, and ask
    /// `write_heirs`. A short `lifespan` keeps the run short. With a `brood_max` of 1 the picks
    /// that are checked hold both kinds: at 4 none of the 11 has an heir.
    #[test]
    fn follow_agrees_with_possess_and_write_heirs() {
        let mut world = default_world(1, &[(id::LIFESPAN, 1200.0), (id::BROOD_MAX, 1.0)]);
        world.run(PICK);
        let snapshot = world.save();
        let ends = follow(&mut world);
        let mut uids: Vec<u32> = ends.keys().copied().collect();
        uids.sort_unstable();
        let (mut with_heir, mut without) = (0, 0);
        for uid in uids.into_iter().step_by(ends.len() / CHECKED) {
            let mut copy = World::load(&snapshot).expect("a snapshot that this test saved loads");
            assert!(copy.possess(uid));
            while copy.control.possessed != 0 {
                copy.tick();
            }
            assert_eq!(copy.tick - PICK, ends[&uid].ticks, "uid {uid}");
            assert_eq!(copy.write_heirs() > 0, ends[&uid].heir, "uid {uid}");
            if ends[&uid].heir {
                with_heir += 1;
            } else {
                without += 1;
            }
        }
        assert!(with_heir > 0 && without > 0, "{with_heir} and {without}");
    }

    const PICK: u32 = 150;
    const CHECKED: usize = 10;
}
