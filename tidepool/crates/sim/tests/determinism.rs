use tidepool_sim::genome::Genome;
use tidepool_sim::params::id;
use tidepool_sim::world::{SpawnAt, World};

fn hash_after(seed: u32, ticks: u32) -> u32 {
    let mut w = World::new(seed, 1536.0, 1024.0);
    w.seed_founders(500, 0);
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
fn founders_stay_inside_the_world() {
    let mut w = World::new(3, 1536.0, 1024.0);
    w.seed_founders(500, 0);
    w.run(5000);
    for s in 0..w.creatures.slots.high_water() as usize {
        if w.creatures.slots.is_alive(s as u32) {
            assert!(w.creatures.x[s] >= 0.0 && w.creatures.x[s] <= 1536.0);
            assert!(w.creatures.y[s] >= 0.0 && w.creatures.y[s] <= 1024.0);
        }
    }
}

/// Two default bodies one unit apart, after one tick. The same seed gives both worlds the same
/// commands, so the push between the bodies is the only difference.
fn gap_after_one_tick(repel: f32) -> f32 {
    let mut w = World::new(1, 1536.0, 1024.0);
    w.params.set(id::REPEL, repel);
    for x in [500.0, 501.0] {
        let at = SpawnAt {
            x,
            y: 500.0,
            heading: 0.0,
            growth: 1.0,
            energy01: 1.0,
            parent: 0,
            generation: 0,
            mark: 0,
        };
        w.spawn(Genome::default(), at).expect("slot");
    }
    w.tick();
    let (dx, dy) = (
        w.creatures.x[1] - w.creatures.x[0],
        w.creatures.y[1] - w.creatures.y[0],
    );
    (dx * dx + dy * dy).sqrt()
}

#[test]
fn overlapping_creatures_are_pushed_apart_in_proportion_to_repel() {
    let (none, some, more) = (
        gap_after_one_tick(0.0),
        gap_after_one_tick(0.1),
        gap_after_one_tick(0.2),
    );
    assert!(none < 1.5, "gap with no push {none}");
    assert!(some > none + 0.5, "gap {some} against {none}");
    assert!(more > some + 0.5, "gap {more} against {some}");
}
