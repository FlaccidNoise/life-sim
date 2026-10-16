//! Rule F1 of the M4 plan: a dead body leaves debris, the debris decays, and a filter eats it after
//! the plants.

use tidepool_sim::control::CAUSE_STARVED;
use tidepool_sim::debris::{self, DEBRIS_RADIUS, MAX_DEBRIS};
use tidepool_sim::energy;
use tidepool_sim::genome::{Genome, REF_WIDTH};
use tidepool_sim::genome::{KIND_CHEMO, KIND_CILIA, KIND_FILTER, KIND_FLAGELLUM};
use tidepool_sim::params::id;
use tidepool_sim::rng::Rng;
use tidepool_sim::world::{SpawnAt, World};

const Y: f32 = 512.0;

fn empty() -> World {
    World::new(1, 1536.0, 1024.0)
}

/// The reference body at `x`, adult, with the founder's filter of 0.6 unless `edit` changes it.
fn add(w: &mut World, x: f32, energy01: f32, edit: impl FnOnce(&mut Genome)) -> usize {
    let mut g = Genome::founder(&mut Rng::new(1), &w.params);
    (g.len, g.wid) = (12.0, 0.5);
    for (kind, size) in [
        (KIND_FLAGELLUM, 0.6),
        (KIND_CILIA, 0.4),
        (KIND_FILTER, 0.6),
        (KIND_CHEMO, 0.5),
    ] {
        g.set_size(kind, size);
    }
    edit(&mut g);
    let at = SpawnAt {
        x,
        y: Y,
        heading: 0.0,
        growth: 1.0,
        energy01,
        parent: 0,
        generation: 0,
        mark: 0,
    };
    let slot = w.spawn(g, at).expect("slot") as usize;
    w.creatures.bud_cooldown[slot] = 1_000_000;
    slot
}

fn plant_at(w: &mut World, x: f32, reserve: f32) -> usize {
    let s = w.plants.slots.alloc().expect("plant slot") as usize;
    let p = &mut w.plants;
    (p.x[s], p.y[s], p.reserve[s], p.cap[s]) = (x, Y, reserve, 20.0);
    p.dirty = true;
    s
}

fn piece_at(w: &mut World, x: f32, energy: f32) -> usize {
    let s = w.debris.slots.alloc().expect("debris slot") as usize;
    let d = &mut w.debris;
    (d.x[s], d.y[s], d.energy[s]) = (x, Y, energy);
    d.dirty = true;
    s
}

/// Bodies stay where they are and plants do not change, so one rule is tested at a time.
fn still(w: &mut World) {
    for k in [
        id::PLANT_GROWTH,
        id::PLANT_SEED_CHANCE,
        id::PLANT_DEATH_RESERVE,
        id::FLAG_FORCE,
        id::CILIA_FORCE,
        id::REPEL,
        id::BASAL,
        id::FIXED_UPKEEP,
        id::NEURON_UPKEEP,
        id::CONN_UPKEEP,
        id::MOVE_COST,
    ] {
        w.params.set(k, 0.0);
    }
}

/// What rule F1 leaves for the body in slot `s` as it is now.
fn share_of(w: &World, s: usize) -> f32 {
    let p = &w.params;
    let mass = w
        .creatures
        .mass(s, p.get(id::PART_MASS), p.get(id::EYE_COST));
    p.get(id::CORPSE_SHARE) * (w.creatures.energy[s].max(0.0) + p.get(id::BUILD_COST) * mass)
}

#[test]
fn with_corpse_share_0_no_piece_is_made() {
    let mut w = World::new(3, 1536.0, 1024.0);
    w.params.set(id::CORPSE_SHARE, 0.0);
    w.seed_founders(300, 900);
    w.run(2000);
    assert!(w.stats.deaths > 0, "the run must have deaths");
    let s = add(&mut w, 700.0, 0.5, |_| {});
    w.kill(s as u32, CAUSE_STARVED, None);
    assert_eq!(w.debris.slots.count(), 0);
    assert_eq!(w.debris.slots.high_water(), 0);
    assert_eq!(w.stats.debris_eaten, 0.0);
}

#[test]
fn a_death_leaves_the_share_of_its_energy_and_built_mass() {
    let mut w = empty();
    w.params.set(id::CORPSE_SHARE, 0.5);
    let s = add(&mut w, 300.0, 0.5, |_| {});
    let want = share_of(&w, s);
    // The plan's arithmetic: half of a half store of 36 and of the built mass of about 76.7.
    assert!((want - 0.5 * (36.0 + 0.5 * 76.7)).abs() < 0.1, "{want}");
    w.kill(s as u32, CAUSE_STARVED, None);
    let d = &w.debris;
    assert_eq!(d.slots.count(), 1);
    assert_eq!((d.x[0], d.y[0], d.energy[0]), (300.0, Y, want));
    assert!(d.dirty);

    // A body below 0 leaves only the share of its built mass.
    let s = add(&mut w, 400.0, 0.5, |_| {});
    w.creatures.energy[s] = 0.0;
    let want = share_of(&w, s);
    w.creatures.energy[s] = -5.0;
    w.kill(s as u32, CAUSE_STARVED, None);
    assert_eq!(w.debris.energy[1], want);
}

/// A filter of budget `intake_rate * 0.6 * 12` under a plant and a piece.
fn one_contact(plant_reserve: f32, with_piece: bool) -> (World, usize, usize) {
    let mut w = empty();
    still(&mut w);
    let c = add(&mut w, 500.0, 0.1, |_| {});
    let p = plant_at(&mut w, 500.0, plant_reserve);
    if with_piece {
        piece_at(&mut w, 501.0, 10.0);
    }
    energy::contact(&mut w);
    (w, c, p)
}

#[test]
fn a_filter_eats_debris_after_plants_from_the_same_budget() {
    let p = |w: &World| w.params.get(id::INTAKE_RATE) * 0.6 * (72.0 / REF_WIDTH);
    // A small plant leaves budget, and the piece takes the rest of it.
    let (w, c, plant) = one_contact(4.0, true);
    let (bare, _, _) = one_contact(4.0, false);
    assert_eq!(w.plants.reserve[plant], bare.plants.reserve[plant]);
    let from_plant = 4.0 - w.plants.reserve[plant];
    assert!(from_plant > 0.0);
    // `debris_eaten` holds the take itself. The piece holds 10 less it, rounded at 10.
    let from_piece = w.stats.debris_eaten as f32;
    assert!(
        (from_piece - (p(&w) - from_plant)).abs() < 1e-6,
        "{from_piece}"
    );
    assert_eq!(w.debris.energy[0], 10.0 - from_piece);
    assert_eq!(w.stats.eaten, bare.stats.eaten);
    let gain = w.creatures.energy[c] - bare.creatures.energy[c];
    assert!((gain - from_piece).abs() < 1e-6);

    // A large plant takes the whole budget, and nothing is left for the piece.
    let (w, _, plant) = one_contact(20.0, true);
    let (bare, _, _) = one_contact(20.0, false);
    assert_eq!(w.plants.reserve[plant], bare.plants.reserve[plant]);
    assert_eq!(w.debris.energy[0], 10.0);
    assert_eq!(w.stats.debris_eaten, 0.0);

    // A piece out of reach is not eaten: the touch is the body's radius plus `DEBRIS_RADIUS`.
    let mut w = empty();
    still(&mut w);
    let c = add(&mut w, 500.0, 0.1, |_| {});
    let touch = w.creatures.radius(c) + DEBRIS_RADIUS;
    let out = piece_at(&mut w, 500.0 + touch + 0.01, 10.0);
    let inside = piece_at(&mut w, 500.0 - touch + 0.01, 10.0);
    energy::contact(&mut w);
    assert_eq!(w.debris.energy[out], 10.0);
    assert!(w.debris.energy[inside] < 10.0);
}

#[test]
fn a_full_body_takes_no_debris() {
    let mut w = empty();
    still(&mut w);
    w.params.set(id::DEBRIS_DECAY, 0.0);
    add(&mut w, 500.0, 1.0, |_| {});
    piece_at(&mut w, 500.0, 10.0);
    w.run(50);
    assert_eq!(w.debris.energy[0], 10.0);
    assert_eq!(w.stats.debris_eaten, 0.0);

    // A body with less room than budget takes only its room.
    let mut w = empty();
    still(&mut w);
    let c = add(&mut w, 500.0, 1.0, |_| {});
    w.creatures.energy[c] = 72.0 - 0.1;
    let room = 72.0 - w.creatures.energy[c];
    piece_at(&mut w, 500.0, 10.0);
    energy::contact(&mut w);
    assert_eq!(w.debris.energy[0], 10.0 - room);
    assert_eq!(w.creatures.energy[c], 72.0);
}

#[test]
fn a_piece_decays_and_is_freed_under_debris_min() {
    let mut w = empty();
    w.params.set(id::DEBRIS_DECAY, 0.1);
    w.params.set(id::DEBRIS_MIN, 0.5);
    let s = piece_at(&mut w, 500.0, 1.0);
    w.debris.refresh_grid();
    let keep = 1.0 - 0.1f32;
    let mut want = 1.0f32;
    // 0.9 to the 6th is 0.53, and to the 7th is 0.48.
    for _ in 0..6 {
        debris::step(&mut w);
        want *= keep;
        assert!(w.debris.slots.is_alive(s as u32));
        assert_eq!(w.debris.energy[s], want);
        assert!(!w.debris.dirty);
    }
    debris::step(&mut w);
    assert_eq!(w.debris.slots.count(), 0);
    assert!(w.debris.dirty);
}

#[test]
fn a_full_pool_loses_the_piece_and_nothing_panics() {
    let mut w = empty();
    still(&mut w);
    w.params.set(id::CORPSE_SHARE, 0.5);
    for _ in 0..MAX_DEBRIS {
        piece_at(&mut w, 100.0, 3.0);
    }
    let s = add(&mut w, 100.0, 0.5, |_| {});
    add(&mut w, 100.0, 0.2, |_| {});
    w.kill(s as u32, CAUSE_STARVED, None);
    assert!(!w.creatures.slots.is_alive(s as u32));
    assert_eq!(w.stats.deaths, 1);
    let d = &w.debris;
    assert_eq!(d.slots.count(), MAX_DEBRIS);
    assert!((0..MAX_DEBRIS as usize).all(|k| d.energy[k] == 3.0));
    // A filter eats from a full pool, and the pool decays.
    w.run(10);
    assert!(w.stats.debris_eaten > 0.0);
}

/// A closed run: plants do not grow, nobody pays upkeep, and bodies stay still. Eaters with a filter
/// live through it. Bodies with no filter die of old age on top of them, at known ticks and with a
/// known store, so what each death leaves is known from outside. `debris_min` is 0, so no piece is
/// freed, and the decay of each tick is `debris_decay` of the pool after eating and deaths.
#[test]
fn energy_in_equals_energy_out_over_a_closed_run() {
    let mut w = empty();
    still(&mut w);
    w.params.set(id::CORPSE_SHARE, 0.5);
    w.params.set(id::DEBRIS_DECAY, 0.002);
    w.params.set(id::DEBRIS_MIN, 0.0);
    let mut eaters = Vec::new();
    for k in 0..4 {
        let x = 200.0 + 200.0 * k as f32;
        eaters.push(add(&mut w, x, 0.1, |_| {}));
        plant_at(&mut w, x + 1.0, 6.0);
        for j in 0..3 {
            let old = 1000.0 + 150.0 * (3 * k + j) as f32;
            add(&mut w, x + 0.5, 0.5, |g| {
                g.set_size(KIND_FILTER, 0.0);
                g.old = old;
            });
        }
    }
    let n_plants = w.plants.slots.high_water() as usize;
    let plant_sum = |w: &World| {
        (0..n_plants)
            .map(|s| w.plants.reserve[s] as f64)
            .sum::<f64>()
    };
    let eater_sum = |w: &World| {
        eaters
            .iter()
            .map(|&s| w.creatures.energy[s] as f64)
            .sum::<f64>()
    };
    let pool = |w: &World| {
        let d = &w.debris;
        (0..d.slots.high_water())
            .filter(|&s| d.slots.is_alive(s))
            .map(|s| d.energy[s as usize] as f64)
            .sum::<f64>()
    };
    let (plants0, eaters0) = (plant_sum(&w), eater_sum(&w));
    let decay = w.params.get(id::DEBRIS_DECAY) as f64;
    let (mut made, mut decayed, mut pool_ticks) = (0.0f64, 0.0f64, 0.0f64);
    for _ in 0..4000 {
        let alive: Vec<(usize, f64)> = (0..w.creatures.slots.high_water() as usize)
            .filter(|&s| w.creatures.slots.is_alive(s as u32))
            .map(|s| (s, share_of(&w, s) as f64))
            .collect();
        let (before, eaten_before) = (pool(&w), w.stats.debris_eaten);
        w.tick();
        let made_now: f64 = alive
            .iter()
            .filter(|&&(s, _)| !w.creatures.slots.is_alive(s as u32))
            .map(|&(_, share)| share)
            .sum();
        made += made_now;
        decayed += decay * (before - (w.stats.debris_eaten - eaten_before) + made_now);
        pool_ticks += before;
    }
    assert_eq!(w.creatures.slots.count(), 4, "only the eaters are left");
    assert_eq!(w.debris.slots.count(), 12);
    let (debris_eaten, left) = (w.stats.debris_eaten, pool(&w));
    assert!(debris_eaten > 0.25 * made, "eaten {debris_eaten} of {made}");
    assert!(decayed > 1.0, "decayed {decayed}");

    // Each piece is rounded to f32 twice a tick, a relative error of 2^-24 each time. The sum of the
    // pool over the run bounds what that can add up to.
    let tolerance = pool_ticks * f32::EPSILON as f64 + 1e-6;
    let residual = made - (debris_eaten + decayed + left);
    assert!(
        residual.abs() < tolerance,
        "debris: made {made} = eaten {debris_eaten} + decayed {decayed} + left {left}, off by \
         {residual}, tolerance {tolerance}"
    );
    // The plants lose what `eaten` counts, and the eaters gain that and the debris they ate.
    let plants_eaten = w.stats.eaten;
    assert!(plants_eaten > 1.0);
    assert!((plants0 - plant_sum(&w) - plants_eaten).abs() < 1e-3);
    let gain = eater_sum(&w) - eaters0;
    assert!(
        (gain - plants_eaten - debris_eaten).abs() < 1e-3,
        "gain {gain}"
    );
}
