// `powf` is what `pow075` is checked against. This file runs native only.
#![allow(clippy::disallowed_methods)]

use tidepool_sim::control::{CAUSE_OLD_AGE, CAUSE_STARVED};
use tidepool_sim::genome::{
    Genome, KIND_CHEMO, KIND_CILIA, KIND_EYE, KIND_FILTER, KIND_FIN, KIND_FLAGELLUM,
};
use tidepool_sim::math::pow075;
use tidepool_sim::params::id;
use tidepool_sim::rng::Rng;
use tidepool_sim::world::{SpawnAt, World};

fn empty() -> World {
    World::new(1, 1536.0, 1024.0)
}

fn add(w: &mut World, x: f32, growth: f32, energy01: f32, edit: impl FnOnce(&mut Genome)) -> usize {
    let mut g = Genome::founder(&mut Rng::new(1), &w.params);
    (g.len, g.wid) = (12.0, 0.5);
    let sizes = [
        (KIND_FLAGELLUM, 0.6),
        (KIND_CILIA, 0.4),
        (KIND_FILTER, 0.6),
        (KIND_CHEMO, 0.5),
    ];
    for (kind, size) in sizes {
        g.set_size(kind, size);
    }
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
    for k in [id::BASAL, id::NEURON_UPKEEP, id::CONN_UPKEEP, id::MOVE_COST] {
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
    w.params.set(id::LIFESPAN, 1200.0);
    let c = add(&mut w, 500.0, 1.0, 1.0, |_| {});
    assert!(w.possess(w.creatures.uid[c]));
    w.run(1199);
    assert_eq!(w.creatures.slots.count(), 1);
    w.run(1);
    assert_eq!(w.creatures.slots.count(), 0);
    assert_eq!(w.control.death_cause, CAUSE_OLD_AGE);
}

/// The `lifespan` parameter is 4800. Each body dies on the tick of its own gene.
#[test]
fn a_creature_dies_at_its_own_old_gene() {
    let mut w = empty();
    still(&mut w);
    no_upkeep(&mut w);
    let short = add(&mut w, 500.0, 1.0, 1.0, |g| g.old = 1300.0);
    add(&mut w, 600.0, 1.0, 1.0, |g| g.old = 2000.0);
    assert!(w.possess(w.creatures.uid[short]));
    w.run(1299);
    assert_eq!(w.creatures.slots.count(), 2);
    w.run(1);
    assert_eq!(w.creatures.slots.count(), 1);
    assert_eq!(w.control.death_cause, CAUSE_OLD_AGE);
    w.run(699);
    assert_eq!(w.creatures.slots.count(), 1);
    w.run(1);
    assert_eq!(w.creatures.slots.count(), 0);
}

#[test]
fn a_juvenile_that_starves_is_counted() {
    let mut w = empty();
    still(&mut w);
    add(&mut w, 500.0, 1.0, 0.01, |_| {});
    w.run(50);
    assert_eq!((w.creatures.slots.count(), w.stats.starved_juv), (0, 0));
    add(&mut w, 500.0, 0.4, 0.01, |_| {});
    w.run(50);
    assert_eq!((w.creatures.slots.count(), w.stats.starved_juv), (0, 1));
    assert_eq!(w.stat(tidepool_sim::stats::STAT_STARVED_JUV), 1.0);
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
        add(&mut w, 500.0, 1.0, 0.5, |g| g.set_size(KIND_CHEMO, chemo));
        let mut t = 0;
        while w.creatures.slots.count() == 1 && t < 5000 {
            w.tick();
            t += 1;
        }
        t
    };
    assert!(ticks_alive(0.0) > ticks_alive(1.0) + 20);
}

/// Two worlds with the same lone adult and no plants. The player holds full thrust in one and no
/// thrust in the other, so the two bodies differ only in what the thrust costs.
#[test]
fn thrust_costs_energy() {
    const TICKS: u32 = 100;
    let energy_after = |thrust: f32| {
        let mut w = empty();
        let c = add(&mut w, 500.0, 1.0, 0.9, |_| {});
        assert!(w.possess(w.creatures.uid[c]));
        w.input(true, thrust, 0.0);
        w.run(TICKS);
        (w.creatures.energy[c], w.creatures.x[c])
    };
    let ((coasting, stayed), (thrusting, swam)) = (energy_after(0.0), energy_after(1.0));
    assert!(swam > stayed + 50.0, "full thrust did not move the body");

    let w = empty();
    let p = &w.params;
    // The body of `add`: flagellum 0.6, cilia 0.4, and an adult length of 12.
    let drive = p.get(id::FLAG_FORCE) * 0.6 + p.get(id::CILIA_FORCE) * 0.4;
    let cost = p.get(id::MOVE_COST) * drive * 12.0 * TICKS as f32;
    assert!(cost > 1.0, "the expected cost {cost} is too small to test");
    assert!(
        (coasting - thrusting - cost).abs() < 1e-2,
        "thrust cost {}, expected {cost}",
        coasting - thrusting
    );
}

#[test]
fn energy_never_passes_capacity() {
    let mut w = World::new(2, 1536.0, 1024.0);
    w.seed_founders(400, 1200);
    w.run(1500);
    for s in 0..w.creatures.slots.high_water() as usize {
        if w.creatures.slots.is_alive(s as u32) {
            let cap = w.params.get(id::ENERGY_PER_MASS) * w.creatures.area(s);
            assert!(w.creatures.energy[s] <= cap + 1e-3 && w.creatures.energy[s] > 0.0);
        }
    }
}

#[test]
fn pow075_is_within_1e_4_of_powf() {
    for x in [0.5f32, 1.0, 11.5, 72.0, 500.0] {
        assert!((pow075(x) - x.powf(0.75)).abs() / x.powf(0.75) < 1e-4);
    }
    assert_eq!((pow075(0.0), pow075(-4.0)), (0.0, 0.0));
}

/// What one resting adult loses in 100 ticks with no brain upkeep. `still` stops every force, so
/// the body pays no move cost. `setup` sets the parameters under test and `edit` the body.
fn resting_loss(setup: impl FnOnce(&mut World), edit: impl FnOnce(&mut Genome)) -> f32 {
    let mut w = empty();
    still(&mut w);
    w.params.set(id::NEURON_UPKEEP, 0.0);
    w.params.set(id::CONN_UPKEEP, 0.0);
    setup(&mut w);
    let c = add(&mut w, 500.0, 1.0, 0.9, edit);
    let before = w.creatures.energy[c];
    w.run(100);
    before - w.creatures.energy[c]
}

/// With no eye the parts are the reference parts, so the mass is the area at any `part_mass`.
fn eyeless_loss(len: f32) -> f32 {
    resting_loss(|w| w.params.set(id::FOUNDER_EYE, 0.0), |g| g.len = len)
}

/// The founder with no eye is the reference body, with an area of 72.
#[test]
fn the_reference_body_pays_basal_for_each_unit_of_its_mass() {
    let want = 100.0 * empty().params.get(id::BASAL) * 72.0;
    let loss = eyeless_loss(12.0);
    assert!(want > 1.0, "the loss {want} is too small to test");
    assert!((loss / want - 1.0).abs() < 1e-3, "{loss} against {want}");
}

/// A length of 6 gives an area of 18, a quarter of the founder's 72.
#[test]
fn a_small_body_pays_more_per_unit_of_mass() {
    let ratio = (eyeless_loss(6.0) / 18.0) / (eyeless_loss(12.0) / 72.0);
    let expected = (72.0f32 / 18.0).powf(0.25);
    assert!((ratio / expected - 1.0).abs() < 0.01, "ratio {ratio}");
}

/// Rule P1. The founder with an eye of size 1 has a part sum of `2.1 + eye_cost`. A part costs
/// through its mass alone: `part_mass` makes that body heavier than the founder by
/// `(1 + part_mass * 3.1) / (1 + part_mass * 2.1)`, and upkeep is for the mass to the power 3/4.
#[test]
fn a_part_costs_upkeep_through_its_mass_alone() {
    let loss = |eye_cost: f32, part_mass: f32| {
        resting_loss(
            |w| {
                w.params.set(id::EYE_COST, eye_cost);
                w.params.set(id::PART_MASS, part_mass);
            },
            |g| g.set_size(KIND_EYE, 1.0),
        )
    };
    let (blind, eyed, heavy) = (loss(0.0, 0.0), loss(1.0, 0.0), loss(1.0, 0.1));
    assert!(blind > 1.0, "the loss {blind} is too small to test");
    assert!((eyed / blind - 1.0).abs() < 1e-4, "eye {eyed} {blind}");
    let for_mass = (1.31f32 / 1.21).powf(0.75);
    assert!((heavy / eyed / for_mass - 1.0).abs() < 0.01, "mass {heavy}");
}

/// Two fed juveniles with the same length and width genes at the same growth, with no upkeep. One
/// has the reference parts and one has a fin of 1 as well. Each takes one step of growth and pays
/// `build_cost` for the mass that the step adds, parts and all.
#[test]
fn growth_pays_for_the_mass_of_the_parts() {
    let mut w = empty();
    still(&mut w);
    no_upkeep(&mut w);
    w.params.set(id::PART_MASS, 0.3);
    let (part_mass, eye_cost) = (w.params.get(id::PART_MASS), w.params.get(id::EYE_COST));
    let bodies = [
        add(&mut w, 400.0, 0.4, 0.9, |_| {}),
        add(&mut w, 800.0, 0.4, 0.9, |g| g.set_size(KIND_FIN, 1.0)),
    ];
    let c = &w.creatures;
    let before = bodies.map(|s| (c.energy[s], c.mass(s, part_mass, eye_cost)));
    w.tick();
    let c = &w.creatures;
    let [plain, finned] = [0, 1].map(|i| {
        let (s, (energy, mass)) = (bodies[i], before[i]);
        assert!(c.growth[s] > 0.4, "body {i} did not grow");
        let paid = energy - c.energy[s];
        let cost = w.params.get(id::BUILD_COST) * (c.mass(s, part_mass, eye_cost) - mass);
        assert!(cost > 0.01, "the cost {cost} is too small to test");
        assert!(
            (paid - cost).abs() < 1e-4,
            "body {i} paid {paid} for {cost}"
        );
        paid
    });
    assert!(finned > plain, "{finned} against {plain}");
}

/// At a `grow_rate` of 0.1 one step of growth costs more than the growth reserve holds above its
/// floor. Two juveniles have the reserve to try the step. One would be left a little under
/// `grow_floor` of the reserve, so it does not grow and pays nothing. The other is left a little
/// over it.
#[test]
fn a_step_of_growth_leaves_grow_floor_of_the_reserve() {
    let mut w = empty();
    still(&mut w);
    no_upkeep(&mut w);
    w.params.set(id::GROW_RATE, 0.1);
    let (short, enough) = (
        add(&mut w, 400.0, 0.4, 0.9, |_| {}),
        add(&mut w, 800.0, 0.4, 0.9, |_| {}),
    );
    let p = &w.params;
    let (part_mass, eye_cost) = (p.get(id::PART_MASS), p.get(id::EYE_COST));
    let (build_cost, grow_floor) = (p.get(id::BUILD_COST), p.get(id::GROW_FLOOR));
    let reserve = p.get(id::GROW_RESERVE) * p.get(id::ENERGY_PER_MASS) * w.creatures.area(short);
    let c = &mut w.creatures;
    let mass = c.mass(short, part_mass, eye_cost);
    c.growth[short] = 0.5;
    let cost = build_cost * (c.mass(short, part_mass, eye_cost) - mass);
    c.growth[short] = 0.4;
    // The least that a body must hold to take the step.
    let least = reserve * grow_floor + cost;
    assert!(
        grow_floor > 0.0 && least - 0.01 > reserve,
        "{least} {reserve}"
    );
    (c.energy[short], c.energy[enough]) = (least - 0.01, least + 0.01);
    w.tick();
    let c = &w.creatures;
    assert_eq!((c.growth[short], c.energy[short]), (0.4, least - 0.01));
    assert!(
        (c.growth[enough] - 0.5).abs() < 1e-6,
        "{}",
        c.growth[enough]
    );
    assert!((c.energy[enough] - (least + 0.01 - cost)).abs() < 1e-4);
}

/// A resting adult with every other upkeep at 0. The brain of the body of `add` has 17 neurons and
/// 57 connections, and each of the two rates is paid for its own count.
#[test]
fn a_brain_costs_upkeep_for_each_neuron_and_each_connection() {
    const TICKS: f32 = 100.0;
    // What the body lost at these two rates, then its counts of neurons and of connections.
    let loss = |neuron_upkeep: f32, conn_upkeep: f32| {
        let mut w = empty();
        still(&mut w);
        no_upkeep(&mut w);
        w.params.set(id::NEURON_UPKEEP, neuron_upkeep);
        w.params.set(id::CONN_UPKEEP, conn_upkeep);
        let c = add(&mut w, 500.0, 1.0, 0.9, |_| {});
        let before = w.creatures.energy[c];
        w.run(TICKS as u32);
        let (neurons, conns) = (w.brains.n_neur[c] as f32, w.brains.n_conn[c] as f32);
        (before - w.creatures.energy[c], neurons, conns)
    };
    let (free, neurons, conns) = loss(0.0, 0.0);
    assert_eq!((free, neurons, conns), (0.0, 17.0, 57.0));
    let near = |got: f32, want: f32| (got / want - 1.0).abs() < 1e-3;
    let (for_neurons, ..) = loss(0.002, 0.0);
    assert!(
        near(for_neurons, TICKS * 0.002 * neurons),
        "lost {for_neurons} for {neurons} neurons"
    );
    let (for_conns, ..) = loss(0.0, 0.002);
    assert!(
        near(for_conns, TICKS * 0.002 * conns),
        "lost {for_conns} for {conns} connections"
    );
    // At the defaults the brain of a founder is not free.
    let p = empty().params;
    let (neuron_upkeep, conn_upkeep) = (p.get(id::NEURON_UPKEEP), p.get(id::CONN_UPKEEP));
    let (at_defaults, ..) = loss(neuron_upkeep, conn_upkeep);
    let want = TICKS * (neuron_upkeep * neurons + conn_upkeep * conns);
    assert!(
        want > 1.0 && near(at_defaults, want),
        "{at_defaults} {want}"
    );
}

/// What one hungry adult of the given length takes in one tick from a plant of the given reserve
/// under it.
fn one_tick_of_intake(len: f32, reserve: f32, setup: impl FnOnce(&mut World)) -> f64 {
    let mut w = empty();
    still(&mut w);
    no_upkeep(&mut w);
    setup(&mut w);
    add(&mut w, 500.0, 1.0, 0.1, |g| g.len = len);
    plant_at(&mut w, 500.0, reserve);
    w.tick();
    w.stats.eaten
}

/// The plant gives all it holds, so the mouth is the limit.
#[test]
fn the_mouth_follows_area() {
    let intake = |len: f32| one_tick_of_intake(len, 20.0, |w| w.params.set(id::BITE_FRACTION, 1.0));
    let share = intake(6.0) / intake(12.0);
    assert!((share - 0.25).abs() < 1e-4, "share {share}");
}

/// The largest body has a mouth of 2.3 a tick. The bite is still 5% of 4.
#[test]
fn a_plant_still_limits_a_large_mouth() {
    let taken = one_tick_of_intake(24.0, 4.0, |w| w.params.set(id::BITE_FRACTION, 0.05));
    assert!((taken - 0.2).abs() < 1e-5, "took {taken}");
}

/// A mouth that could take the whole plant takes only what stands above the death reserve. The
/// plant is then at the reserve, not under it, and the next plant update leaves it alive.
#[test]
fn a_bite_stops_at_the_death_reserve() {
    let mut w = empty();
    still(&mut w);
    no_upkeep(&mut w);
    w.params.set(id::PLANT_DEATH_RESERVE, 0.2);
    w.params.set(id::BITE_FRACTION, 1.0);
    w.params.set(id::INTAKE_RATE, 1.0);
    let c = add(&mut w, 500.0, 1.0, 0.1, |g| g.len = 24.0);
    let p = plant_at(&mut w, 500.0, 0.5);
    let before = w.creatures.energy[c];
    w.tick();
    assert!((w.stats.eaten - 0.3).abs() < 1e-5, "took {}", w.stats.eaten);
    assert!((w.plants.reserve[p] - 0.2).abs() < 1e-5);
    // What the plant lost is what the body gained.
    assert!((w.creatures.energy[c] - before - 0.3).abs() < 1e-5);
    // Every plant has had its update after 8 ticks.
    w.run(8);
    assert!(w.plants.slots.is_alive(p as u32));
    assert_eq!(w.stats.plant_deaths, 0);
    assert!((w.stats.eaten - 0.3).abs() < 1e-5, "took {}", w.stats.eaten);
}

/// A plant at the reserve gives nothing. A plant under it gives nothing either, and the plant
/// update still removes it: that plant got there by another way than a bite.
#[test]
fn a_plant_at_its_death_reserve_feeds_nobody() {
    let mut w = empty();
    still(&mut w);
    no_upkeep(&mut w);
    w.params.set(id::PLANT_DEATH_RESERVE, 0.2);
    w.params.set(id::INTAKE_RATE, 1.0);
    for x in [500.0, 900.0] {
        add(&mut w, x, 1.0, 0.1, |_| {});
    }
    let (at, under) = (plant_at(&mut w, 500.0, 0.2), plant_at(&mut w, 900.0, 0.1));
    w.tick();
    assert_eq!(w.stats.eaten, 0.0);
    assert_eq!((w.plants.reserve[at], w.plants.reserve[under]), (0.2, 0.1));
    w.run(8);
    assert_eq!(w.stats.eaten, 0.0);
    assert!(w.plants.slots.is_alive(at as u32));
    assert!(!w.plants.slots.is_alive(under as u32));
    assert_eq!(w.stats.plant_deaths, 1);
}

/// Eight hungry bodies sit on one plant that grows at the default rate. They eat it down to the
/// death reserve and it lives.
#[test]
fn grazing_never_removes_a_plant() {
    let mut w = empty();
    no_upkeep(&mut w);
    // The bodies stay where they are put, and on top of each other.
    for k in [id::FLAG_FORCE, id::CILIA_FORCE, id::REPEL] {
        w.params.set(k, 0.0);
    }
    w.params.set(id::PLANT_SEED_CHANCE, 0.0);
    let bodies: Vec<usize> = (0..8)
        .map(|_| add(&mut w, 500.0, 1.0, 0.1, |_| {}))
        .collect();
    let p = plant_at(&mut w, 500.0, 20.0);
    w.run(400);
    let death_reserve = w.params.get(id::PLANT_DEATH_RESERVE);
    assert!(w.plants.slots.is_alive(p as u32));
    assert_eq!(w.stats.plant_deaths, 0);
    assert!(w.plants.reserve[p] >= death_reserve);
    // The plant was eaten down to near the reserve.
    assert!(
        w.plants.reserve[p] < 2.0 * death_reserve,
        "{}",
        w.plants.reserve[p]
    );
    // The bodies are still hungry, so it was the rule that stopped them.
    let c = &w.creatures;
    assert!(bodies.iter().all(|&s| c.energy[s] < 0.5 * c.area(s)));
}

/// The `lifespan` parameter is 4800. Upkeep is times `1 + old_cost * (old / lifespan - 1)`.
#[test]
fn a_long_life_costs_more_per_tick() {
    let mut w = empty();
    still(&mut w);
    w.params.set(id::OLD_COST, 0.5);
    let bodies = [(300.0, 2400.0), (600.0, 4800.0), (900.0, 9600.0)]
        .map(|(x, old)| add(&mut w, x, 1.0, 0.9, |g| g.old = old));
    let before = bodies.map(|c| w.creatures.energy[c]);
    w.run(100);
    let [short, middle, long] = [0, 1, 2].map(|i| before[i] - w.creatures.energy[bodies[i]]);
    assert!(middle > 1.0, "the loss {middle} is too small to test");
    assert!((short / middle - 0.75).abs() < 0.0075, "short {short}");
    assert!((long / middle - 1.5).abs() < 0.015, "long {long}");
}

/// Two worlds with one lone adult in each. The player holds full thrust, and thrust is the only
/// cost.
#[test]
fn thrust_costs_the_same_per_unit_of_mass() {
    let loss_per_area = |len: f32| {
        let mut w = empty();
        for k in [id::BASAL, id::NEURON_UPKEEP, id::CONN_UPKEEP] {
            w.params.set(k, 0.0);
        }
        let c = add(&mut w, 500.0, 1.0, 0.9, |g| g.len = len);
        assert!(w.possess(w.creatures.uid[c]));
        w.input(true, 1.0, 0.0);
        let before = w.creatures.energy[c];
        w.run(50);
        (before - w.creatures.energy[c]) / w.creatures.area(c)
    };
    let (small, large) = (loss_per_area(8.0), loss_per_area(20.0));
    assert!(small > 0.01, "the loss {small} is too small to test");
    assert!(
        (small / large - 1.0).abs() < 0.02,
        "{small} against {large}"
    );
}
