use tidepool_sim::field::{Field, SCENT_CELL};
use tidepool_sim::params::id;
use tidepool_sim::plant;
use tidepool_sim::world::World;

fn garden(seed: u32) -> World {
    let mut w = World::new(seed, 1536.0, 1024.0);
    w.seed_founders(0, 1200);
    w
}

fn live_plants(w: &World) -> Vec<usize> {
    (0..w.plants.slots.high_water() as usize)
        .filter(|&s| w.plants.slots.is_alive(s as u32))
        .collect()
}

#[test]
fn fertility_is_patchy() {
    let w = garden(1);
    let min = w.params.get(id::PLANT_GERM_MIN);
    let bare =
        w.fertility.v.iter().filter(|&&f| f < min).count() as f32 / w.fertility.v.len() as f32;
    assert!((0.2..=0.8).contains(&bare), "bare fraction {bare}");
}

#[test]
fn founders_are_placed_on_fertile_ground() {
    let w = garden(1);
    assert!(w.plants.slots.count() >= 1000);
    for s in live_plants(&w) {
        assert!(w.fertility.at(w.plants.x[s], w.plants.y[s]) >= w.params.get(id::PLANT_GERM_MIN));
    }
}

#[test]
fn an_ungrazed_garden_fills_and_stays_bounded_on_three_seeds() {
    for seed in 1..=3 {
        let mut w = garden(seed);
        w.run(6000);
        let n = w.plants.slots.count();
        assert!((1000..8192).contains(&n), "seed {seed}: {n} plants");
        let cap = w.params.get(id::PLANT_CELL_CAP) as u32;
        let mut per_cell = vec![0u32; w.fertility.v.len()];
        for s in live_plants(&w) {
            let c =
                (w.plants.y[s] / 32.0) as usize * w.fertility.gw + (w.plants.x[s] / 32.0) as usize;
            per_cell[c] += 1;
            assert!(w.plants.reserve[s] > 0.0 && w.plants.reserve[s] <= w.plants.cap[s] + 1e-4);
        }
        assert!(per_cell.iter().all(|&k| k <= cap));
    }
}

#[test]
fn with_no_growth_nothing_spreads() {
    let mut w = garden(1);
    let before = w.plants.slots.count();
    w.params.set(id::PLANT_GROWTH, 0.0);
    w.params.set(id::PLANT_SEED_CHANCE, 0.0);
    w.run(2000);
    assert_eq!(w.plants.slots.count(), before);
}

#[test]
fn a_plant_removed_for_a_low_reserve_is_counted() {
    let mut w = garden(1);
    w.params.set(id::PLANT_GROWTH, 0.0);
    w.params.set(id::PLANT_SEED_CHANCE, 0.0);
    let before = w.plants.slots.count();
    let floor = w.params.get(id::PLANT_DEATH_RESERVE);
    for &s in &live_plants(&w)[..3] {
        w.plants.reserve[s] = floor / 2.0;
    }
    w.run(50);
    assert_eq!(w.plants.slots.count(), before - 3);
    assert_eq!(w.stats.plant_deaths, 3);
    assert_eq!(w.stat(tidepool_sim::stats::STAT_PLANT_DEATHS), 3.0);
}

#[test]
fn diffusion_spreads_decays_and_keeps_mass_when_decay_is_one() {
    let mut f = Field::new(1536.0, 1024.0);
    f.deposit(768.0, 512.0, 100.0);
    for _ in 0..200 {
        f.diffuse(0.2, 1.0);
    }
    let total: f32 = f.a.iter().sum();
    assert!((total - 100.0).abs() < 0.5, "mass {total}");
    assert!(f.sample(768.0, 512.0) > f.sample(768.0 + 10.0 * SCENT_CELL, 512.0));
    assert!(f.sample(768.0 + 10.0 * SCENT_CELL, 512.0) > 0.0);
    f.diffuse(0.2, 0.5);
    assert!((f.a.iter().sum::<f32>() - 50.0).abs() < 0.5);
}

/// A snapshot can hold a world of 1 by 1, which has a field of one cell.
#[test]
fn a_field_too_narrow_for_the_stencil_keeps_its_mass() {
    for (w, h) in [(1.0, 1.0), (8.0, 64.0), (64.0, 8.0), (16.0, 16.0)] {
        let mut f = Field::new(w, h);
        f.deposit(0.0, 0.0, 1.0);
        for _ in 0..50 {
            f.diffuse(0.2, 1.0);
        }
        assert!((f.a.iter().sum::<f32>() - 1.0).abs() < 1e-4, "{w} by {h}");
        assert!(f.gradient(w, h).0.is_finite());
    }
}

#[test]
fn the_gradient_points_at_the_source() {
    let mut f = Field::new(1536.0, 1024.0);
    for _ in 0..300 {
        f.deposit(768.0, 512.0, 1.0);
        f.diffuse(0.2, 0.995);
    }
    let (gx, gy) = f.gradient(700.0, 512.0); // source is toward +x
    assert!(gx > 0.0 && gx.abs() > gy.abs() * 5.0);
    let (gx, gy) = f.gradient(768.0, 600.0); // source is toward -y
    assert!(gy < 0.0 && gy.abs() > gx.abs() * 5.0);
}

#[test]
fn plants_lay_down_scent_that_is_strongest_in_the_patches() {
    let mut w = garden(2);
    w.run(600);
    let s = live_plants(&w)[0];
    let here = w.scent.sample(w.plants.x[s], w.plants.y[s]);
    assert!(here > 0.0);
    // the least fertile cell in the world smells weaker than a plant's own cell
    let (mut worst, mut at) = (f32::MAX, 0usize);
    for (c, &f) in w.fertility.v.iter().enumerate() {
        if f < worst {
            (worst, at) = (f, c);
        }
    }
    let (bx, by) = (
        (at % w.fertility.gw) as f32 * 32.0 + 16.0,
        (at / w.fertility.gw) as f32 * 32.0 + 16.0,
    );
    assert!(w.scent.sample(bx, by) < here);
}

#[test]
fn radius_grows_with_reserve() {
    assert!(plant::radius(20.0, 20.0) > plant::radius(2.0, 20.0));
    assert!((plant::radius(20.0, 20.0) - 8.0).abs() < 1e-5);
}
