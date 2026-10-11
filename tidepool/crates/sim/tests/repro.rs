use tidepool_sim::genome::{Genome, GENE_RANGE};
use tidepool_sim::params::{id, Params};
use tidepool_sim::rng::Rng;
use tidepool_sim::stats::{STAT_BIRTHS, STAT_MAX_GENERATION};
use tidepool_sim::world::{SpawnAt, World};

fn fed_adult(w: &mut World, mark: u8) -> usize {
    let mut g = Genome::founder(&mut Rng::new(1));
    (g.len, g.wid) = (12.0, 0.5);
    let at = SpawnAt {
        x: 700.0,
        y: 500.0,
        heading: 0.0,
        growth: 1.0,
        energy01: 0.95,
        parent: 0,
        generation: 3,
        mark,
    };
    w.spawn(g, at).expect("slot") as usize
}

fn quiet(w: &mut World) {
    for k in [
        id::BASAL,
        id::PART_UPKEEP,
        id::NEURON_UPKEEP,
        id::CONN_UPKEEP,
        id::MOVE_COST,
        id::FLAG_FORCE,
        id::CILIA_FORCE,
    ] {
        w.params.set(k, 0.0);
    }
}

#[test]
fn a_fed_adult_buds_a_child_that_carries_its_line() {
    let mut w = World::new(1, 1536.0, 1024.0);
    quiet(&mut w);
    let p = fed_adult(&mut w, 1);
    let puid = w.creatures.uid[p];
    w.tick();
    assert_eq!(w.creatures.slots.count(), 2);
    assert_eq!(w.stat(STAT_BIRTHS), 1.0);
    let c = 1usize; // the lowest free slot
    assert_eq!(w.creatures.parent[c], puid);
    assert_eq!(w.creatures.generation[c], 4);
    assert_eq!(w.creatures.mark[c] & 1, 1);
    assert_eq!(w.creatures.age[c], 0);
    assert!((w.creatures.growth[c] - 0.4).abs() < 1e-6);
    assert_eq!(w.stat(STAT_MAX_GENERATION), 4.0);
}

#[test]
fn budding_conserves_energy() {
    let mut w = World::new(1, 1536.0, 1024.0);
    quiet(&mut w);
    let p = fed_adult(&mut w, 0);
    let before = w.creatures.energy[p];
    w.tick();
    let c = 1usize;
    let built = w.params.get(id::BUILD_COST) * w.creatures.mass(c);
    assert!((before - w.creatures.energy[p] - w.creatures.energy[c] - built).abs() < 1e-3);
}

#[test]
fn cooldown_spaces_out_buds() {
    let mut w = World::new(1, 1536.0, 1024.0);
    quiet(&mut w);
    let p = fed_adult(&mut w, 0);
    w.tick();
    w.creatures.energy[p] = 0.95 * 72.0;
    w.run(199);
    assert_eq!(w.stat(STAT_BIRTHS), 1.0);
    w.creatures.energy[p] = 0.95 * 72.0;
    w.run(3);
    assert_eq!(w.stat(STAT_BIRTHS), 2.0);
}

#[test]
fn juveniles_and_the_hungry_do_not_bud() {
    let mut w = World::new(1, 1536.0, 1024.0);
    quiet(&mut w);
    let p = fed_adult(&mut w, 0);
    w.creatures.growth[p] = 0.9;
    w.params.set(id::GROW_RATE, 0.0);
    w.run(50);
    assert_eq!(w.stat(STAT_BIRTHS), 0.0);
    w.creatures.growth[p] = 1.0;
    w.creatures.energy[p] = 0.5 * 72.0;
    w.run(50);
    assert_eq!(w.stat(STAT_BIRTHS), 0.0);
}

#[test]
fn a_full_pool_stops_budding_without_losing_energy() {
    let mut w = World::new(1, 1536.0, 1024.0);
    quiet(&mut w);
    w.params.set(id::REPEL, 0.0);
    for _ in 0..4096 {
        fed_adult(&mut w, 0);
    }
    let before: f32 = w.creatures.energy.iter().sum();
    w.tick();
    assert_eq!(w.creatures.slots.count(), 4096);
    assert_eq!(w.stat(STAT_BIRTHS), 0.0);
    assert!((w.creatures.energy.iter().sum::<f32>() - before).abs() < 1.0);
}

#[test]
fn mutation_stays_in_range_and_rate_zero_copies() {
    let p = Params::new();
    let mut rng = Rng::new(3);
    let mut g = Genome::founder(&mut rng);
    for _ in 0..10_000 {
        g = g.mutated(&mut rng, &p);
        let genes = [g.len, g.wid, g.flagellum, g.cilia, g.filter, g.chemo];
        for (v, (lo, hi)) in genes.iter().zip(GENE_RANGE) {
            assert!(*v >= lo && *v <= hi);
        }
        assert!((0.0..1.0).contains(&g.hue));
        assert!(g.brain.conns.iter().all(|c| c.weight.abs() <= 8.0));
        assert!(g.brain.alpha.iter().all(|a| (0.05..=1.0).contains(a)));
    }
    let mut frozen = Params::new();
    for k in [id::MUT_RATE, id::MUT_WEIGHT_RATE, id::HUE_SIGMA] {
        frozen.set(k, 0.0);
    }
    let child = g.mutated(&mut rng, &frozen);
    assert_eq!((child.len, child.wid, child.hue), (g.len, g.wid, g.hue));
    assert_eq!(child.brain.conns.len(), g.brain.conns.len());
}

#[test]
fn mutation_changes_a_body_gene_the_hue_and_a_brain_weight() {
    let p = Params::new();
    let mut rng = Rng::new(3);
    let start = Genome::founder(&mut rng);
    let mut g = start.clone();
    for _ in 0..100 {
        g = g.mutated(&mut rng, &p);
    }
    let genes = |g: &Genome| [g.len, g.wid, g.flagellum, g.cilia, g.filter, g.chemo];
    let weights = |g: &Genome| g.brain.conns.iter().map(|c| c.weight).collect::<Vec<_>>();
    assert_ne!(genes(&g), genes(&start), "no body gene changed");
    assert_ne!(g.hue, start.hue, "the hue did not change");
    assert_ne!(weights(&g), weights(&start), "no brain weight changed");
}

/// `load` does not check the floats of a genome. A parent buds from a genome with wild part genes
/// and wild brain numbers, and does not bud from one with a wild size: a child of negative mass
/// would pay its parent. Neither panics, and the world with the wild children saves and loads.
#[test]
fn a_wild_genome_buds_or_does_not_without_panic() {
    for wild in [f32::NAN, f32::INFINITY, f32::NEG_INFINITY, 1e30, -1e30] {
        for (rate, wild_size) in [(0.0, false), (1.0, false), (0.0, true), (1.0, true)] {
            let mut w = World::new(1, 1536.0, 1024.0);
            quiet(&mut w);
            w.params.set(id::MUT_RATE, rate);
            w.params.set(id::MUT_WEIGHT_RATE, rate);
            let p = fed_adult(&mut w, 0);
            let g = &mut w.genomes[p];
            (g.flagellum, g.cilia, g.filter, g.chemo, g.hue) = (wild, wild, wild, wild, wild);
            g.brain.bias.fill(wild);
            g.brain.alpha.fill(wild);
            if wild_size {
                (g.len, g.wid) = (wild, wild);
            }
            w.run(250);
            // Mutation clamps a size gene into its range, so only a wild size that did not mutate
            // is sure to stop the bud.
            let births = w.stat(STAT_BIRTHS);
            assert!(births > 0.0 || wild_size, "{wild} {rate}: no bud");
            assert!(
                births == 0.0 || !wild_size || rate > 0.0,
                "{wild} {rate}: a child with a wild size"
            );
            World::load(&w.save()).expect("the world still loads");
        }
    }
}

#[test]
fn a_seeded_world_turns_over_generations_deterministically() {
    let run = || {
        let mut w = World::new(5, 1536.0, 1024.0);
        w.seed_founders(400, 1200);
        w.run(3000);
        (w.state_hash(), w.stat(STAT_BIRTHS))
    };
    let (a, b) = (run(), run());
    assert_eq!(a, b);
    assert!(a.1 > 0.0, "no births in 3,000 ticks");
}
