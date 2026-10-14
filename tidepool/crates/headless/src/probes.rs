//! The probes of the M2 and M3 rules. Each runs the default world and prints what it reads. None
//! has a band.

use std::cmp::Reverse;
use std::collections::HashMap;
use std::io::Write;

use tidepool_sim::brain::{self, IN_MATE_SIZE};
use tidepool_sim::creature::MAX_EYES;
use tidepool_sim::eye::{EYE_HALF_MIN, EYE_HALF_SPAN};
use tidepool_sim::genome::{Genome, Node, BODY, KIND_CHEMO, KIND_EYE};
use tidepool_sim::grid::CELL;
use tidepool_sim::world::World;

use crate::evolve::{self, mean_sd, of_sense, top_speed, turn_rate, Mind};
use crate::health::{args, default_world, live, median};
use crate::{usage, value};

/// Ticks between two rows of `probe-plants` and of `probe-mix`.
const ROW_TICKS: u32 = 4000;
/// `probe-brains` counts a connection whose weight is larger than this in size.
const WIRE_SIZE: f32 = 0.1;
/// `probe-crowd` takes its body at this tick, counts the bodies within this many units of it, and
/// holds full thrust for this many ticks.
const CROWD_TICK: u32 = 3000;
const CROWD_RADIUS: f32 = 30.0;
const CROWD_HOLD: u32 = 200;
/// `probe-plans` prints this many plans, and `probe-brains` this many shapes.
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
            world.run(ROW_TICKS.min(a.ticks - world.tick));
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
        world.input(true, 1.0, 0.0, false);
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

/// The mean. NaN for no values, so that a world with nobody in it does not read as a world of
/// zeros.
fn mean(values: impl Iterator<Item = f32>) -> f64 {
    let (sum, n) = values.fold((0.0, 0u32), |(sum, n), v| (sum + f64::from(v), n + 1));
    sum / f64::from(n)
}

/// One row of `probe-census`: the world as it is now. Each gene and each part sum is a mean over
/// the living. `eaten` is the energy eaten per tick since the row before.
fn census_row(seed: u32, world: &World, eaten: f64) -> String {
    let (c, p) = (&world.creatures, &world.plants);
    let of_living = |of: &dyn Fn(usize) -> f32| mean(live(world).map(of));
    let share = |of: &dyn Fn(usize) -> bool| of_living(&|s| f32::from(u8::from(of(s))));
    let senseless = |s: usize| {
        let mut parts = world.genomes[s].parts.iter();
        !parts.any(|part| part.kind == KIND_CHEMO || part.kind == KIND_EYE)
    };
    let without =
        |kind: u8| share(&|s| world.genomes[s].parts.iter().all(|part| part.kind != kind));
    let plants = (0..p.slots.high_water() as usize).filter(|&s| p.slots.is_alive(s as u32));
    let mut row = format!(
        "seed={seed} tick={} creatures={} plants={} juv={:.2} len={:.1} wid={:.2} egg={:.2} old={:.0} area={:.1}",
        world.tick,
        c.slots.count(),
        p.slots.count(),
        share(&|s| c.growth[s] < 1.0),
        of_living(&|s| c.len[s]),
        of_living(&|s| c.wid[s]),
        of_living(&|s| c.egg[s]),
        of_living(&|s| c.old[s]),
        of_living(&|s| c.len[s] * c.len[s] * c.wid[s]),
    );
    for (kind, name) in (1..).zip(&KIND_NAMES[1..]) {
        let sum = of_living(&|s| world.genomes[s].size_of(kind));
        row += &format!(" {name}={sum:.2}");
    }
    row += &format!(
        " parts={:.1} senseless={:.2} speed={:.2} turn={:.3} eaten={eaten:.2} reserve01={:.2} no_chemo={:.2} no_eye={:.2}",
        of_living(&|s| world.genomes[s].parts.len() as f32),
        share(&senseless),
        of_living(&|s| top_speed(world, s)),
        of_living(&|s| turn_rate(world, s)),
        mean(plants.map(|s| p.reserve[s] / p.cap[s])),
        without(KIND_CHEMO),
        without(KIND_EYE),
    );
    row
}

/// `probe-census`. One row for each seed at each multiple of `--every`: who lives, what genes and
/// parts they hold, how they move, and what the world eats.
pub fn census(argv: &[String]) {
    // `--every` is this probe's own flag. `args` reads the others.
    let (mut every, mut others) = (12000, Vec::new());
    let mut it = argv.iter();
    while let Some(flag) = it.next() {
        if flag == "--every" {
            every = value::<u32>(flag, it.next().map(String::as_str));
        } else {
            others.push(flag.clone());
        }
    }
    let a = args(&others, &[1, 2, 3], Some("--ticks"), 36000);
    if every == 0 || every > a.ticks {
        usage(&format!(
            "--every needs a value from 1 to --ticks, which is {}",
            a.ticks
        ));
    }
    for &seed in &a.seeds {
        let mut world = default_world(seed, &a.params);
        while world.tick + every <= a.ticks {
            let eaten = world.stats.eaten;
            world.run(every);
            let per_tick = (world.stats.eaten - eaten) / f64::from(every);
            println!("{}", census_row(seed, &world, per_tick));
            // A killed run keeps the rows it finished.
            std::io::stdout().flush().expect("flush stdout");
        }
    }
}

/// The least value, the three quartiles, the largest value, and the mean. A quartile is the value
/// at that share of the sorted list, as in `median`.
fn spread(mut v: Vec<f32>) -> String {
    v.sort_by(f32::total_cmp);
    let at = |quarter: usize| {
        let i = (v.len() * quarter / 4).min(v.len().saturating_sub(1));
        v.get(i).copied().unwrap_or(f32::NAN)
    };
    format!(
        "min={:.0} q1={:.0} median={:.0} q3={:.0} max={:.0} mean={:.2}",
        at(0),
        at(1),
        at(2),
        at(3),
        at(4),
        mean(v.iter().copied()),
    )
}

/// `probe-brains`. The brains of the living at the end of the run: the spread of the three counts
/// that the long gate reads, the most common shapes by the rule of its `variety` band, the share
/// of bodies with a connection above 0.1 in size from each group of inputs, and the share that
/// accept a mate.
pub fn brains(argv: &[String]) {
    let a = args(argv, &[1], Some("--ticks"), 36000);
    for &seed in &a.seeds {
        let mut world = default_world(seed, &a.params);
        world.run(a.ticks);
        let minds = evolve::minds(&world);
        println!("seed={seed} tick={} creatures={}", world.tick, minds.len());
        // `hidden` is the measure of the gate: the hidden neurons on a path from an input to an
        // output. `hidden_genes` is every hidden neuron, as a shape counts them.
        let row = |name: &str, of: fn(&Mind) -> usize| {
            let values = minds.iter().map(|m| of(m) as f32).collect();
            println!("seed={seed} {name} {}", spread(values));
        };
        row("hidden", |m| m.wired);
        row("hidden_genes", |m| m.hidden);
        row("conns", |m| m.conns);
        let shapes = evolve::shapes(evolve::shape, &minds);
        let variety = evolve::variety(shapes.iter().map(|held| held.1));
        println!("seed={seed} variety={variety:.1}");
        for ((hidden, core), held) in shapes.iter().take(PLANS_SHOWN) {
            println!(
                "seed={seed} shape hidden_genes={hidden} core_conns={core} share={:.2}",
                *held as f64 / minds.len() as f64,
            );
        }
        let share = |of: &dyn Fn(usize) -> bool| mean(live(&world).map(|s| f32::from(of(s))));
        let wired_from = |group: fn(Node) -> bool| {
            share(&|s| {
                let inputs = brain::ports(&world.genomes[s]).inputs;
                let counts = |(src, _, weight): (usize, usize, f32)| {
                    weight.abs() > WIRE_SIZE && inputs.get(src).is_some_and(|&i| group(i))
                };
                evolve::wires(&world, s).any(counts)
            })
        };
        println!(
            "seed={seed} wired body={:.2} mate={:.2} scent={:.2} eye={:.2} accept={:.2}",
            wired_from(|i| !of_sense(i) && i.port < IN_MATE_SIZE),
            wired_from(|i| !of_sense(i) && i.port >= IN_MATE_SIZE),
            wired_from(|i| of_sense(i) && i.owner == BODY),
            wired_from(|i| i.owner != BODY),
            share(&|s| world.creatures.cmd_accept[s] > 0.0),
        );
        std::io::stdout().flush().expect("flush stdout");
    }
}

/// By slot: the uid of the body and the uid of its donor. 0 and 0 for a dead slot, which can hold
/// a stale donor, and a donor of 0 for a body that holds none.
fn holders(world: &World) -> Vec<(u32, u32)> {
    let c = &world.creatures;
    let holder = |s: usize| {
        if !c.slots.is_alive(s as u32) {
            return (0, 0);
        }
        (c.uid[s], world.donors[s].as_ref().map_or(0, |d| d.0))
    };
    (0..c.slots.high_water() as usize).map(holder).collect()
}

/// What one tick mixed: the pairs made, and the children of a cross born. `before` is `holders`
/// from before the tick, and a body with a uid at or above `uid_before` was born in it.
///
/// A pair is made when two bodies take each other as donor. A body that holds a donor now, and
/// did not hold that donor before the tick, was in a pair of this tick. The pair is counted once,
/// by the two uids, so it is still counted when one of the two died or budded in the same tick. A
/// pair where both did is not seen.
fn mixed(world: &World, before: &[(u32, u32)], uid_before: u32) -> (u64, u64) {
    let now = holders(world);
    let new = |&(s, held): &(usize, &(u32, u32))| held.1 != 0 && before.get(s) != Some(held);
    let mut pairs: Vec<(u32, u32)> = (now.iter().enumerate().filter(new))
        .map(|(_, &(uid, donor))| (uid.min(donor), uid.max(donor)))
        .collect();
    pairs.sort_unstable();
    pairs.dedup();
    let c = &world.creatures;
    let crossed = live(world).filter(|&s| c.uid[s] >= uid_before && c.mixed_with[s] != 0);
    (pairs.len() as u64, crossed.count() as u64)
}

/// `probe-mix`. One row every 4,000 ticks and one at the end of the run: the pairs made, the
/// births, and the births of a cross since the row before, and the bodies that hold a donor now.
pub fn mix(argv: &[String]) {
    let a = args(argv, &[1], Some("--ticks"), 36000);
    for &seed in &a.seeds {
        let mut world = default_world(seed, &a.params);
        while world.tick < a.ticks {
            let (births, mut pairs, mut crossed) = (world.stats.births, 0, 0);
            for _ in 0..ROW_TICKS.min(a.ticks - world.tick) {
                let (before, uid_before) = (holders(&world), world.next_uid);
                world.tick();
                let (made, born) = mixed(&world, &before, uid_before);
                (pairs, crossed) = (pairs + made, crossed + born);
            }
            println!(
                "seed={seed} tick={} pairs={pairs} births={} crossed={crossed} donors={} creatures={}",
                world.tick,
                world.stats.births - births,
                holders(&world).iter().filter(|held| held.1 != 0).count(),
                world.creatures.slots.count(),
            );
            std::io::stdout().flush().expect("flush stdout");
        }
    }
}

#[cfg(test)]
mod tests {
    use tidepool_sim::genome::{KIND_FILTER, KIND_FIN, KIND_FLAGELLUM};
    use tidepool_sim::params::id;
    use tidepool_sim::world::SpawnAt;

    use super::*;

    /// The value of one column of a row.
    fn column<'a>(row: &'a str, name: &str) -> &'a str {
        let mut pairs = row.split(' ').filter_map(|pair| pair.split_once('='));
        let found = pairs.find(|(key, _)| *key == name);
        found.unwrap_or_else(|| panic!("no {name} in {row}")).1
    }

    /// Two bodies that differ in every gene and that hold a different size of every kind of part,
    /// and two plants. Each column of the row has its own value, so a column that read another
    /// field would show it.
    #[test]
    fn a_census_row_reads_each_column_from_its_own_field() {
        let mut world = World::new(1, 256.0, 256.0);
        let mut rich = Genome::default();
        (rich.len, rich.wid, rich.egg, rich.old) = (10.0, 0.4, 0.3, 2400.0);
        for (kind, size) in [(KIND_FILTER, 0.8), (KIND_FIN, 0.3), (KIND_EYE, 0.2)] {
            rich.set_size(kind, size);
        }
        let mut bare = Genome::default();
        (bare.len, bare.wid, bare.egg, bare.old) = (20.0, 0.6, 0.5, 4800.0);
        bare.parts
            .retain(|part| part.kind == KIND_FLAGELLUM || part.kind == KIND_FILTER);
        bare.set_size(KIND_FLAGELLUM, 0.2);
        bare.set_size(KIND_FILTER, 0.4);
        for (genome, x, growth) in [(rich, 50.0, 1.0), (bare, 150.0, 0.5)] {
            let at = SpawnAt {
                x,
                y: 100.0,
                heading: 0.0,
                growth,
                energy01: 0.5,
                parent: 0,
                generation: 0,
                mark: 0,
            };
            world.spawn(genome, at).expect("slot");
        }
        for (reserve, cap) in [(5.0, 10.0), (20.0, 20.0)] {
            let s = world.plants.slots.alloc().expect("plant slot") as usize;
            (world.plants.reserve[s], world.plants.cap[s]) = (reserve, cap);
        }

        let row = census_row(7, &world, 1.5);
        let speed = (top_speed(&world, 0) + top_speed(&world, 1)) / 2.0;
        let turn = (turn_rate(&world, 0) + turn_rate(&world, 1)) / 2.0;
        assert!(top_speed(&world, 0) != top_speed(&world, 1));
        let want = [
            ("seed", "7".to_string()),
            ("tick", "0".to_string()),
            ("creatures", "2".to_string()),
            ("plants", "2".to_string()),
            ("juv", "0.50".to_string()),
            ("len", "15.0".to_string()),
            ("wid", "0.50".to_string()),
            ("egg", "0.40".to_string()),
            ("old", "3600".to_string()),
            // 10 * 10 * 0.4 and 20 * 20 * 0.6.
            ("area", "140.0".to_string()),
            ("flagellum", "0.40".to_string()),
            ("cilia", "0.20".to_string()),
            ("filter", "0.60".to_string()),
            ("chemo", "0.25".to_string()),
            ("fin", "0.15".to_string()),
            ("eye", "0.10".to_string()),
            ("parts", "4.0".to_string()),
            ("senseless", "0.50".to_string()),
            ("speed", format!("{speed:.2}")),
            ("turn", format!("{turn:.3}")),
            ("eaten", "1.50".to_string()),
            ("reserve01", "0.75".to_string()),
            ("no_chemo", "0.50".to_string()),
            ("no_eye", "0.50".to_string()),
        ];
        for (name, value) in &want {
            assert_eq!(column(&row, name), value, "{name} in {row}");
        }
        assert_eq!(row.split(' ').count(), want.len(), "{row}");
    }

    /// The default world after a short run. The founders hold no eye, and no part is added, lost,
    /// or copied, so the row must say that nobody has an eye. Then the same world with the
    /// chemoreceptor taken from every founder: nobody has a sense.
    #[test]
    fn a_census_row_reads_the_senses_of_a_world() {
        let no_eye = [
            (id::FOUNDER_EYE, 0.0),
            (id::MUT_PART_ADD, 0.0),
            (id::MUT_PART_REMOVE, 0.0),
            (id::MUT_PART_DUP, 0.0),
        ];
        let mut world = default_world(1, &no_eye);
        world.run(CENSUS_TICKS);
        let row = census_row(1, &world, 0.0);
        assert!(world.stats.births > 0, "nobody was born: {row}");
        assert_eq!(column(&row, "eye"), "0.00", "{row}");
        assert_eq!(column(&row, "senseless"), "0.00", "{row}");
        assert_eq!(column(&row, "no_chemo"), "0.00", "{row}");
        assert_eq!(column(&row, "no_eye"), "1.00", "{row}");
        assert_eq!(column(&row, "parts"), "4.0", "{row}");
        assert!(column(&row, "chemo").parse::<f64>().expect("a number") > 0.3);

        let mut world = default_world(1, &no_eye);
        for s in live(&world).collect::<Vec<_>>() {
            world.genomes[s]
                .parts
                .retain(|part| part.kind != KIND_CHEMO);
            world.creatures.express(s, &world.genomes[s]);
        }
        world.run(CENSUS_TICKS);
        let row = census_row(1, &world, 0.0);
        assert!(world.stats.births > 0, "nobody was born: {row}");
        assert_eq!(column(&row, "senseless"), "1.00", "{row}");
        assert_eq!(column(&row, "no_chemo"), "1.00", "{row}");
        assert_eq!(column(&row, "chemo"), "0.00", "{row}");
        assert_eq!(column(&row, "eye"), "0.00", "{row}");
        assert_eq!(column(&row, "parts"), "3.0", "{row}");
    }

    /// With nobody alive a mean is not a number, and the row says so.
    #[test]
    fn a_census_row_of_an_empty_world_holds_no_zero_for_a_mean() {
        let row = census_row(1, &World::new(1, 256.0, 256.0), 0.0);
        assert_eq!(column(&row, "creatures"), "0", "{row}");
        for name in [
            "juv",
            "len",
            "eye",
            "parts",
            "senseless",
            "speed",
            "reserve01",
        ] {
            assert_eq!(column(&row, name), "NaN", "{name} in {row}");
        }
    }

    const CENSUS_TICKS: u32 = 400;

    /// Mixing is not built, so this sets by hand what a tick of it will set. Three bodies with
    /// the uids 1, 2, 3.
    #[test]
    fn a_pair_is_counted_once_and_a_child_of_a_cross_is_counted() {
        let mut world = World::new(1, 256.0, 256.0);
        let at = |parent: u32| SpawnAt {
            x: 100.0,
            y: 100.0,
            heading: 0.0,
            growth: 1.0,
            energy01: 0.5,
            parent,
            generation: 0,
            mark: 0,
        };
        for _ in 0..3 {
            world.spawn(Genome::default(), at(0)).expect("slot");
        }
        let (before, uid_before) = (holders(&world), world.next_uid);
        assert_eq!(mixed(&world, &before, uid_before), (0, 0));

        // 1 and 2 take each other, and 3 buds a child of a cross.
        world.donors[0] = Some((2, Genome::default()));
        world.donors[1] = Some((1, Genome::default()));
        let child = world.spawn(Genome::default(), at(3)).expect("slot") as usize;
        world.creatures.mixed_with[child] = 1;
        assert_eq!(mixed(&world, &before, uid_before), (1, 1));
        assert_eq!(holders(&world)[..2], [(1, 2), (2, 1)]);

        // On the next tick the pair still holds and nothing is new.
        let (before, uid_before) = (holders(&world), world.next_uid);
        assert_eq!(mixed(&world, &before, uid_before), (0, 0));
        // 3 takes a body that is gone as donor: a pair. Then 3 dies, and its stale donor is not
        // read.
        world.donors[2] = Some((9, Genome::default()));
        assert_eq!(mixed(&world, &before, uid_before), (1, 0));
        world.kill(2, 0);
        assert_eq!(mixed(&world, &before, uid_before), (0, 0));
        assert_eq!(holders(&world)[2], (0, 0));
    }

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
