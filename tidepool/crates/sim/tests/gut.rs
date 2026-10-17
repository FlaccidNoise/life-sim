//! Rule G1 of the parts plan: two guts cost upkeep in the middle of the diet.

use tidepool_sim::genome::{BrainGenome, Genome};
use tidepool_sim::params::id;
use tidepool_sim::rng::Rng;
use tidepool_sim::world::{SpawnAt, World};

/// What a body of this diet pays in one tick with only the basal cost on. The old-age term is the
/// same for every diet, so it cancels in the ratios.
fn paid(gut_upkeep: f32, diet: f32) -> f32 {
    let mut w = World::new(1, 512.0, 512.0);
    for k in [
        id::FIXED_UPKEEP,
        id::NEURON_UPKEEP,
        id::CONN_UPKEEP,
        id::MOVE_COST,
        id::REPEL,
        id::PLANT_GROWTH,
        id::PLANT_SEED_CHANCE,
    ] {
        w.params.set(k, 0.0);
    }
    w.params.set(id::BASAL, 1.0);
    w.params.set(id::GUT_UPKEEP, gut_upkeep);
    w.params.set(id::GUT_BAND, 0.2);
    let mut g = Genome::founder(&mut Rng::new(1), &w.params);
    (g.len, g.wid, g.diet) = (12.0, 0.5, diet);
    g.brain = BrainGenome::default();
    let at = SpawnAt {
        x: 200.0,
        y: 256.0,
        heading: 0.0,
        growth: 1.0,
        energy01: 0.5,
        parent: 0,
        generation: 0,
        mark: 0,
    };
    let s = w.spawn(g, at).expect("slot") as usize;
    w.creatures.bud_cooldown[s] = 1_000_000;
    let before = w.creatures.energy[s];
    w.tick();
    assert!(w.creatures.slots.is_alive(s as u32));
    before - w.creatures.energy[s]
}

fn near(a: f32, b: f32) -> bool {
    (a - b).abs() <= 1e-4 * b
}

#[test]
fn with_gut_upkeep_0_every_diet_pays_the_basal() {
    let basal = paid(0.0, 0.0);
    assert!(basal > 0.0);
    for diet in [0.1, 0.35, 0.5, 0.65, 0.9, 1.0] {
        assert_eq!(paid(0.0, diet), basal, "diet {diet}");
    }
}

#[test]
fn the_middle_pays_by_the_bump_and_the_ends_pay_the_basal() {
    let basal = paid(0.5, 0.0);
    for diet in [0.1, 0.2, 0.8, 0.9, 1.0] {
        assert_eq!(paid(0.5, diet), basal, "diet {diet}");
    }
    assert!(near(paid(0.5, 0.5), 1.5 * basal));
    assert!(near(paid(0.5, 0.35), 1.25 * basal));
    assert!(near(paid(0.5, 0.65), 1.25 * basal));
}
