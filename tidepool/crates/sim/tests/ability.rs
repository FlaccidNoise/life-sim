// Tests run native only, so a banned float method is safe here.
#![allow(clippy::disallowed_methods)]

use tidepool_sim::ability::{self, MAX_CLOUDS};
use tidepool_sim::control::{self, ABILITY_DASH, ABILITY_TOXIN, CAUSE_POISONED};
use tidepool_sim::genome::{Genome, KIND_FLAGELLUM, KIND_JAW, KIND_TOXIN, REF_WIDTH};
use tidepool_sim::params::id;
use tidepool_sim::world::{SpawnAt, World};

fn at(x: f32, y: f32, heading: f32) -> SpawnAt {
    SpawnAt {
        x,
        y,
        heading,
        growth: 1.0,
        energy01: 0.5,
        parent: 0,
        generation: 0,
        mark: 0,
    }
}

/// The reference founder with a jaw and a gland of the sizes given. 0 for none.
fn genome(jaw: f32, gland: f32) -> Genome {
    let mut g = Genome::default();
    if jaw > 0.0 {
        g.set_size(KIND_JAW, jaw);
    }
    if gland > 0.0 {
        g.set_size(KIND_TOXIN, gland);
    }
    g
}

/// A world of its own with one body of the genome at slot 0.
fn one(g: Genome, heading: f32) -> World {
    let mut w = World::new(1, 512.0, 512.0);
    w.spawn(g, at(200.0, 200.0, heading)).expect("slot");
    w
}

/// The heft of slot `s`: its mass over its area.
fn heft(w: &World, s: usize) -> f32 {
    let p = &w.params;
    let c = &w.creatures;
    c.mass(s, p.get(id::PART_MASS), p.get(id::EYE_COST)) / c.area(s)
}

fn mouth(w: &World, s: usize) -> f32 {
    w.creatures.area(s) / REF_WIDTH
}

fn dash_on(w: &mut World) {
    w.params.set(id::DASH_IMPULSE, 2.0);
    w.params.set(id::DASH_SPIN, 0.3);
    w.params.set(id::DASH_COST, 0.5);
}

fn toxin_on(w: &mut World) {
    w.params.set(id::TOXIN_DRAIN, 0.3);
    w.params.set(id::TOXIN_COST, 2.0);
}

#[test]
fn a_dash_adds_speed_along_the_heading_and_spin_with_the_turn() {
    let heading = 0.7;
    let mut w = one(genome(0.0, 0.0), heading);
    dash_on(&mut w);
    let c = &mut w.creatures;
    (c.cmd_dash[0], c.cmd_turn[0]) = (1.0, 0.5);
    let flag = c.flag_push[0];
    assert!(flag > 0.0);
    ability::step(&mut w);
    let (gain, k) = (2.0 * flag / heft(&w, 0), heft(&w, 0));
    let c = &w.creatures;
    assert!((c.vx[0] - gain * heading.cos()).abs() < 1e-5);
    assert!((c.vy[0] - gain * heading.sin()).abs() < 1e-5);
    assert!((c.omega[0] - 0.3 * 0.5 * flag / k).abs() < 1e-6);
    assert_eq!(c.cd_dash[0], 100);
}

#[test]
fn a_dash_waits_out_its_cooldown_and_costs_energy() {
    let mut w = one(genome(0.0, 0.0), 0.0);
    dash_on(&mut w);
    w.params.set(id::ABILITY_COOLDOWN, 30.0);
    w.creatures.cmd_dash[0] = 1.0;
    let (e0, cost) = (w.creatures.energy[0], 0.5 * mouth(&w, 0));
    ability::step(&mut w);
    let (v1, e1) = (w.creatures.vx[0], w.creatures.energy[0]);
    assert!(v1 > 0.0);
    assert!((e0 - e1 - cost).abs() < 1e-5);
    // Each tick between the two uses: nothing.
    for _ in 1..30 {
        ability::step(&mut w);
        assert_eq!((w.creatures.vx[0], w.creatures.energy[0]), (v1, e1));
    }
    ability::step(&mut w);
    assert!(w.creatures.vx[0] > v1);
    assert!((e1 - w.creatures.energy[0] - cost).abs() < 1e-5);
    assert_eq!(w.creatures.cd_dash[0], 30);
}

#[test]
fn a_body_that_cannot_pay_does_not_dash() {
    let mut w = one(genome(0.0, 0.0), 0.0);
    dash_on(&mut w);
    let cost = 0.5 * mouth(&w, 0);
    // `energy - cost` is 0, not above it.
    (w.creatures.cmd_dash[0], w.creatures.energy[0]) = (1.0, cost);
    ability::step(&mut w);
    let c = &w.creatures;
    assert_eq!((c.vx[0], c.vy[0], c.omega[0]), (0.0, 0.0, 0.0));
    assert_eq!((c.energy[0], c.cd_dash[0]), (cost, 0));
    // A body without a flagellum does not dash either.
    let mut g = genome(0.0, 0.0);
    g.parts.retain(|p| p.kind != KIND_FLAGELLUM);
    let mut w = one(g, 0.0);
    dash_on(&mut w);
    w.creatures.cmd_dash[0] = 1.0;
    let e0 = w.creatures.energy[0];
    ability::step(&mut w);
    assert_eq!((w.creatures.vx[0], w.creatures.energy[0]), (0.0, e0));
    assert_eq!(w.creatures.cd_dash[0], 0);
}

#[test]
fn the_speed_limit_holds_through_a_dash() {
    let mut w = one(genome(0.0, 0.0), 0.0);
    w.params.set(id::DASH_IMPULSE, 8.0);
    let v_max = w.params.get(id::V_MAX);
    // The impulse alone is past the limit, even after a tick of drag.
    assert!(8.0 * w.creatures.flag_push[0] / heft(&w, 0) * 0.92 > v_max);
    w.creatures.cmd_dash[0] = 1.0;
    w.tick();
    let c = &w.creatures;
    assert_eq!(c.cd_dash[0], 100);
    let speed = (c.vx[0] * c.vx[0] + c.vy[0] * c.vy[0]).sqrt();
    assert!((speed - v_max).abs() < 1e-4, "speed {speed}");
}

#[test]
fn a_lunge_needs_a_jaw_and_raises_the_bite_for_lunge_ticks() {
    let lunge = |w: &mut World| {
        w.params.set(id::LUNGE_IMPULSE, 2.0);
        w.params.set(id::LUNGE_COST, 0.5);
        w.params.set(id::LUNGE_TICKS, 7.0);
        w.creatures.cmd_lunge[0] = 1.0;
    };
    let mut w = one(genome(0.0, 0.0), 0.0);
    lunge(&mut w);
    let e0 = w.creatures.energy[0];
    ability::step(&mut w);
    let c = &w.creatures;
    assert_eq!(
        (c.vx[0], c.energy[0], c.cd_lunge[0], c.lunge_left[0]),
        (0.0, e0, 0, 0)
    );

    let mut w = one(genome(0.5, 0.0), 0.0);
    lunge(&mut w);
    let (e0, cost) = (w.creatures.energy[0], 0.5 * mouth(&w, 0));
    ability::step(&mut w);
    let c = &w.creatures;
    assert!((c.vx[0] - 2.0 * 0.5 / heft(&w, 0)).abs() < 1e-5);
    assert!((e0 - c.energy[0] - cost).abs() < 1e-5);
    assert_eq!((c.cd_lunge[0], c.lunge_left[0]), (100, 7));
    // `bite::step` reads it on this tick and on the 6 after it.
    for left in (0..7).rev() {
        ability::step(&mut w);
        assert_eq!(w.creatures.lunge_left[0], left);
    }
    ability::step(&mut w);
    assert_eq!(w.creatures.lunge_left[0], 0);
}

/// A maker with a gland of 0.5 at slot 0, a body inside its cloud at slot 1, and one outside it at
/// slot 2. Each holds still.
fn cloud_world() -> World {
    let mut w = World::new(1, 512.0, 512.0);
    w.spawn(genome(0.0, 0.5), at(200.0, 200.0, 0.0))
        .expect("slot");
    w.spawn(genome(0.0, 0.0), at(210.0, 200.0, 0.0))
        .expect("slot");
    w.spawn(genome(0.0, 0.0), at(300.0, 200.0, 0.0))
        .expect("slot");
    toxin_on(&mut w);
    w.creatures.cmd_toxin[0] = 1.0;
    w
}

/// The clouds as they run in a tick: after the grid of the start of the tick.
fn drain(w: &mut World) {
    w.grid
        .rebuild(&w.creatures.slots, &w.creatures.x, &w.creatures.y);
    ability::clouds(w);
}

#[test]
fn a_cloud_drains_others_but_not_its_maker_and_the_energy_is_gone() {
    let mut w = cloud_world();
    let (e0, cost) = (w.creatures.energy[0], 2.0 * mouth(&w, 0));
    ability::step(&mut w);
    assert!((e0 - w.creatures.energy[0] - cost).abs() < 1e-5);
    assert_eq!(w.creatures.cd_toxin[0], 100);
    let cl = &w.clouds;
    assert_eq!(cl.slots.count(), 1);
    assert_eq!((cl.x[0], cl.y[0], cl.left[0]), (200.0, 200.0, 60));
    assert_eq!(cl.radius[0], 2.0 * w.creatures.length(0));
    assert!((cl.drain[0] - 0.3 * 0.5).abs() < 1e-6);
    assert_eq!(cl.maker[0], w.creatures.uid[0]);

    let before: Vec<f32> = w.creatures.energy[..3].to_vec();
    drain(&mut w);
    let after = &w.creatures.energy[..3];
    assert_eq!((after[0], after[2]), (before[0], before[2]));
    assert!((before[1] - after[1] - 0.15).abs() < 1e-5);
    let lost: f32 = before.iter().sum::<f32>() - after.iter().sum::<f32>();
    assert!((lost - 0.15).abs() < 1e-5);
    assert_eq!(w.clouds.left[0], 59);
    for _ in 0..59 {
        drain(&mut w);
    }
    assert_eq!(w.clouds.slots.count(), 0);
    let left = w.creatures.energy[1];
    drain(&mut w);
    assert_eq!(w.creatures.energy[1], left);
}

#[test]
fn a_cloud_that_drains_a_body_to_0_kills_it_with_cause_poisoned() {
    let mut w = cloud_world();
    ability::step(&mut w);
    let (maker, victim) = (w.creatures.uid[0], w.creatures.uid[1]);
    assert!(w.possess(victim));
    w.creatures.energy[1] = 0.1;
    drain(&mut w);
    assert!(!w.creatures.slots.is_alive(1));
    assert!(w.creatures.slots.is_alive(0) && w.creatures.slots.is_alive(2));
    assert_eq!((w.stats.poisoned, w.stats.deaths), (1, 1));
    assert_eq!(w.control.death_cause, CAUSE_POISONED);
    assert_eq!(w.control.killer, maker);
}

#[test]
fn a_full_cloud_pool_fires_nothing_and_charges_nothing() {
    let mut w = cloud_world();
    for _ in 0..MAX_CLOUDS {
        let k = w.clouds.slots.alloc().expect("room") as usize;
        w.clouds.left[k] = 1;
    }
    let e0 = w.creatures.energy[0];
    ability::step(&mut w);
    assert_eq!(w.creatures.energy[0], e0);
    assert_eq!(w.creatures.cd_toxin[0], 0);
    assert_eq!(w.clouds.slots.count(), MAX_CLOUDS);
}

#[test]
fn a_manual_player_fires_only_the_abilities_held() {
    let mut w = one(genome(0.5, 0.5), 0.0);
    dash_on(&mut w);
    toxin_on(&mut w);
    w.params.set(id::LUNGE_IMPULSE, 2.0);
    assert!(w.possess(w.creatures.uid[0]));
    w.input(true, 0.0, 0.0, false, ABILITY_DASH | ABILITY_TOXIN);
    control::apply(&mut w);
    let c = &w.creatures;
    assert_eq!(
        (c.cmd_dash[0], c.cmd_lunge[0], c.cmd_toxin[0]),
        (1.0, -1.0, 1.0)
    );
    ability::step(&mut w);
    let c = &w.creatures;
    assert_eq!((c.cd_dash[0], c.cd_lunge[0], c.cd_toxin[0]), (100, 0, 100));
    assert_eq!(c.lunge_left[0], 0);
    assert_eq!(w.clouds.slots.count(), 1);

    // Released, the commands are the brain's: control leaves them.
    w.input(false, 0.0, 0.0, false, 0);
    w.creatures.cmd_lunge[0] = 0.5;
    control::apply(&mut w);
    assert_eq!(w.creatures.cmd_lunge[0], 0.5);
    assert_eq!(w.creatures.cmd_dash[0], 1.0);
}

#[test]
fn a_world_with_clouds_in_flight_is_the_same_in_a_reload() {
    let mut w = World::new(3, 512.0, 512.0);
    for k in 0..12 {
        let (x, y) = (150.0 + 20.0 * (k % 4) as f32, 150.0 + 20.0 * (k / 4) as f32);
        w.spawn(genome(0.5, 0.5), at(x, y, k as f32)).expect("slot");
    }
    dash_on(&mut w);
    toxin_on(&mut w);
    w.params.set(id::LUNGE_IMPULSE, 2.0);
    w.params.set(id::LUNGE_COST, 0.5);
    w.params.set(id::ABILITY_COOLDOWN, 7.0);
    // Cheap enough that a body pays for all three from a half store.
    w.params.set(id::TOXIN_COST, 0.5);
    for s in 0..12 {
        let c = &mut w.creatures;
        (c.cmd_dash[s], c.cmd_lunge[s], c.cmd_toxin[s]) = (1.0, 1.0, 1.0);
    }
    w.run(5);
    assert!(w.clouds.slots.count() > 0);
    assert!((0..12).any(|s| w.creatures.lunge_left[s] > 0));
    let mut copy = World::load(&w.save()).expect("load");
    assert_eq!(copy.state_hash(), w.state_hash());
    w.run(40);
    copy.run(40);
    assert_eq!(copy.state_hash(), w.state_hash());
}
