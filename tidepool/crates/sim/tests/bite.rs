// Tests run native only, so a banned float method is safe here.
#![allow(clippy::disallowed_methods)]

use std::f32::consts::PI;
use tidepool_sim::brain;
use tidepool_sim::control::{CAUSE_EATEN, CAUSE_SPIKED};
use tidepool_sim::genome::{BrainGenome, Genome, PartGene, KIND_JAW, KIND_SHELL, KIND_SPIKE};
use tidepool_sim::motor::NO_TOUCH;
use tidepool_sim::params::id;
use tidepool_sim::rng::Rng;
use tidepool_sim::world::{SpawnAt, World};

/// Open water where the bite is the only rule that moves energy: no upkeep, no push, no plants.
/// A jaw bites at its Start rate.
fn still_water() -> World {
    let mut w = World::new(1, 512.0, 512.0);
    for k in [
        id::BASAL,
        id::FIXED_UPKEEP,
        id::NEURON_UPKEEP,
        id::CONN_UPKEEP,
        id::MOVE_COST,
        id::REPEL,
    ] {
        w.params.set(k, 0.0);
    }
    w.params.set(id::BITE_RATE, 0.5);
    // The tests were written at the Off defaults: any body can be bitten, no guard does anything,
    // a shell adds no drag, and a lunge does not raise the bite. Each test that reads one of these
    // sets it itself.
    w.params.set(id::BITE_MASS_RATIO, 0.0);
    w.params.set(id::SHELL_BLOCK, 0.0);
    w.params.set(id::SPIKE_HURT, 0.0);
    w.params.set(id::SHELL_DRAG, 0.0);
    w.params.set(id::LUNGE_BITE, 1.0);
    // The diet rules (D1, D2) are off here: `diet.rs` tests them.
    w.params.set(id::DIET_K, 0.0);
    w.params.set(id::BITE_DIET_GAP, -1.0);
    w
}

/// The reference founder (area 72, radius 4.5) at rest at the place, with an empty brain, so it
/// commands nothing. It never buds.
fn adult(w: &mut World, x: f32, heading: f32, edit: impl FnOnce(&mut Genome)) -> usize {
    let mut g = Genome::founder(&mut Rng::new(1), &w.params);
    (g.len, g.wid) = (12.0, 0.5);
    g.brain = BrainGenome::default();
    edit(&mut g);
    let at = SpawnAt {
        x,
        y: 256.0,
        heading,
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

fn jaw(g: &mut Genome) {
    g.set_size(KIND_JAW, 0.5);
}

fn guard(kind: u8, anchor: f32, size: f32) -> impl FnOnce(&mut Genome) {
    move |g: &mut Genome| {
        g.parts.push(PartGene {
            kind,
            anchor,
            size,
            extra: 0.0,
            history: 900,
        })
    }
}

/// A biter at x 100 heading along x, and a body 8 ahead of it facing the same way: their radii
/// add up to 9, so they touch.
fn pair(prey: impl FnOnce(&mut Genome)) -> (World, usize, usize) {
    let mut w = still_water();
    let s = adult(&mut w, 100.0, 0.0, jaw);
    let j = adult(&mut w, 108.0, 0.0, prey);
    (w, s, j)
}

/// A world of founders, one in three given a Jaw at the nose by hand, with the parameters set.
fn hunting_world(set: &[(usize, f32)]) -> World {
    let mut w = World::new(7, 768.0, 512.0);
    for &(k, v) in set {
        w.params.set(k, v);
    }
    w.seed_founders(300, 400);
    for s in (0..w.creatures.slots.high_water() as usize).step_by(3) {
        w.genomes[s].set_size(KIND_JAW, 0.5);
        let g = w.genomes[s].clone();
        w.creatures.express(s, &g);
    }
    w
}

fn rows(w: &World) -> (u32, u64, u64, f64, u64) {
    let s = &w.stats;
    (w.state_hash(), s.births, s.deaths, s.flesh, s.kills)
}

#[test]
fn with_bite_rate_0_nothing_changes() {
    let off = [(id::BITE_RATE, 0.0)];
    // Every other parameter of rule J1 at its Start value: at `bite_rate` 0 none of them acts.
    let others = [
        (id::BITE_RATE, 0.0),
        (id::BITE_MASS_RATIO, 1.15),
        (id::SPIKE_HURT, 1.0),
        (id::SHELL_BLOCK, 1.0),
        (id::LUNGE_BITE, 2.0),
        (id::JAW_ARC, 1.2),
    ];
    let (mut a, mut b) = (hunting_world(&off), hunting_world(&others));
    a.run(1500);
    b.run(1500);
    // The parameters are in the snapshot, so the two hashes differ. Everything else is equal.
    let (_, births, deaths, flesh, kills) = rows(&a);
    assert_eq!((flesh, kills), (0.0, 0));
    assert!(births > 0 && deaths > 0);
    assert_eq!((b.stats.births, b.stats.deaths), (births, deaths));
    let (ca, cb) = (&a.creatures, &b.creatures);
    assert_eq!(ca.slots.high_water(), cb.slots.high_water());
    for s in 0..ca.slots.high_water() as usize {
        assert_eq!(ca.slots.is_alive(s as u32), cb.slots.is_alive(s as u32));
        assert_eq!(ca.energy[s].to_bits(), cb.energy[s].to_bits(), "slot {s}");
        assert_eq!(
            (ca.x[s].to_bits(), ca.y[s].to_bits()),
            (cb.x[s].to_bits(), cb.y[s].to_bits())
        );
        for c in [ca, cb] {
            assert_eq!(
                (c.hurt[s], c.hurt_side[s], c.hurt_tick[s], c.bit_tick[s]),
                (0.0, 0.0, 0, 0)
            );
        }
    }
    // The same world at the Start rate bites: the comparison above is not empty.
    let mut on = hunting_world(&[(id::BITE_RATE, 0.5)]);
    on.run(1500);
    assert!(on.stats.flesh > 0.0);
}

#[test]
fn a_jaw_bites_a_body_it_faces_and_not_one_behind_it() {
    let (mut w, s, j) = pair(|_| {});
    let (es, ej) = (w.creatures.energy[s], w.creatures.energy[j]);
    w.run(1);
    assert_eq!(w.motor.bite_target[s] as usize, j);
    assert!(w.creatures.energy[s] > es && w.creatures.energy[j] < ej);

    // The same pair with the body 8 behind the biter: it touches, and no cone holds it.
    let mut w = still_water();
    let s = adult(&mut w, 100.0, 0.0, jaw);
    let j = adult(&mut w, 92.0, 0.0, |_| {});
    let (es, ej) = (w.creatures.energy[s], w.creatures.energy[j]);
    w.run(1);
    assert_eq!(w.motor.touch[s] as usize, j);
    assert_eq!(w.motor.bite_target[s], NO_TOUCH);
    assert_eq!((w.creatures.energy[s], w.creatures.energy[j]), (es, ej));
}

#[test]
fn what_the_prey_loses_the_biter_gains() {
    let (mut w, s, j) = pair(|_| {});
    // A bite of 3/32 a tick: neither body fills or dies in 100 ticks.
    w.params.set(id::BITE_RATE, 1.0 / 64.0);
    w.creatures.energy[s] = 18.0;
    let total = w.creatures.energy[s] + w.creatures.energy[j];
    let start_s = w.creatures.energy[s];
    for _ in 0..100 {
        w.run(1);
        let (es, ej) = (w.creatures.energy[s], w.creatures.energy[j]);
        assert!(((es + ej) - total).abs() < 1e-6, "{es} + {ej} != {total}");
        assert!((w.stats.flesh - (es - start_s) as f64).abs() < 1e-6);
    }
    assert!((w.stats.flesh - 100.0 * 3.0 / 32.0).abs() < 1e-6);
}

#[test]
fn a_full_biter_takes_nothing() {
    let (mut w, s, j) = pair(|_| {});
    w.creatures.energy[s] = w.creatures.area(s) * w.params.get(id::ENERGY_PER_MASS);
    let ej = w.creatures.energy[j];
    w.run(1);
    assert_eq!(w.motor.bite_target[s] as usize, j);
    assert_eq!((w.creatures.energy[j], w.stats.flesh), (ej, 0.0));
}

#[test]
fn a_body_heavier_than_the_ratio_allows_is_not_bitten() {
    let bitten = |len: f32| {
        let (mut w, _, j) = pair(|g| g.len = len);
        w.params.set(id::BITE_MASS_RATIO, 1.15);
        let ej = w.creatures.energy[j];
        w.run(1);
        w.creatures.energy[j] < ej
    };
    assert!(bitten(10.0));
    // The biter is 1.15 times as heavy as a bare body of its size, and not 1.15 times as heavy as a
    // body of length 12.5.
    assert!(!bitten(12.5));
}

#[test]
fn a_shell_on_the_hit_side_blocks_and_one_on_the_far_side_does_not() {
    let take = |anchor: f32| {
        let (mut w, _, j) = pair(guard(KIND_SHELL, anchor, 0.5));
        w.params.set(id::SHELL_BLOCK, 1.0);
        let ej = w.creatures.energy[j];
        w.run(1);
        ej - w.creatures.energy[j]
    };
    // The biter is behind the prey. A shell at the tail blocks half of the bite of 3, and one at
    // the nose blocks none of it.
    let (tail, nose) = (take(1.0), take(0.0));
    assert!((tail - 1.5).abs() < 1e-5, "{tail}");
    assert!((nose - 3.0).abs() < 1e-5, "{nose}");
}

#[test]
fn a_spike_hurts_the_biter_and_the_energy_is_gone() {
    let (mut w, s, j) = pair(guard(KIND_SPIKE, 1.0, 0.5));
    w.params.set(id::SPIKE_HURT, 1.0);
    let (es, ej) = (w.creatures.energy[s], w.creatures.energy[j]);
    w.run(1);
    let c = &w.creatures;
    // The bite is 3: the prey loses it, and the biter gains it and loses 1 * 0.5 * 3.
    assert!((ej - c.energy[j] - 3.0).abs() < 1e-5);
    assert!((c.energy[s] - es - 1.5).abs() < 1e-5);
    assert!(((es + ej) - (c.energy[s] + c.energy[j]) - 1.5).abs() < 1e-5);
    assert!((c.hurt[s] - 1.5).abs() < 1e-5 && (c.hurt[j] - 3.0).abs() < 1e-5);
    assert!(c.hurt_tick[s] != 0 && c.bit_tick[s] != 0 && c.hurt_tick[j] != 0);

    // A spike at the far side does nothing.
    let (mut w, s, _) = pair(guard(KIND_SPIKE, 0.0, 0.5));
    w.params.set(id::SPIKE_HURT, 1.0);
    w.run(1);
    assert_eq!(w.creatures.hurt[s], 0.0);

    // A spike that takes the biter to 0 kills it, and the prey is its killer.
    let (mut w, s, j) = pair(guard(KIND_SPIKE, 1.0, 1.0));
    w.params.set(id::SPIKE_HURT, 4.0);
    w.creatures.energy[s] = 5.0;
    assert!(w.possess(w.creatures.uid[s]));
    let prey = w.creatures.uid[j];
    w.run(1);
    assert!(!w.creatures.slots.is_alive(s as u32));
    assert_eq!(
        (w.control.death_cause, w.control.killer),
        (CAUSE_SPIKED, prey)
    );
    assert!(w.creatures.slots.is_alive(j as u32));
    assert_eq!((w.stats.spiked, w.stats.kills), (1, 0));
    assert_eq!(w.kills.last().map(|k| k[2]), Some(j as u32));
}

#[test]
fn a_bite_to_0_kills_with_cause_eaten_and_names_the_killer() {
    let (mut w, s, j) = pair(|_| {});
    w.creatures.energy[j] = 2.0;
    let (es, uid) = (w.creatures.energy[s], w.creatures.uid[j]);
    assert!(w.possess(uid));
    w.run(1);
    assert!(!w.creatures.slots.is_alive(j as u32));
    assert!((w.creatures.energy[s] - es - 2.0).abs() < 1e-6);
    assert_eq!((w.stats.kills, w.stats.deaths), (1, 1));
    assert_eq!(w.kills.last().map(|k| k[2]), Some(s as u32));
    assert_eq!(w.control.death_cause, CAUSE_EATEN);
    assert_eq!(w.control.killer, w.creatures.uid[s]);
}

#[test]
fn a_body_killed_in_this_pass_is_not_bitten_again() {
    let mut w = still_water();
    // Two biters on either side of one body, both facing it.
    let a = adult(&mut w, 100.0, 0.0, jaw);
    let b = adult(&mut w, 116.0, PI, jaw);
    let j = adult(&mut w, 108.0, 0.5 * PI, |_| {});
    w.creatures.energy[j] = 2.0;
    let eb = w.creatures.energy[b];
    w.run(1);
    assert_eq!(w.motor.bite_target[a] as usize, j);
    assert_eq!(w.motor.bite_target[b] as usize, j);
    assert!(!w.creatures.slots.is_alive(j as u32));
    assert_eq!(w.creatures.energy[b], eb);
    assert_eq!((w.stats.flesh, w.stats.kills, w.stats.deaths), (2.0, 1, 1));
}

#[test]
fn the_possessed_body_eaten_stores_the_killers_brain_at_the_kill() {
    let (mut w, s, j) = pair(|_| {});
    w.creatures.energy[j] = 2.0;
    assert!(w.possess(w.creatures.uid[j]));
    w.run(1);
    assert_eq!(w.control.possessed, 0);
    let killer = w.creatures.uid[s];
    assert_eq!(w.control.killer, killer);
    // Nothing has changed the killer's brain since the kill.
    let n = brain::readout(&mut w, killer) as usize;
    assert!(n > 0);
    assert_eq!(w.control.killer_brain, w.readout[..n]);
}

/// The speed along x after one tick from a speed of 1, with the body held at no thrust and no turn.
fn coast_one_tick(w: &mut World, s: usize) -> f32 {
    assert!(w.possess(w.creatures.uid[s]));
    w.input(true, 0.0, 0.0, false, 0);
    w.creatures.vx[s] = 1.0;
    w.run(1);
    w.creatures.vx[s]
}

#[test]
fn a_shell_slows_a_body_by_shell_drag() {
    let coast = |shell: f32, shell_drag: f32| {
        let mut w = still_water();
        w.params.set(id::SHELL_DRAG, shell_drag);
        let s = adult(&mut w, 200.0, 0.0, guard(KIND_SHELL, 0.5, shell));
        coast_one_tick(&mut w, s)
    };
    // `math::sin_cos` gives a heading of 0 a cosine a little above 1, so the speeds are compared
    // to that of a body with no shell.
    let keep = 1.0 - World::new(1, 512.0, 512.0).params.get(id::DRAG_FWD);
    let bare = coast(0.0, 0.05);
    assert!((bare / keep - 1.0).abs() < 1e-4, "{bare} {keep}");
    let slowed = coast(0.5, 0.05) / bare;
    assert!((slowed - (keep - 0.025) / keep).abs() < 1e-6, "{slowed}");
    // At `shell_drag` 0 a shell changes nothing, to the bit.
    assert_eq!(coast(0.5, 0.0).to_bits(), bare.to_bits());
    // The drag is held under 0.95.
    let mut w = still_water();
    w.params.set(id::SHELL_DRAG, 0.5);
    let s = adult(&mut w, 200.0, 0.0, |g| {
        for _ in 0..4 {
            guard(KIND_SHELL, 0.5, 1.0)(g);
        }
    });
    assert!((coast_one_tick(&mut w, s) / bare - 0.05 / keep).abs() < 1e-6);
}

#[test]
fn two_runs_of_a_hunting_world_are_equal() {
    let set = [
        (id::BITE_RATE, 0.5),
        (id::BITE_MASS_RATIO, 1.15),
        (id::SPIKE_HURT, 1.0),
        (id::SHELL_BLOCK, 1.0),
        (id::SHELL_DRAG, 0.05),
    ];
    let run = || {
        let mut w = hunting_world(&set);
        w.run(1500);
        rows(&w)
    };
    let first = run();
    assert_eq!(first, run());
    assert!(first.3 > 0.0 && first.4 > 0, "the world hunts: {first:?}");
}
