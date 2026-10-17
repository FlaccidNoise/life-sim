// Tests run native only, so a banned float method is safe here.
#![allow(clippy::disallowed_methods)]

use std::f32::consts::PI;
use tidepool_sim::brain::{READOUT_HEADER_WORDS, READOUT_MAX_WORDS};
use tidepool_sim::control::{CAUSE_EATEN, CAUSE_SPIKED};
use tidepool_sim::creature::{MAX_GUARDS, MAX_JAWS};
use tidepool_sim::genome::{
    Genome, PartGene, ADDABLE_KINDS, KINDS, KIND_JAW, KIND_SHELL, KIND_SPIKE, KIND_TOXIN,
};
use tidepool_sim::params::{id, Params};
use tidepool_sim::rng::Rng;
use tidepool_sim::snapshot::LoadError;
use tidepool_sim::world::{SpawnAt, World};

fn part(kind: u8, anchor: f32, size: f32, history: u32) -> PartGene {
    PartGene {
        kind,
        anchor,
        size,
        extra: 0.0,
        history,
    }
}

fn at(x: f32) -> SpawnAt {
    SpawnAt {
        x,
        y: 100.0,
        heading: 0.0,
        growth: 1.0,
        energy01: 0.5,
        parent: 0,
        generation: 0,
        mark: 0,
    }
}

/// The reference body with the parts added, in a world of its own. Its slot is 0.
fn body(parts: &[PartGene]) -> World {
    let mut w = World::new(1, 256.0, 256.0);
    let mut g = Genome::default();
    g.parts.extend_from_slice(parts);
    w.spawn(g, at(100.0)).expect("slot");
    w
}

#[test]
fn a_jaw_at_the_nose_makes_one_cone_and_a_side_jaw_makes_two() {
    let w = body(&[part(KIND_JAW, 0.0, 0.5, 900)]);
    let c = &w.creatures;
    assert_eq!((c.n_jaws[0], c.jaw_sum[0]), (1, 0.5));
    assert!((c.jaw_ax[0] - 1.0).abs() < 1e-5 && c.jaw_ay[0].abs() < 1e-5);
    assert_eq!(c.jaw_size[0], 0.5);

    let w = body(&[part(KIND_JAW, 0.25, 0.4, 900)]);
    let c = &w.creatures;
    // A pair: the size counts once in the sum, and each cone has it.
    assert_eq!((c.n_jaws[0], c.jaw_sum[0]), (2, 0.4));
    for (k, dir) in [0.25 * PI, -0.25 * PI].into_iter().enumerate() {
        assert!((c.jaw_ax[k] - dir.cos()).abs() < 1e-5, "cone {k}");
        assert!((c.jaw_ay[k] - dir.sin()).abs() < 1e-5, "cone {k}");
        assert_eq!(c.jaw_size[k], 0.4);
    }

    // Three side jaws make six cones. The cap is `MAX_JAWS`, and every gene still counts.
    let side: Vec<PartGene> = (0..3).map(|k| part(KIND_JAW, 0.5, 0.2, 900 + k)).collect();
    let w = body(&side);
    let c = &w.creatures;
    assert_eq!(c.n_jaws[0] as usize, MAX_JAWS);
    assert!((c.jaw_sum[0] - 0.6).abs() < 1e-6);
}

#[test]
fn a_shell_and_a_spike_make_guards_and_count_their_mass() {
    let guarded = [
        part(KIND_SHELL, 0.5, 0.3, 900),
        part(KIND_SPIKE, 1.0, 0.2, 901),
        part(KIND_TOXIN, 0.6, 0.25, 902),
    ];
    let (bare, w) = (body(&[]), body(&guarded));
    let c = &w.creatures;
    // The shell is a pair at plus and minus half a turn, the spike one guard at the tail.
    assert_eq!(c.n_guards[0], 3);
    assert_eq!(c.guard_kind[..3], [KIND_SHELL, KIND_SHELL, KIND_SPIKE]);
    assert_eq!(c.guard_size[..3], [0.3, 0.3, 0.2]);
    assert!((c.guard_ay[0] - 1.0).abs() < 1e-5 && (c.guard_ay[1] + 1.0).abs() < 1e-5);
    assert!((c.guard_ax[2] + 1.0).abs() < 1e-5 && c.guard_ay[2].abs() < 1e-5);
    assert_eq!(
        (c.shell_sum[0], c.gland_sum[0], c.jaw_sum[0]),
        (0.3, 0.25, 0.0)
    );
    // Each part costs its size in the mass, as any part does.
    let (p, eye_cost) = (&w.params, w.params.get(id::EYE_COST));
    let sum = |w: &World| w.creatures.part_sum(0, eye_cost);
    assert!((sum(&w) - sum(&bare) - 0.75).abs() < 1e-6);
    let part_mass = p.get(id::PART_MASS);
    assert!(w.creatures.mass(0, part_mass, eye_cost) > bare.creatures.mass(0, part_mass, eye_cost));

    // Nine side shells make eighteen guards. The cap is `MAX_GUARDS`, and every gene still counts.
    let shells: Vec<PartGene> = (0..9)
        .map(|k| part(KIND_SHELL, 0.4, 0.1, 900 + k))
        .collect();
    let mut g = Genome::default();
    g.parts.truncate(3);
    g.parts.extend(shells);
    let mut w = World::new(1, 256.0, 256.0);
    w.spawn(g, at(100.0)).expect("slot");
    assert_eq!(w.creatures.n_guards[0] as usize, MAX_GUARDS);
    assert!((w.creatures.shell_sum[0] - 0.9).abs() < 1e-5);
}

#[test]
fn a_genome_with_kind_11_does_not_load_and_kind_10_does() {
    assert_eq!((KIND_TOXIN, KINDS), (10, 10));
    let world_with = |kind: u8| {
        let mut g = Genome::default();
        g.parts.push(part(kind, 0.3, 0.5, 900));
        let mut w = World::new(1, 256.0, 256.0);
        w.spawn(g, at(100.0)).expect("slot");
        w
    };
    let w = world_with(KIND_TOXIN);
    let loaded = World::load(&w.save()).expect("kind 10 loads");
    assert_eq!(loaded.genomes[0].parts[4].kind, KIND_TOXIN);
    assert_eq!(loaded.state_hash(), w.state_hash());
    assert_eq!(
        World::load(&world_with(KINDS + 1).save()).err(),
        Some(LoadError::Invalid("genome part kind"))
    );
}

#[test]
fn the_add_part_mutation_draws_every_kind() {
    // 6 until M4 Task 9 ended the switch-on rule.
    assert_eq!(ADDABLE_KINDS, KINDS);
    let mut p = Params::new();
    p.set(id::MUT_PART_ADD, 1.0);
    p.set(id::MUT_PART_REMOVE, 0.0);
    let mut rng = Rng::new(3);
    let g = Genome::default();
    let mut seen = [false; KINDS as usize + 1];
    for _ in 0..400 {
        let child = g.mutated(&mut rng, &p, &mut 1000);
        seen[child.parts.last().expect("a new part").kind as usize] = true;
    }
    assert_eq!(
        seen,
        [false, true, true, true, true, true, true, true, true, true, true]
    );
}

/// Every piece of M4 state, set by hand: a piece of debris, a cloud, the new creature fields, the
/// new counters, the ability mask, and the possessed body killed by a named killer.
fn teeth_world() -> World {
    let mut w = World::new(4, 1536.0, 1024.0);
    // The counts below are set by hand: no bite and no corpse in the 20 ticks.
    w.params.set(id::BITE_RATE, 0.0);
    w.params.set(id::CORPSE_SHARE, 0.0);
    w.seed_founders(200, 300);
    w.run(20);
    let d = w.debris.slots.alloc().expect("debris slot") as usize;
    (w.debris.x[d], w.debris.y[d], w.debris.energy[d]) = (300.0, 400.0, 12.5);
    w.debris.dirty = true;
    let k = w.clouds.slots.alloc().expect("cloud slot") as usize;
    let cl = &mut w.clouds;
    (cl.x[k], cl.y[k], cl.radius[k]) = (500.0, 600.0, 24.0);
    (cl.left[k], cl.drain[k], cl.maker[k]) = (40, 0.3, w.creatures.uid[7]);
    let c = &mut w.creatures;
    (c.cmd_dash[3], c.cmd_toxin[3]) = (0.5, 1.0);
    (c.cd_dash[3], c.cd_toxin[3], c.strike_left[3]) = (7, 9, 4);
    (c.hurt[3], c.hurt_side[3]) = (2.5, -0.75);
    let s = &mut w.stats;
    (s.flesh, s.kills, s.poisoned, s.spiked, s.debris_eaten) = (3.5, 2, 1, 1, 4.25);
    assert!(w.possess(w.creatures.uid[9]));
    w.input(true, 0.5, 0.25, false, 5);
    w.kill(9, CAUSE_EATEN, Some(12));
    w
}

#[test]
fn a_victim_whose_killer_dies_earlier_in_the_same_kill_list_keeps_its_killer_on_the_card() {
    let mut w = World::new(5, 1536.0, 1024.0);
    w.seed_founders(50, 0);
    let (hunter, prey) = (w.creatures.uid[5], w.creatures.uid[9]);
    w.creatures.diet[5] = 0.75;
    let c = &w.creatures;
    let (generation, x, y) = (c.generation[5], c.x[5], c.y[5]);
    assert!(w.possess(prey));
    // Body 5 bit body 9 to 0 and a spike of body 9 took body 5 to 0, as `bite::step` lists them.
    w.kill_all(&[(5, CAUSE_SPIKED, Some(9)), (9, CAUSE_EATEN, Some(5))]);
    assert_eq!(
        (w.control.killer, w.control.death_cause),
        (hunter, CAUSE_EATEN)
    );
    assert_eq!(w.control.killer_brain[0], hunter);
    assert!(w.control.killer_brain.len() > READOUT_HEADER_WORDS as usize);
    // The card's body is the killer's as it was at the kill, though its slot is free now.
    assert_eq!(
        w.control.killer_body[..3],
        [generation, x.to_bits(), y.to_bits()]
    );
    // The last word of the body is the killer's diet.
    assert_eq!(w.control.killer_body.last(), Some(&0.75f32.to_bits()));
    assert!(!w.creatures.slots.is_alive(5) && !w.creatures.slots.is_alive(9));
    assert_eq!((w.slot_of(hunter), w.slot_of(prey)), (None, None));
    assert_eq!(w.stats.kills, 1);
    assert_eq!(w.stats.spiked, 1);
}

#[test]
fn a_world_with_debris_a_cloud_and_a_killer_is_the_same_in_a_reload() {
    let mut a = teeth_world();
    let killer = a.creatures.uid[12];
    assert_eq!(
        (a.control.killer, a.control.death_cause),
        (killer, CAUSE_EATEN)
    );
    assert_eq!(a.control.killer_brain[0], killer);
    assert!(a.control.killer_brain.len() > READOUT_HEADER_WORDS as usize);
    assert_eq!(a.stats.kills, 3);

    let mut b = World::load(&a.save()).expect("load");
    assert_eq!(b.state_hash(), a.state_hash());
    assert_eq!(b.control.killer_brain, a.control.killer_brain);
    assert_eq!((b.control.killer, b.control.abilities), (killer, 5));
    assert_eq!(b.control.killer_body, a.control.killer_body);
    assert_eq!(b.debris.slots.count(), 1);
    assert_eq!(
        (b.debris.x[0], b.debris.y[0], b.debris.energy[0]),
        (300.0, 400.0, 12.5)
    );
    assert_eq!(
        (b.clouds.left[0], b.clouds.maker[0]),
        (40, a.creatures.uid[7])
    );
    assert_eq!(
        (b.creatures.strike_left[3], b.creatures.hurt_side[3]),
        (4, -0.75)
    );
    a.run(60);
    b.run(60);
    assert_eq!(b.state_hash(), a.state_hash());

    // The mask is held while a body is possessed, and only its two bits: 2, the lunge, is retired.
    let mut c = teeth_world();
    assert!(c.possess(c.creatures.uid[20]));
    c.input(true, 0.0, 0.0, false, 0xFF);
    let d = World::load(&c.save()).expect("load");
    assert_eq!(d.control.abilities, 5);
    assert_eq!((d.control.killer, d.control.killer_brain.len()), (0, 0));
}

#[test]
fn a_killer_readout_longer_than_a_brain_does_not_load() {
    let mut w = teeth_world();
    let most = READOUT_MAX_WORDS as usize;
    w.control.killer_brain = vec![0; most];
    let loaded = World::load(&w.save()).expect("the longest readout loads");
    assert_eq!(loaded.control.killer_brain.len(), most);
    w.control.killer_brain = vec![0; most + 1];
    assert_eq!(
        World::load(&w.save()).err(),
        Some(LoadError::Invalid("killer brain length"))
    );
}
