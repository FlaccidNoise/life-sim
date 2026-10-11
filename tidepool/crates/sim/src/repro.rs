//! Budding. A fed adult splits off a small child with a mutated genome and its parent's mark. The
//! parent's `egg` gene is the growth of the child.
//!
//! The parent pays for the child's body and for the child's first energy, so a bud moves energy
//! and makes none.

use crate::genome::Genome;
use crate::params::id;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::{SpawnAt, World};

/// How far a newborn's heading spreads from its parent's, in radians per unit of `gauss`. A brood
/// that all faced one way would swim off as one body.
const HEADING_JITTER: f32 = 0.5;

/// Each live creature in slot order counts down its cooldown, or buds if it is a fed adult and
/// can pay. The births are applied after the loop, in the slot order of the parents, so a newborn
/// does not bud on the tick of its birth.
pub fn step(world: &mut World) {
    let p = &world.params;
    let (bud_at, cooldown) = (p.get(id::BUD_AT), p.get(id::BUD_COOLDOWN) as u32);
    let (parent_reserve, child_energy) = (p.get(id::PARENT_RESERVE), p.get(id::CHILD_ENERGY));
    let (build_cost, per_mass) = (p.get(id::BUILD_COST), p.get(id::ENERGY_PER_MASS));
    let c = &mut world.creatures;
    // A birth needs a free slot and a uid. `World::spawn` never gives out the last uid.
    let free = c.slots.capacity() - c.slots.count();
    let room = free.min(u32::MAX - world.next_uid) as usize;
    let mut births: Vec<(Genome, SpawnAt)> = Vec::new();

    for s in 0..c.slots.high_water() as usize {
        if !c.slots.is_alive(s as u32) {
            continue;
        }
        if c.bud_cooldown[s] > 0 {
            c.bud_cooldown[s] -= 1;
            continue;
        }
        let cap = per_mass * c.area(s);
        // Both tests are false for NaN, so a body with a wild value does not bud.
        let fed_adult = c.growth[s] >= 1.0 && c.energy[s] >= bud_at * cap;
        if !fed_adult || births.len() >= room {
            continue;
        }
        let child = world.genomes[s].mutated(&mut world.rng_mutate, p, &mut world.next_history);
        let egg = c.egg[s];
        let (length, width) = (child.len * egg, child.len * child.wid * egg);
        let mass = length * width;
        let cost = build_cost * mass + child_energy * per_mass * mass;
        // A loaded genome can hold any size. A child of negative mass would pay its parent.
        let can_pay = mass > 0.0 && c.energy[s] - cost >= parent_reserve * cap;
        if !can_pay {
            continue;
        }
        c.energy[s] -= cost;
        c.bud_cooldown[s] = cooldown;
        // Behind the parent, with the two bodies just touching.
        let behind = c.radius(s) + (length + width) / 4.0;
        let at = SpawnAt {
            x: c.x[s] - c.hc[s] * behind,
            y: c.y[s] - c.hs[s] * behind,
            heading: c.heading[s] + world.rng_mutate.gauss() * HEADING_JITTER,
            growth: egg,
            energy01: child_energy,
            parent: c.uid[s],
            // A snapshot can hold any generation.
            generation: c.generation[s].saturating_add(1),
            mark: c.mark[s],
        };
        births.push((child, at));
    }

    for (child, at) in births {
        let born = world.spawn(child, at);
        debug_assert!(born.is_some(), "the loop counted a slot and a uid for it");
    }
}

/// Writes nothing: the cooldown is a creature field, and `rng_mutate` and `next_history` are world
/// fields.
pub fn save(_world: &World, _w: &mut Writer) {}

/// Reads nothing.
pub fn load(_world: &mut World, _r: &mut Reader) -> Result<(), LoadError> {
    Ok(())
}
