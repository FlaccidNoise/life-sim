//! Eating, upkeep, growth, and death.
//!
//! A filter mouth feeds on every plant the body touches, with no brain output. A full creature
//! takes nothing, and no bite takes a plant under its death reserve. Upkeep is paid for mass, for
//! being a body, for each hidden neuron and each expressed connection of the brain, and for thrust,
//! and a long `old` gene raises all of it. A juvenile with a reserve builds mass. A creature with
//! no energy starves, and one at the age of its `old` gene dies.
//!
//! Mass is the area times the heft of the parts. Capacity is for area alone: parts are not stores.

use crate::control::{CAUSE_OLD_AGE, CAUSE_STARVED};
use crate::genome::{REF_AREA, REF_WIDTH};
use crate::math::pow075;
use crate::params::id;
use crate::plant;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

/// Each live creature in slot order takes from the plants it touches, in grid order. What a plant
/// loses is what the creature gains and what `stats.eaten` counts.
pub fn contact(world: &mut World) {
    // `plant::step` runs later in the tick, so a plant added since then is not in the grid yet.
    world.plants.refresh_grid();
    let p = &world.params;
    let (per_mass, intake_rate) = (p.get(id::ENERGY_PER_MASS), p.get(id::INTAKE_RATE));
    let (bite_fraction, plant_cap) = (p.get(id::BITE_FRACTION), p.get(id::PLANT_CAP));
    let death_reserve = p.get(id::PLANT_DEATH_RESERVE);
    let (c, plants, stats) = (&mut world.creatures, &mut world.plants, &mut world.stats);
    for s in 0..c.slots.high_water() as usize {
        if !c.slots.is_alive(s as u32) {
            continue;
        }
        let (x, y, radius) = (c.x[s], c.y[s], c.radius(s));
        // The mouth follows the area. For the reference body it is the length.
        let mut budget = intake_rate * c.filter[s] * (c.area(s) / REF_WIDTH);
        let mut room = per_mass * c.area(s) - c.energy[s];
        let mut energy = c.energy[s];
        // The centre of a plant that the body touches is at most this far away.
        let reach = radius + plant::MAX_RADIUS;
        plants
            .grid
            .for_each_in_box(x - reach, y - reach, x + reach, y + reach, |j| {
                let j = j as usize;
                let (dx, dy) = (plants.x[j] - x, plants.y[j] - y);
                let touch =
                    radius + plant::radius(plants.reserve[j], plant_cap).min(plant::MAX_RADIUS);
                // What stands above the death reserve. A grazer can take no more, so grazing
                // never kills a plant.
                let spare = plants.reserve[j] - death_reserve;
                // Every test is false for NaN, so a body or a plant with a wild value eats and
                // loses nothing.
                if budget > 0.0 && room > 0.0 && spare > 0.0 && dx * dx + dy * dy <= touch * touch {
                    let bite = (plants.reserve[j] * bite_fraction).min(spare);
                    let take = budget.min(room).min(bite);
                    // The `max` is for the last bit of the subtraction.
                    plants.reserve[j] = (plants.reserve[j] - take).max(death_reserve);
                    energy += take;
                    budget -= take;
                    room -= take;
                    stats.eaten += take as f64;
                }
            });
        c.energy[s] = energy;
    }
}

/// Each live creature in slot order ages, pays its upkeep, and grows if it is a juvenile with a
/// reserve. The dead are removed after the loop, in slot order.
pub fn life(world: &mut World) {
    let p = &world.params;
    let (flag_force, cilia_force) = (p.get(id::FLAG_FORCE), p.get(id::CILIA_FORCE));
    let (neuron_upkeep, conn_upkeep) = (p.get(id::NEURON_UPKEEP), p.get(id::CONN_UPKEEP));
    let (basal, fixed_upkeep) = (p.get(id::BASAL), p.get(id::FIXED_UPKEEP));
    let move_cost = p.get(id::MOVE_COST);
    let per_mass = p.get(id::ENERGY_PER_MASS);
    let (grow_reserve, grow_rate) = (p.get(id::GROW_RESERVE), p.get(id::GROW_RATE));
    let (build_cost, grow_floor) = (p.get(id::BUILD_COST), p.get(id::GROW_FLOOR));
    let (part_mass, eye_cost) = (p.get(id::PART_MASS), p.get(id::EYE_COST));
    let (old_cost, lifespan) = (p.get(id::OLD_COST), p.get(id::LIFESPAN));
    // `REF_AREA` to the power 1/4. With it the reference body pays `basal` per unit of its mass.
    let ref_root = REF_AREA.sqrt().sqrt();
    let (c, brains, stats) = (&mut world.creatures, &world.brains, &mut world.stats);
    let mut deaths: Vec<(u32, u32)> = Vec::new();

    for s in 0..c.slots.high_water() as usize {
        if !c.slots.is_alive(s as u32) {
            continue;
        }
        // The count stops at the top of its range: a snapshot can hold any age.
        c.age[s] = c.age[s].saturating_add(1);

        let (area, growth, thrust) = (c.area(s), c.growth[s], c.cmd_thrust[s]);
        let mass = c.mass(s, part_mass, eye_cost);
        // Upkeep is paid for the mass to the power 3/4, so that a small body pays more for each
        // unit of its mass. The force of the motor follows the area, and so does its cost.
        let drive = flag_force * c.flag_push[s] + cilia_force * c.cilia[s];
        // A brain pays for what is hidden and for what is expressed. An input and an output are
        // free, so a sense does not pay for the neurons that it declares. A juvenile pays the
        // fixed upkeep in full.
        let hidden = brains.n_neur[s] - brains.n_in[s] - brains.n_out[s];
        let upkeep = basal * (ref_root * pow075(mass))
            + fixed_upkeep
            + neuron_upkeep * hidden as f32
            + conn_upkeep * brains.n_conn[s] as f32
            + move_cost * thrust * thrust * drive * (area / REF_WIDTH);
        // A life longer than the founder's costs more per tick, and a shorter one costs less.
        let upkeep = upkeep * (1.0 + old_cost * (c.old[s] / lifespan - 1.0));
        let mut energy = c.energy[s] - upkeep;

        let reserve = grow_reserve * per_mass * area;
        if growth < 1.0 && energy > reserve {
            c.growth[s] = (growth + grow_rate).min(1.0);
            let cost = build_cost * (c.mass(s, part_mass, eye_cost) - mass);
            if energy - cost > reserve * grow_floor {
                energy -= cost;
            } else {
                c.growth[s] = growth;
            }
        }
        // The capacity of the body as it is now, after any growth.
        energy = energy.min(per_mass * c.area(s));
        c.energy[s] = energy;

        if energy <= 0.0 {
            deaths.push((s as u32, CAUSE_STARVED));
            if c.growth[s] < 1.0 {
                stats.starved_juv = stats.starved_juv.saturating_add(1);
            }
        } else if c.age[s] >= c.old[s] as u32 {
            deaths.push((s as u32, CAUSE_OLD_AGE));
        }
    }

    for (slot, cause) in deaths {
        world.kill(slot, cause);
    }
}

/// Writes nothing: energy, growth, and age are creature fields.
pub fn save(_world: &World, _w: &mut Writer) {}

/// Reads nothing.
pub fn load(_world: &mut World, _r: &mut Reader) -> Result<(), LoadError> {
    Ok(())
}
