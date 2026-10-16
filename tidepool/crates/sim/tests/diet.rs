//! Rule D1 of the diet plan: the `diet` gene, the Filter factor `(1 - diet)^diet_k`, and the bite
//! factor `diet^diet_k`.

use tidepool_sim::genome::{BrainGenome, Genome, KIND_JAW};
use tidepool_sim::math::pow_quarters;
use tidepool_sim::params::{id, Params};
use tidepool_sim::rng::Rng;
use tidepool_sim::world::{SpawnAt, World};

/// One body or two, held still, with no upkeep and plants that do not change.
fn still_water() -> World {
    let mut w = World::new(1, 512.0, 512.0);
    for k in [
        id::BASAL,
        id::FIXED_UPKEEP,
        id::NEURON_UPKEEP,
        id::CONN_UPKEEP,
        id::MOVE_COST,
        id::REPEL,
        id::FLAG_FORCE,
        id::CILIA_FORCE,
        id::PLANT_GROWTH,
        id::PLANT_SEED_CHANCE,
        id::PLANT_DEATH_RESERVE,
        id::BITE_MASS_RATIO,
        id::SHELL_BLOCK,
        id::SPIKE_HURT,
    ] {
        w.params.set(k, 0.0);
    }
    w.params.set(id::LUNGE_BITE, 1.0);
    w
}

/// The reference founder at rest at the place, half full, with an empty brain. It never buds.
fn adult(w: &mut World, x: f32, diet: f32, jaw: bool) -> usize {
    let mut g = Genome::founder(&mut Rng::new(1), &w.params);
    (g.len, g.wid, g.diet) = (12.0, 0.5, diet);
    g.brain = BrainGenome::default();
    if jaw {
        g.set_size(KIND_JAW, 0.5);
    }
    let at = SpawnAt {
        x,
        y: 256.0,
        heading: 0.0,
        growth: 1.0,
        energy01: 0.5,
        parent: 0,
        generation: 0,
        mark: 0,
    };
    let slot = w.spawn(g, at).expect("slot") as usize;
    w.creatures.bud_cooldown[slot] = 1_000_000;
    slot
}

/// What a body of this diet takes from a plant it sits on in one tick. The plant holds more than
/// the body's Filter can take, so the Filter's rate decides the take.
fn filter_take(diet_k: f32, diet: f32) -> f32 {
    let mut w = still_water();
    w.params.set(id::DIET_K, diet_k);
    adult(&mut w, 200.0, diet, false);
    let s = w.plants.slots.alloc().expect("plant slot") as usize;
    (w.plants.x[s], w.plants.y[s]) = (200.0, 256.0);
    (w.plants.reserve[s], w.plants.cap[s]) = (40.0, 40.0);
    w.plants.dirty = true;
    w.tick();
    w.stats.eaten as f32
}

/// What a biter of this diet takes in one tick from a body 8 ahead of it. The prey holds more than
/// the bite, so the bite decides the take.
fn bite_take(diet_k: f32, diet: f32) -> f32 {
    let mut w = still_water();
    w.params.set(id::DIET_K, diet_k);
    adult(&mut w, 100.0, diet, true);
    adult(&mut w, 108.0, 0.0, false);
    w.tick();
    w.stats.flesh as f32
}

#[test]
fn with_diet_k_0_both_factors_are_1_at_every_diet() {
    let (filter, bite) = (filter_take(0.0, 0.0), bite_take(0.0, 1.0));
    assert!(filter > 0.0 && bite > 0.0);
    for diet in [0.0, 0.25, 0.5, 0.75, 1.0] {
        assert_eq!(filter_take(0.0, diet), filter, "diet {diet}");
        assert_eq!(bite_take(0.0, diet), bite, "diet {diet}");
    }
}

#[test]
fn a_diet_1_body_takes_nothing_from_a_plant_and_a_diet_0_body_bites_nothing() {
    assert!(filter_take(1.5, 0.0) > 0.0 && bite_take(1.5, 1.0) > 0.0);
    assert_eq!(filter_take(1.5, 1.0), 0.0);
    assert_eq!(bite_take(1.5, 0.0), 0.0);
}

#[test]
fn a_body_at_half_takes_half_to_the_diet_k_of_each_food() {
    let share = pow_quarters(0.5, 1.5);
    assert!((share - 0.353_553_4).abs() < 1e-6);
    assert_eq!(filter_take(1.5, 0.5), filter_take(1.5, 0.0) * share);
    assert_eq!(bite_take(1.5, 0.5), bite_take(1.5, 1.0) * share);
}

#[test]
fn founders_start_at_the_founder_diets() {
    let mut w = World::new(3, 1536.0, 1024.0);
    w.params.set(id::FOUNDER_JAW, 0.5);
    w.params.set(id::FOUNDER_DIET, 0.1);
    w.params.set(id::FOUNDER_HUNTER_DIET, 0.7);
    w.seed_founders(200, 0);
    let mut seen = [0; 2];
    for s in 0..w.creatures.slots.high_water() as usize {
        let hunter = w.genomes[s].size_of(KIND_JAW) > 0.0;
        let want = if hunter { 0.7 } else { 0.1 };
        assert_eq!(
            (w.genomes[s].diet, w.creatures.diet[s]),
            (want, want),
            "slot {s}"
        );
        seen[hunter as usize] += 1;
    }
    assert!(seen[0] > 0 && seen[1] > 0, "{seen:?}");
}

#[test]
fn a_mutation_keeps_the_diet_in_0_to_1_and_a_sigma_of_0_keeps_it() {
    let mut p = Params::new();
    p.set(id::DIET_SIGMA, 0.5);
    let mut rng = Rng::new(4);
    let mut next_history = 1000;
    for start in [0.0, 1.0] {
        let mut g = Genome {
            diet: start,
            ..Genome::default()
        };
        let mut moved = false;
        for _ in 0..200 {
            g = g.mutated(&mut rng, &p, &mut next_history);
            assert!((0.0..=1.0).contains(&g.diet), "{}", g.diet);
            moved |= g.diet != start;
        }
        assert!(moved);
    }
    p.set(id::DIET_SIGMA, 0.0);
    let g = Genome {
        diet: 0.3,
        ..Genome::default()
    };
    assert_eq!(g.mutated(&mut rng, &p, &mut next_history).diet, 0.3);
}
