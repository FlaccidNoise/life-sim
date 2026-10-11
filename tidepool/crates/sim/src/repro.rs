//! Budding. A fed adult splits off a brood of small children, each with a mutated genome and its
//! parent's mark. The parent's `egg` gene is the growth of a child, so a small egg gives a large
//! brood.
//!
//! The parent pays for each child's body and for each child's first energy, so a bud moves energy
//! and makes none.

use crate::creature::heft;
use crate::genome::Genome;
use crate::math::sin_cos;
use crate::params::id;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::{SpawnAt, World};

/// How far a newborn's heading spreads from its parent's, in radians per unit of `gauss`. A brood
/// that all faced one way would swim off as one body.
const HEADING_JITTER: f32 = 0.5;
/// The angle between two neighbours of a brood, in radians about the centre of the parent. The
/// motor does not push two bodies that sit on one point, so each child gets its own place. With
/// the largest `brood_max` the last child sits at 4 steps, which is short of half a turn.
const BROOD_FAN: f32 = 0.7;

/// Each live creature in slot order counts down its cooldown, or buds if it is a fed adult and
/// can pay. One bud makes up to `brood_max` children and stops at the first one that the parent
/// cannot pay for. The first child is born behind the parent. The others fan out around the rear
/// at the same distance, to one side and then to the other. The births are applied after the
/// loop, in the slot order of the parents, so a newborn does not bud on the tick of its birth.
pub fn step(world: &mut World) {
    let p = &world.params;
    let (bud_at, cooldown) = (p.get(id::BUD_AT), p.get(id::BUD_COOLDOWN) as u32);
    let (parent_reserve, child_energy) = (p.get(id::PARENT_RESERVE), p.get(id::CHILD_ENERGY));
    let (build_cost, per_mass) = (p.get(id::BUILD_COST), p.get(id::ENERGY_PER_MASS));
    let (part_mass, eye_cost) = (p.get(id::PART_MASS), p.get(id::EYE_COST));
    let brood_max = p.get(id::BROOD_MAX) as u32;
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
        if !fed_adult {
            continue;
        }
        let egg = c.egg[s];
        for i in 0..brood_max {
            if births.len() >= room {
                break;
            }
            // The genome is drawn before the price is known, as in M1.
            let child = world.genomes[s].mutated(&mut world.rng_mutate, p, &mut world.next_history);
            let (length, width) = (child.len * egg, child.len * child.wid * egg);
            let area = length * width;
            let mass = area * heft(child.part_sum(eye_cost), part_mass);
            let cost = build_cost * mass + child_energy * per_mass * area;
            // A loaded genome can hold any size and any egg. A child of negative mass would pay
            // its parent, and two negative sides make a positive area. Every test is false for NaN.
            let sound = egg > 0.0 && length > 0.0 && width > 0.0 && mass > 0.0;
            let can_pay = sound && c.energy[s] - cost >= parent_reserve * cap;
            if !can_pay {
                break;
            }
            c.energy[s] -= cost;
            c.bud_cooldown[s] = cooldown;
            let held = &mut world.control;
            if held.possessed != 0 && held.possessed_slot as usize == s {
                // A snapshot can hold any count.
                held.buds = held.buds.saturating_add(1);
            }
            // Behind the parent, with the two bodies just touching. Child 0 is straight behind,
            // by the heading as it is. A later child is turned `BROOD_FAN` more with each pair: the
            // odd ones to one side and the even ones to the other.
            let behind = c.radius(s) + (length + width) / 4.0;
            let (hc, hs) = if i == 0 {
                (c.hc[s], c.hs[s])
            } else {
                let turn = BROOD_FAN * i.div_ceil(2) as f32;
                let (sin, cos) = sin_cos(if i % 2 == 1 { turn } else { -turn });
                (c.hc[s] * cos - c.hs[s] * sin, c.hs[s] * cos + c.hc[s] * sin)
            };
            let at = SpawnAt {
                x: c.x[s] - hc * behind,
                y: c.y[s] - hs * behind,
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
