use tidepool_sim::frame::{self, CREATURE_STRIDE, FLAG_BUDDED, HEADER_WORDS};
use tidepool_sim::genome::{
    Genome, KIND_CHEMO, KIND_CILIA, KIND_FILTER, KIND_FLAGELLUM, LEN_RANGE, SIZE_RANGE, WID_RANGE,
};
use tidepool_sim::params::{id, Params};
use tidepool_sim::rng::Rng;
use tidepool_sim::stats::{STAT_BIRTHS, STAT_MAX_GENERATION};
use tidepool_sim::world::{SpawnAt, World};

const GENE_RANGE: [(f32, f32); 6] = [
    LEN_RANGE,
    WID_RANGE,
    SIZE_RANGE[KIND_FLAGELLUM as usize],
    SIZE_RANGE[KIND_CILIA as usize],
    SIZE_RANGE[KIND_FILTER as usize],
    SIZE_RANGE[KIND_CHEMO as usize],
];

/// len, wid, and the sizes of the four parts that a founder has.
fn genes(g: &Genome) -> [f32; 6] {
    [
        g.len,
        g.wid,
        g.size_of(KIND_FLAGELLUM),
        g.size_of(KIND_CILIA),
        g.size_of(KIND_FILTER),
        g.size_of(KIND_CHEMO),
    ]
}

fn fed_adult(w: &mut World, mark: u8) -> usize {
    let egg = w.params.get(id::BIRTH_GROWTH);
    adult_with_egg(w, mark, egg)
}

/// A fed adult of capacity 72 with the given `egg` gene.
fn adult_with_egg(w: &mut World, mark: u8, egg: f32) -> usize {
    let mut g = Genome::founder(&mut Rng::new(1), &w.params);
    (g.len, g.wid, g.egg) = (12.0, 0.5, egg);
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
        id::NEURON_UPKEEP,
        id::CONN_UPKEEP,
        id::MOVE_COST,
        id::FLAG_FORCE,
        id::CILIA_FORCE,
    ] {
        w.params.set(k, 0.0);
    }
}

/// The live slots whose parent is the creature in slot `p`.
fn children(w: &World, p: usize) -> Vec<usize> {
    let c = &w.creatures;
    (0..c.slots.high_water() as usize)
        .filter(|&s| c.slots.is_alive(s as u32) && c.parent[s] == c.uid[p])
        .collect()
}

/// The flags of the creature in `slot`, from a frame of the whole world.
fn flags(w: &mut World, slot: usize) -> u32 {
    frame::write(w, 0.0, 0.0, 1536.0, 1024.0);
    let records = w.frame[HEADER_WORDS as usize..].chunks(CREATURE_STRIDE as usize);
    // Word 8 of a record is the slot and word 9 is the flags.
    let mut records = records.take(w.frame[1] as usize);
    records.find(|r| r[8] == slot as u32).expect("in the frame")[9]
}

#[test]
fn a_fed_adult_buds_a_child_that_carries_its_line() {
    let mut w = World::new(1, 1536.0, 1024.0);
    quiet(&mut w);
    w.params.set(id::BROOD_MAX, 1.0);
    // The egg of these tests: a newborn at 0.4 of its length.
    w.params.set(id::BIRTH_GROWTH, 0.4);
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
    // One child, and a mass that is the area: the cost below is for the area.
    w.params.set(id::BROOD_MAX, 1.0);
    w.params.set(id::PART_MASS, 0.0);
    let p = fed_adult(&mut w, 0);
    let before = w.creatures.energy[p];
    w.tick();
    let c = 1usize;
    let built = w.params.get(id::BUILD_COST) * w.creatures.area(c);
    assert!((before - w.creatures.energy[p] - w.creatures.energy[c] - built).abs() < 1e-3);
}

#[test]
fn cooldown_spaces_out_buds() {
    let mut w = World::new(1, 1536.0, 1024.0);
    quiet(&mut w);
    w.params.set(id::BROOD_MAX, 1.0);
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
fn brood_max_1_is_the_m1_bud() {
    let mut w = World::new(1, 1536.0, 1024.0);
    quiet(&mut w);
    w.params.set(id::BROOD_MAX, 1.0);
    // A mass that is the area: the cost below is for the area.
    w.params.set(id::PART_MASS, 0.0);
    // An egg this small costs 4.5, and the parent holds 50.4 above its reserve.
    let p = adult_with_egg(&mut w, 0, 0.25);
    let before = w.creatures.energy[p];
    w.tick();
    assert_eq!(children(&w, p), [1]);
    assert_eq!(w.stat(STAT_BIRTHS), 1.0);
    let c = &w.creatures;
    let cost = (w.params.get(id::BUILD_COST) + w.params.get(id::CHILD_ENERGY)) * c.area(1);
    assert!((before - c.energy[p] - cost).abs() < 1e-3);
}

#[test]
fn a_small_egg_gives_a_larger_brood_than_a_large_egg() {
    let mut w = World::new(1, 1536.0, 1024.0);
    quiet(&mut w);
    w.params.set(id::BROOD_MAX, 8.0);
    let small = adult_with_egg(&mut w, 0, 0.25);
    let large = adult_with_egg(&mut w, 0, 0.6);
    w.tick();
    let (small, large) = (children(&w, small).len(), children(&w, large).len());
    assert!(
        small > large,
        "{small} from the small egg, {large} from the large"
    );
    assert!(large >= 1);
}

#[test]
fn a_brood_conserves_energy() {
    let mut w = World::new(1, 1536.0, 1024.0);
    quiet(&mut w);
    w.params.set(id::BROOD_MAX, 8.0);
    // The parts of a child weigh something, so its mass is not its area.
    w.params.set(id::PART_MASS, 0.1);
    // The egg of these tests: a newborn at 0.4 of its length.
    w.params.set(id::BIRTH_GROWTH, 0.4);
    let p = fed_adult(&mut w, 0);
    let before = w.creatures.energy[p];
    w.tick();
    let brood = children(&w, p);
    assert!(brood.len() > 1, "a brood of {}", brood.len());
    let (c, build_cost) = (&w.creatures, w.params.get(id::BUILD_COST));
    let (part_mass, eye_cost) = (w.params.get(id::PART_MASS), w.params.get(id::EYE_COST));
    let paid: f32 = brood
        .iter()
        .map(|&s| build_cost * c.mass(s, part_mass, eye_cost) + c.energy[s])
        .sum();
    assert!(brood
        .iter()
        .any(|&s| c.mass(s, part_mass, eye_cost) != c.area(s)));
    assert!((before - c.energy[p] - paid).abs() < 1e-3);
}

#[test]
fn a_parent_keeps_its_reserve() {
    // A child costs 11.52 and the parent holds 68.4 of a capacity of 72.
    for (reserve, brood) in [(0.25, 4), (0.5, 2), (0.9, 0)] {
        let mut w = World::new(1, 1536.0, 1024.0);
        quiet(&mut w);
        w.params.set(id::BROOD_MAX, 8.0);
        w.params.set(id::PARENT_RESERVE, reserve);
        w.params.set(id::MUT_RATE, 0.0);
        // The cost of 11.52 is for an egg of 0.4 and for parts that weigh a tenth.
        w.params.set(id::BIRTH_GROWTH, 0.4);
        w.params.set(id::PART_MASS, 0.1);
        let p = fed_adult(&mut w, 0);
        w.tick();
        assert_eq!(children(&w, p).len(), brood, "reserve {reserve}");
        let left = w.creatures.energy[p];
        assert!(left >= reserve * 72.0, "reserve {reserve}: {left} left");
        // The brood stopped at the child that the parent could not pay for.
        assert!(
            left - 11.52 < reserve * 72.0,
            "reserve {reserve}: {left} left"
        );
    }
}

#[test]
fn a_child_is_born_at_its_parents_egg_size() {
    for egg in [0.25, 0.6] {
        let mut w = World::new(1, 1536.0, 1024.0);
        quiet(&mut w);
        w.params.set(id::BROOD_MAX, 2.0);
        let p = adult_with_egg(&mut w, 0, egg);
        w.tick();
        let brood = children(&w, p);
        assert!(!brood.is_empty(), "egg {egg}: no child");
        for s in brood {
            assert_eq!(w.creatures.growth[s], egg);
            assert_eq!(w.creatures.length(s), w.genomes[s].len * egg);
        }
    }
}

/// A snapshot can hold any gene. A child of negative growth or of negative length has a positive
/// area, so the sign of the area does not stop it.
#[test]
fn a_child_of_negative_growth_or_length_is_not_made() {
    for (egg, len) in [(-0.4, 12.0), (0.0, 12.0), (f32::NAN, 12.0), (0.4, -12.0)] {
        let mut w = World::new(1, 1536.0, 1024.0);
        quiet(&mut w);
        w.params.set(id::MUT_RATE, 0.0);
        let p = adult_with_egg(&mut w, 0, egg);
        // The body of the parent stays as it was expressed. Its children get this length.
        w.genomes[p].len = len;
        let before = w.creatures.energy[p];
        w.run(3);
        assert_eq!(w.stat(STAT_BIRTHS), 0.0, "egg {egg}, length {len}");
        assert_eq!(w.creatures.energy[p], before, "egg {egg}, length {len}");
    }
}

#[test]
fn the_children_of_a_brood_are_born_apart() {
    let mut w = World::new(1, 1536.0, 1024.0);
    quiet(&mut w);
    w.params.set(id::BROOD_MAX, 4.0);
    // The egg of these tests: a newborn at 0.4 of its length.
    w.params.set(id::BIRTH_GROWTH, 0.4);
    let p = fed_adult(&mut w, 0);
    w.tick();
    let (c, brood) = (&w.creatures, children(&w, p));
    assert!(brood.len() >= 3, "a brood of {}", brood.len());
    for (i, &a) in brood.iter().enumerate() {
        // The M1 distance: the two bodies just touch.
        let (dx, dy) = (c.x[a] - c.x[p], c.y[a] - c.y[p]);
        let far = (dx * dx + dy * dy).sqrt();
        assert!(
            (far - c.radius(p) - c.radius(a)).abs() < 1e-3,
            "child {i} at {far}"
        );
        for &b in &brood[..i] {
            assert_ne!(
                (c.x[a], c.y[a]),
                (c.x[b], c.y[b]),
                "two children on one point"
            );
        }
    }
    // The first child is where M1 put its one child, bit for bit.
    let behind = c.radius(p) + c.radius(brood[0]);
    let m1 = (c.x[p] - c.hc[p] * behind, c.y[p] - c.hs[p] * behind);
    assert_eq!((c.x[brood[0]], c.y[brood[0]]), m1);
}

#[test]
fn the_possessed_body_counts_its_buds() {
    let mut w = World::new(1, 1536.0, 1024.0);
    quiet(&mut w);
    w.params.set(id::BROOD_MAX, 2.0);
    // The egg of these tests: a newborn at 0.4 of its length.
    w.params.set(id::BIRTH_GROWTH, 0.4);
    let p = fed_adult(&mut w, 0);
    // A second parent, which nobody holds. Its buds do not count.
    let other = fed_adult(&mut w, 0);
    assert!(w.possess(w.creatures.uid[p]));
    w.tick();
    assert_eq!(w.control.buds, 2);
    for s in [p, other] {
        w.creatures.energy[s] = 0.95 * 72.0;
    }
    w.run(201);
    assert_eq!(w.stat(STAT_BIRTHS), 8.0);
    assert_eq!(w.control.buds, 4);
    assert!(w.possess(w.creatures.uid[other]));
    assert_eq!(w.control.buds, 0);
}

#[test]
fn a_body_that_just_budded_carries_the_flag() {
    let mut w = World::new(1, 1536.0, 1024.0);
    quiet(&mut w);
    w.params.set(id::BROOD_MAX, 1.0);
    let p = fed_adult(&mut w, 0);
    assert_eq!(flags(&mut w, p) & FLAG_BUDDED, 0);
    w.tick();
    assert_eq!(children(&w, p), [1]);
    assert_eq!(flags(&mut w, p) & FLAG_BUDDED, FLAG_BUDDED);
    assert_eq!(flags(&mut w, 1) & FLAG_BUDDED, 0, "the newborn did not bud");
    w.run(41);
    assert_eq!(flags(&mut w, p) & FLAG_BUDDED, 0);
}

#[test]
fn mutation_stays_in_range_and_rate_zero_copies() {
    // The M1 mutation alone: no part is lost, added, copied, or moved, and `egg` and `old` stay.
    let mut p = Params::new();
    for k in [
        id::MUT_SHAPE_RATE,
        id::MUT_LIFE_RATE,
        id::MUT_PART_ADD,
        id::MUT_PART_REMOVE,
        id::MUT_PART_DUP,
    ] {
        p.set(k, 0.0);
    }
    let mut rng = Rng::new(3);
    let mut next_history = 100;
    let mut g = Genome::founder(&mut rng, &p);
    for _ in 0..10_000 {
        g = g.mutated(&mut rng, &p, &mut next_history);
        for (v, (lo, hi)) in genes(&g).iter().zip(GENE_RANGE) {
            assert!(*v >= lo && *v <= hi);
        }
        assert!((0.0..1.0).contains(&g.hue));
        assert!(g.brain.conns.iter().all(|c| c.weight.abs() <= 8.0));
        assert!(g.brain.alpha.iter().all(|a| (0.05..=1.0).contains(a)));
    }
    let mut frozen = p.clone();
    for k in [id::MUT_RATE, id::MUT_WEIGHT_RATE, id::HUE_SIGMA] {
        frozen.set(k, 0.0);
    }
    let child = g.mutated(&mut rng, &frozen, &mut next_history);
    assert_eq!((child.len, child.wid, child.hue), (g.len, g.wid, g.hue));
    assert_eq!(child.parts, g.parts);
    assert_eq!((child.egg, child.old), (g.egg, g.old));
    assert_eq!(child.brain.conns.len(), g.brain.conns.len());
}

#[test]
fn mutation_changes_a_body_gene_the_hue_and_a_brain_weight() {
    let p = Params::new();
    let mut rng = Rng::new(3);
    let start = Genome::founder(&mut rng, &p);
    let mut g = start.clone();
    for _ in 0..100 {
        g = g.mutated(&mut rng, &p, &mut 100);
    }
    let weights = |g: &Genome| g.brain.conns.iter().map(|c| c.weight).collect::<Vec<_>>();
    assert_ne!(genes(&g), genes(&start), "no body gene changed");
    assert_ne!(g.hue, start.hue, "the hue did not change");
    assert_ne!(weights(&g), weights(&start), "no brain weight changed");
}

/// `load` does not check the floats of a genome. A parent buds from a genome with wild part genes,
/// wild life genes, and wild brain numbers, and does not bud from one with a wild size: a child of
/// negative mass would pay its parent. Neither panics, and the world with the wild children saves and loads.
#[test]
fn a_wild_genome_buds_or_does_not_without_panic() {
    let wilds = [f32::NAN, f32::INFINITY, f32::NEG_INFINITY, 1e30, -1e30];
    // With `part_mass` above 0 the parts of a child are in its price.
    for (wild, part_mass) in wilds.into_iter().flat_map(|v| [(v, 0.0), (v, 0.3)]) {
        for (rate, wild_size) in [(0.0, false), (1.0, false), (0.0, true), (1.0, true)] {
            let mut w = World::new(1, 1536.0, 1024.0);
            quiet(&mut w);
            w.params.set(id::PART_MASS, part_mass);
            w.params.set(id::MUT_RATE, rate);
            w.params.set(id::MUT_WEIGHT_RATE, rate);
            let p = fed_adult(&mut w, 0);
            let g = &mut w.genomes[p];
            for part in &mut g.parts {
                (part.anchor, part.size, part.extra) = (wild, wild, wild);
            }
            (g.egg, g.old, g.hue) = (wild, wild, wild);
            g.brain.bias.fill(wild);
            g.brain.alpha.fill(wild);
            if wild_size {
                (g.len, g.wid) = (wild, wild);
            }
            w.run(250);
            // Mutation clamps a size gene into its range, so only a wild size that did not mutate
            // is sure to stop the bud.
            let births = w.stat(STAT_BIRTHS);
            assert!(
                births > 0.0 || wild_size,
                "{wild} {rate} {part_mass}: no bud"
            );
            assert!(
                births == 0.0 || !wild_size || rate > 0.0,
                "{wild} {rate} {part_mass}: a child with a wild size"
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
