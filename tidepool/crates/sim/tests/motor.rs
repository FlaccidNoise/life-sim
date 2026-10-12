// Tests run native only, so a banned float method is safe here.
#![allow(clippy::disallowed_methods)]

use tidepool_sim::creature::heft;
use tidepool_sim::genome::{BrainGenome, Genome, KIND_CHEMO, KIND_CILIA, KIND_FIN, KIND_FLAGELLUM};
use tidepool_sim::params::id;
use tidepool_sim::rng::Rng;
use tidepool_sim::world::{SpawnAt, World};

/// Open water where motion is the only rule: nothing starves, so these tests hold after tasks 13
/// and 14 land.
fn still_water() -> World {
    let mut w = World::new(1, 1536.0, 1024.0);
    for k in [id::BASAL, id::NEURON_UPKEEP, id::CONN_UPKEEP, id::MOVE_COST] {
        w.params.set(k, 0.0);
    }
    w
}

/// One default-bodied adult at rest at the place, heading along x. It never buds.
fn adult(w: &mut World, x: f32, y: f32, edit: impl FnOnce(&mut Genome)) -> usize {
    let mut g = Genome::founder(&mut Rng::new(1), &w.params);
    (g.len, g.wid) = (12.0, 0.5);
    g.set_size(KIND_FLAGELLUM, 0.6);
    g.set_size(KIND_CILIA, 0.4);
    edit(&mut g);
    let at = SpawnAt {
        x,
        y,
        heading: 0.0,
        growth: 1.0,
        energy01: 1.0,
        parent: 0,
        generation: 0,
        mark: 0,
    };
    let slot = w.spawn(g, at).expect("slot") as usize;
    w.creatures.bud_cooldown[slot] = 1_000_000;
    slot
}

/// One adult alone in open water, driven by fixed commands through possession.
fn solo(edit: impl FnOnce(&mut Genome)) -> (World, usize) {
    let mut w = still_water();
    let slot = adult(&mut w, 768.0, 512.0, edit);
    let uid = w.creatures.uid[slot];
    assert!(w.possess(uid));
    (w, slot)
}

/// Two adults at rest, 8 apart, each changed by its edit. Their brains command nothing. One tick.
/// The mass of each and the velocity that the push gave it.
fn bump_of(edits: [&dyn Fn(&mut Genome); 2]) -> [(f32, f32, f32); 2] {
    let mut w = still_water();
    let slots = [(edits[0], 0.0, 0.0), (edits[1], 4.8, 6.4)].map(|(edit, dx, dy)| {
        adult(&mut w, 768.0 + dx, 512.0 + dy, |g| {
            edit(g);
            g.brain = BrainGenome::default();
        })
    });
    w.run(1);
    let (part_mass, eye_cost) = (w.params.get(id::PART_MASS), w.params.get(id::EYE_COST));
    let c = &w.creatures;
    slots.map(|s| (c.mass(s, part_mass, eye_cost), c.vx[s], c.vy[s]))
}

/// `bump_of` for two adults of these lengths. Their radii add up to 9, so they overlap by 1.
fn bump(lens: [f32; 2]) -> [(f32, f32, f32); 2] {
    bump_of([&|g| g.len = lens[0], &|g| g.len = lens[1]])
}

fn drive(w: &mut World, thrust: f32, turn: f32, ticks: u32) {
    w.input(true, thrust, turn);
    w.run(ticks);
}

fn speed(w: &World, s: usize) -> f32 {
    (w.creatures.vx[s] * w.creatures.vx[s] + w.creatures.vy[s] * w.creatures.vy[s]).sqrt()
}

/// The angle between the velocity and the heading, in radians.
fn slip(w: &World, s: usize) -> f32 {
    let c = &w.creatures;
    let (fwd, side) = (
        c.vx[s] * c.hc[s] + c.vy[s] * c.hs[s],
        -c.vx[s] * c.hs[s] + c.vy[s] * c.hc[s],
    );
    side.atan2(fwd).abs()
}

/// The top speed on a straight run, then the turn rate at full thrust and full turn.
fn cruise(w: &mut World, s: usize) -> (f32, f32) {
    drive(w, 1.0, 0.0, 200);
    let top = speed(w, s);
    drive(w, 1.0, 1.0, 100);
    (top, w.creatures.omega[s])
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

#[test]
fn the_push_is_split_by_mass() {
    let len = |(_, vx, vy): (f32, f32, f32)| (vx * vx + vy * vy).sqrt();
    let [small, big] = bump([6.0, 18.0]);
    assert!(len(small) > 0.01, "no push: {small:?}");
    let (got, want) = (len(small) / len(big), big.0 / small.0);
    assert!((got / want - 1.0).abs() < 0.01, "got {got} want {want}");
    assert!((small.0 * small.1 + big.0 * big.1).abs() < 1e-4);
    assert!((small.0 * small.2 + big.0 * big.2).abs() < 1e-4);
}

/// Two bodies of one length and one width, so of one area. One has no chemoreceptor and one has a
/// chemoreceptor of size 1. The weight of that part is the only difference between them.
#[test]
fn the_push_counts_the_mass_of_the_parts() {
    let len = |(_, vx, vy): (f32, f32, f32)| (vx * vx + vy * vy).sqrt();
    let [light, heavy] = bump_of([&|g| g.set_size(KIND_CHEMO, 0.0), &|g| {
        g.set_size(KIND_CHEMO, 1.0)
    }]);
    assert!(heavy.0 > light.0 * 1.2, "mass {} {}", light.0, heavy.0);
    let (got, want) = (len(light) / len(heavy), heavy.0 / light.0);
    assert!((got / want - 1.0).abs() < 0.01, "got {got} want {want}");
    assert!((light.0 * light.1 + heavy.0 * heavy.1).abs() < 1e-4);
    assert!((light.0 * light.2 + heavy.0 * heavy.2).abs() < 1e-4);
}

#[test]
fn two_equal_bodies_get_the_same_push() {
    let [a, b] = bump([12.0, 12.0]);
    // The push is `(9 - 8) / 8 * repel` times the offset. Then one tick of drag.
    assert!((b.1 - 0.025 * 4.8 * 0.92).abs() < 1e-5, "vx {}", b.1);
    assert!((b.2 - 0.025 * 6.4 * 0.70).abs() < 1e-5, "vy {}", b.2);
    assert_eq!((a.1, a.2), (-b.1, -b.2));
}

#[test]
fn top_speed_is_free_of_size_and_turning_is_not() {
    let body = |len: f32, wid: f32| {
        let (mut w, s) = solo(|g| (g.len, g.wid) = (len, wid));
        w.params.set(id::PART_MASS, 0.0);
        (w, s)
    };
    let top = |len: f32, wid: f32| {
        let (mut w, s) = body(len, wid);
        drive(&mut w, 1.0, 0.0, 200);
        speed(&w, s)
    };
    let spin = |len: f32| {
        let (mut w, s) = body(len, 0.5);
        drive(&mut w, 0.0, 1.0, 40);
        w.creatures.omega[s]
    };
    let (small, big) = (top(8.0, 0.3), top(20.0, 0.8));
    assert!((small / big - 1.0).abs() < 0.02, "top {small} {big}");
    let ratio = spin(8.0) / spin(20.0);
    assert!((ratio / (20.0 / 8.0) - 1.0).abs() < 0.05, "ratio {ratio}");
}

#[test]
fn the_founder_moves_the_same_at_any_part_mass() {
    let moves = |part_mass: f32| {
        // The four founder parts at their default sizes: a part sum of `REF_PARTS`.
        let (mut w, s) = solo(|g| g.parts = Genome::default().parts);
        w.params.set(id::PART_MASS, part_mass);
        cruise(&mut w, s)
    };
    let ((top_0, turn_0), (top_1, turn_1)) = (moves(0.0), moves(0.3));
    assert!(top_0 > 1.0 && turn_0 > 0.01, "top {top_0} turn {turn_0}");
    assert!((top_0 - top_1).abs() < 1e-4, "top {top_0} {top_1}");
    assert!((turn_0 - turn_1).abs() < 1e-4, "turn {turn_0} {turn_1}");
}

#[test]
fn a_heavier_load_of_parts_is_slower() {
    let top = |edit: fn(&mut Genome)| {
        let (mut w, s) = solo(edit);
        w.params.set(id::PART_MASS, 0.3);
        drive(&mut w, 1.0, 0.0, 200);
        speed(&w, s)
    };
    let (bare, loaded) = (top(|_| {}), top(|g| g.set_size(KIND_FIN, 1.0)));
    assert!(loaded < bare, "bare {bare} loaded {loaded}");
}

/// Rule S3 for the turn. Two bodies that differ only in a chemoreceptor, which steers nothing.
/// The turn of a body is over the heft of its parts.
#[test]
fn a_heavier_load_of_parts_turns_slower() {
    let spin = |chemo: f32| {
        let (mut w, s) = solo(|g| g.set_size(KIND_CHEMO, chemo));
        drive(&mut w, 0.0, 1.0, 40);
        let (part_mass, eye_cost) = (w.params.get(id::PART_MASS), w.params.get(id::EYE_COST));
        let parts = w.creatures.part_sum(s, eye_cost);
        (w.creatures.omega[s], heft(parts, part_mass))
    };
    let ((bare, light), (loaded, heavy)) = (spin(0.0), spin(1.0));
    assert!(bare > 0.01 && heavy > light * 1.2, "{bare} {light} {heavy}");
    let (got, want) = (bare / loaded, heavy / light);
    assert!((got / want - 1.0).abs() < 0.01, "got {got} want {want}");
}

/// `SIDE_DRAG_MAX` is 0.95. This body's side drag and the grip of its fin add up to 1.5, so a tick
/// keeps a twentieth of the velocity across the heading. Without the limit the tick would turn
/// that velocity around.
#[test]
fn side_drag_stops_at_its_limit() {
    let (mut w, s) = solo(|g| g.set_size(KIND_FIN, 1.0));
    w.params.set(id::DRAG_SIDE, 0.9);
    w.params.set(id::FIN_GRIP, 0.6);
    w.creatures.vy[s] = 2.0;
    drive(&mut w, 0.0, 0.0, 1);
    let (vx, vy) = (w.creatures.vx[s], w.creatures.vy[s]);
    assert!(
        vx.abs() < 1e-3 && (vy - 0.1).abs() < 1e-3,
        "vx {vx} vy {vy}"
    );
}

#[test]
fn a_side_flagellum_turns_at_rest_and_does_not_push() {
    let body = || {
        solo(|g| {
            g.set_size(KIND_CILIA, 0.0);
            let flagella = g.parts.iter_mut().filter(|p| p.kind == KIND_FLAGELLUM);
            flagella.for_each(|p| p.anchor = 0.5);
        })
    };
    let (mut w, s) = body();
    drive(&mut w, 1.0, 0.0, 50);
    assert!(speed(&w, s) < 0.05, "speed {}", speed(&w, s));
    let (mut w, s) = body();
    drive(&mut w, 0.0, 1.0, 20);
    assert!(
        w.creatures.omega[s] > 0.01,
        "omega {}",
        w.creatures.omega[s]
    );
}

#[test]
fn a_fin_turns_only_at_speed_and_cuts_the_slip() {
    let body = |fin: bool| {
        solo(|g| {
            g.set_size(KIND_CILIA, 0.0);
            if fin {
                g.set_size(KIND_FIN, 0.5);
            }
        })
    };
    let at_rest = |fin: bool| {
        let (mut w, s) = body(fin);
        drive(&mut w, 0.0, 1.0, 20);
        w.creatures.omega[s]
    };
    assert_eq!(at_rest(true), at_rest(false));

    // With the default `fin_grip` of 0.3 the turn that this fin adds outruns its grip: the slip
    // rises from 0.176 to 0.215. At 0.6 the grip wins.
    let at_speed = |fin: bool| {
        let (mut w, s) = body(fin);
        w.params.set(id::FIN_GRIP, 0.6);
        let (_, omega) = cruise(&mut w, s);
        (omega, slip(&w, s))
    };
    let ((omega_fin, slip_fin), (omega_bare, slip_bare)) = (at_speed(true), at_speed(false));
    assert!(omega_fin > omega_bare, "omega {omega_fin} {omega_bare}");
    assert!(slip_fin < slip_bare, "slip {slip_fin} {slip_bare}");
}
