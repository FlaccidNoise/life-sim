// Tests run native only, so a banned float method is safe here.
#![allow(clippy::disallowed_methods)]

use tidepool_sim::world::World;

fn hash_after(seed: u32, ticks: u32) -> u32 {
    let mut w = World::new(seed, 1536.0, 1024.0);
    w.spawn_drifters(500);
    w.run(ticks);
    w.state_hash()
}

#[test]
fn same_seed_same_hash() {
    assert_eq!(hash_after(1, 1000), hash_after(1, 1000));
}

#[test]
fn different_seed_different_hash() {
    assert_ne!(hash_after(1, 1000), hash_after(2, 1000));
}

#[test]
fn hash_changes_every_tick() {
    assert_ne!(hash_after(1, 1000), hash_after(1, 1001));
}

#[test]
fn drifters_stay_inside_the_world() {
    let mut w = World::new(3, 1536.0, 1024.0);
    w.spawn_drifters(500);
    w.run(5000);
    for s in 0..w.creatures.slots.high_water() as usize {
        if w.creatures.slots.is_alive(s as u32) {
            assert!(w.creatures.x[s] >= 0.0 && w.creatures.x[s] <= 1536.0);
            assert!(w.creatures.y[s] >= 0.0 && w.creatures.y[s] <= 1024.0);
        }
    }
}

#[test]
fn overlapping_drifters_separate() {
    let mut w = World::new(1, 1536.0, 1024.0);
    w.spawn_drifters(2);
    for s in 0..2 {
        w.creatures.x[s] = 500.0 + s as f32;
        w.creatures.y[s] = 500.0;
        w.creatures.vx[s] = 0.0;
        w.creatures.vy[s] = 0.0;
        w.creatures.radius[s] = 6.0;
    }
    w.run(200);
    let d = (w.creatures.x[0] - w.creatures.x[1]).hypot(w.creatures.y[0] - w.creatures.y[1]);
    assert!(d >= 11.0, "distance {d}");
}
