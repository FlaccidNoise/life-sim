use tidepool_sim::control::{CAUSE_OLD_AGE, CAUSE_STARVED};
use tidepool_sim::genome::Genome;
use tidepool_sim::params::id;
use tidepool_sim::rng::Rng;
use tidepool_sim::world::{SpawnAt, World};

fn empty() -> World {
    World::new(1, 1536.0, 1024.0)
}

fn add(w: &mut World, x: f32, growth: f32, energy01: f32, edit: impl FnOnce(&mut Genome)) -> usize {
    let mut g = Genome::founder(&mut Rng::new(1));
    (g.len, g.wid, g.flagellum, g.cilia, g.filter, g.chemo) = (12.0, 0.5, 0.6, 0.4, 0.6, 0.5);
    edit(&mut g);
    let at = SpawnAt {
        x,
        y: 512.0,
        heading: 0.0,
        growth,
        energy01,
        parent: 0,
        generation: 0,
        mark: 0,
    };
    let slot = w.spawn(g, at).expect("slot") as usize;
    w.creatures.bud_cooldown[slot] = 1_000_000; // these tests hold after Task 14 adds budding
    slot
}

/// A plant with the given reserve under the point. Returns its slot.
fn plant_at(w: &mut World, x: f32, reserve: f32) -> usize {
    let s = w.plants.slots.alloc().expect("plant slot") as usize;
    (
        w.plants.x[s],
        w.plants.y[s],
        w.plants.reserve[s],
        w.plants.cap[s],
    ) = (x, 512.0, reserve, 20.0);
    w.plants.dirty = true;
    s
}

fn still(w: &mut World) {
    // hold every creature in place and stop plants changing, so one rule is tested at a time
    for k in [
        id::PLANT_GROWTH,
        id::PLANT_SEED_CHANCE,
        id::PLANT_DEATH_RESERVE,
    ] {
        w.params.set(k, 0.0);
    }
    w.params.set(id::FLAG_FORCE, 0.0);
    w.params.set(id::CILIA_FORCE, 0.0);
}

fn no_upkeep(w: &mut World) {
    for k in [
        id::BASAL,
        id::PART_UPKEEP,
        id::NEURON_UPKEEP,
        id::CONN_UPKEEP,
        id::MOVE_COST,
    ] {
        w.params.set(k, 0.0);
    }
}

#[test]
fn eating_moves_energy_from_plant_to_creature_and_loses_none() {
    let mut w = empty();
    still(&mut w);
    no_upkeep(&mut w);
    let c = add(&mut w, 500.0, 1.0, 0.3, |_| {});
    let p = plant_at(&mut w, 500.0, 20.0);
    let before = w.creatures.energy[c] + w.plants.reserve[p];
    w.run(50);
    assert!(w.creatures.energy[c] > 0.3 * 72.0 + 1.0);
    assert!((w.creatures.energy[c] + w.plants.reserve[p] - before).abs() < 1e-2);
}

#[test]
fn a_full_creature_eats_nothing() {
    let mut w = empty();
    still(&mut w);
    no_upkeep(&mut w);
    add(&mut w, 500.0, 1.0, 1.0, |_| {});
    let p = plant_at(&mut w, 500.0, 20.0);
    w.run(50);
    assert_eq!(w.plants.reserve[p], 20.0);
}

#[test]
fn one_tick_takes_at_most_the_bite_fraction() {
    let mut w = empty();
    still(&mut w);
    no_upkeep(&mut w);
    w.params.set(id::INTAKE_RATE, 1.0);
    add(&mut w, 500.0, 1.0, 0.1, |_| {});
    let p = plant_at(&mut w, 500.0, 20.0);
    w.tick();
    assert!((w.plants.reserve[p] - 19.0).abs() < 1e-4); // 5% of 20
}

#[test]
fn a_creature_out_of_reach_eats_nothing() {
    let mut w = empty();
    still(&mut w);
    no_upkeep(&mut w);
    add(&mut w, 500.0, 1.0, 0.3, |_| {});
    let p = plant_at(&mut w, 540.0, 20.0);
    w.run(50);
    assert_eq!(w.plants.reserve[p], 20.0);
}

#[test]
fn an_unfed_creature_starves_and_the_cause_is_recorded() {
    let mut w = empty();
    still(&mut w);
    let c = add(&mut w, 500.0, 1.0, 0.2, |_| {});
    let uid = w.creatures.uid[c];
    assert!(w.possess(uid));
    w.run(1500);
    assert_eq!(w.creatures.slots.count(), 0);
    assert_eq!(w.control.death_cause, CAUSE_STARVED);
    assert_eq!(w.stat(tidepool_sim::stats::STAT_DEATHS), 1.0);
}

#[test]
fn old_age_kills_at_lifespan() {
    let mut w = empty();
    still(&mut w);
    no_upkeep(&mut w);
    w.params.set(id::LIFESPAN, 600.0);
    let c = add(&mut w, 500.0, 1.0, 1.0, |_| {});
    assert!(w.possess(w.creatures.uid[c]));
    w.run(599);
    assert_eq!(w.creatures.slots.count(), 1);
    w.run(1);
    assert_eq!(w.creatures.slots.count(), 0);
    assert_eq!(w.control.death_cause, CAUSE_OLD_AGE);
}

#[test]
fn a_fed_juvenile_grows_to_adult_and_growth_costs_energy() {
    let mut w = empty();
    still(&mut w);
    let c = add(&mut w, 500.0, 0.4, 0.9, |_| {});
    for dx in [-4.0, 0.0, 4.0] {
        plant_at(&mut w, 500.0 + dx, 20.0);
    }
    w.params.set(id::PLANT_GROWTH, 0.05); // the plants refill
    let eaten_before = w.stats.eaten;
    w.run(1500);
    assert!(
        (w.creatures.growth[c] - 1.0).abs() < 1e-6,
        "growth {}",
        w.creatures.growth[c]
    );
    assert!(w.stats.eaten - eaten_before > 0.5 * (72.0 - 72.0 * 0.16)); // at least the build cost
}

#[test]
fn a_starving_juvenile_does_not_grow() {
    let mut w = empty();
    still(&mut w);
    let c = add(&mut w, 500.0, 0.4, 0.2, |_| {});
    w.run(100);
    assert_eq!(w.creatures.growth[c], 0.4);
}

#[test]
fn parts_cost_upkeep() {
    let ticks_alive = |chemo: f32| {
        let mut w = empty();
        still(&mut w);
        add(&mut w, 500.0, 1.0, 0.5, |g| g.chemo = chemo);
        let mut t = 0;
        while w.creatures.slots.count() == 1 && t < 5000 {
            w.tick();
            t += 1;
        }
        t
    };
    assert!(ticks_alive(0.0) > ticks_alive(1.0) + 20);
}

#[test]
fn energy_never_passes_capacity() {
    let mut w = World::new(2, 1536.0, 1024.0);
    w.seed_founders(400, 1200);
    w.run(1500);
    for s in 0..w.creatures.slots.high_water() as usize {
        if w.creatures.slots.is_alive(s as u32) {
            let cap = w.params.get(id::ENERGY_PER_MASS) * w.creatures.mass(s);
            assert!(w.creatures.energy[s] <= cap + 1e-3 && w.creatures.energy[s] > 0.0);
        }
    }
}
