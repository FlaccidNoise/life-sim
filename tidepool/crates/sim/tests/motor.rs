use tidepool_sim::genome::{Genome, KIND_CILIA, KIND_FLAGELLUM};
use tidepool_sim::params::id;
use tidepool_sim::rng::Rng;
use tidepool_sim::world::{SpawnAt, World};

/// One default-bodied adult alone in open water, driven by fixed commands through possession.
fn solo(edit: impl FnOnce(&mut Genome)) -> (World, usize) {
    let mut w = World::new(1, 1536.0, 1024.0);
    let mut g = Genome::founder(&mut Rng::new(1), &w.params);
    (g.len, g.wid) = (12.0, 0.5);
    g.set_size(KIND_FLAGELLUM, 0.6);
    g.set_size(KIND_CILIA, 0.4);
    edit(&mut g);
    let at = SpawnAt {
        x: 768.0,
        y: 512.0,
        heading: 0.0,
        growth: 1.0,
        energy01: 1.0,
        parent: 0,
        generation: 0,
        mark: 0,
    };
    let slot = w.spawn(g, at).expect("slot") as usize;
    // Motion only: nothing starves and nothing buds, so these tests hold after tasks 13 and 14 land.
    for k in [
        id::BASAL,
        id::PART_UPKEEP,
        id::NEURON_UPKEEP,
        id::CONN_UPKEEP,
        id::MOVE_COST,
    ] {
        w.params.set(k, 0.0);
    }
    w.creatures.bud_cooldown[slot] = 1_000_000;
    let uid = w.creatures.uid[slot];
    assert!(w.possess(uid));
    (w, slot)
}

fn drive(w: &mut World, thrust: f32, turn: f32, ticks: u32) {
    w.input(true, thrust, turn);
    w.run(ticks);
}

fn speed(w: &World, s: usize) -> f32 {
    (w.creatures.vx[s] * w.creatures.vx[s] + w.creatures.vy[s] * w.creatures.vy[s]).sqrt()
}

#[test]
fn top_speed_is_in_band() {
    let (mut w, s) = solo(|_| {});
    drive(&mut w, 1.0, 0.0, 200);
    let v = speed(&w, s);
    assert!((1.1..=2.0).contains(&v), "speed {v}");
}

#[test]
fn a_body_with_cilia_turns_at_rest() {
    let (mut w, s) = solo(|_| {});
    drive(&mut w, 0.0, 1.0, 20);
    assert!(
        w.creatures.omega[s] > 0.03,
        "omega {}",
        w.creatures.omega[s]
    );
    assert!(speed(&w, s) < 0.05);
}

#[test]
fn a_body_without_cilia_cannot_turn_at_rest() {
    let (mut w, s) = solo(|g| g.set_size(KIND_CILIA, 0.0));
    drive(&mut w, 0.0, 1.0, 20);
    assert!(w.creatures.omega[s].abs() < 1e-6);
}

#[test]
fn turn_radius_grows_with_speed_and_exceeds_half_a_body_length() {
    let radius = |thrust: f32| {
        let (mut w, s) = solo(|_| {});
        drive(&mut w, thrust, 1.0, 300);
        speed(&w, s) / w.creatures.omega[s]
    };
    let (slow, fast) = (radius(0.2), radius(1.0));
    assert!(fast > slow * 1.5, "slow {slow} fast {fast}");
    assert!(fast > 6.0, "full-thrust radius {fast} is inside the body");
}

#[test]
fn a_slender_body_is_faster() {
    let top = |wid: f32| {
        let (mut w, s) = solo(|g| g.wid = wid);
        drive(&mut w, 1.0, 0.0, 200);
        speed(&w, s)
    };
    assert!(top(0.3) > top(0.8) * 1.5);
}

#[test]
fn a_long_body_turns_slower() {
    let rate = |len: f32| {
        let (mut w, s) = solo(|g| g.len = len);
        drive(&mut w, 1.0, 1.0, 200);
        w.creatures.omega[s]
    };
    assert!(rate(8.0) > rate(20.0) * 1.5);
}

#[test]
fn sideways_motion_dies_faster_than_forward_motion() {
    let coast = |vx: f32, vy: f32| {
        let (mut w, s) = solo(|_| {});
        w.creatures.vx[s] = vx;
        w.creatures.vy[s] = vy;
        drive(&mut w, 0.0, 0.0, 5);
        speed(&w, s)
    };
    assert!(coast(0.0, 2.0) < coast(2.0, 0.0) * 0.5);
}

#[test]
fn a_creature_stops_at_the_world_edge() {
    let (mut w, s) = solo(|_| {});
    drive(&mut w, 1.0, 0.0, 2000); // heading 0: swims toward x = 1536
    assert!(w.creatures.x[s] <= 1536.0 && w.creatures.x[s] > 1500.0);
}

#[test]
fn speed_never_passes_v_max() {
    let (mut w, s) = solo(|g| g.wid = 0.3);
    w.params.set(id::FLAG_FORCE, 5.0);
    w.params.set(id::DRAG_FWD, 0.01);
    drive(&mut w, 1.0, 0.0, 400);
    assert!(speed(&w, s) <= w.params.get(id::V_MAX) + 1e-4);
}
