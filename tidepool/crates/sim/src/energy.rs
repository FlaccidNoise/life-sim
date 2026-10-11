//! Eating, upkeep, growth, and death.
//!
//! A filter mouth feeds on every plant the body touches, with no brain output. A full creature
//! takes nothing. Upkeep is paid for mass, for parts, for the brain, and for thrust, and a long
//! `old` gene raises all of it. A juvenile with a reserve builds mass. A creature with no energy
//! starves, and one at the age of its `old` gene dies.
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
    let intake_curve = p.get(id::INTAKE_CURVE);
    let (c, plants, stats) = (&mut world.creatures, &mut world.plants, &mut world.stats);
    for s in 0..c.slots.high_water() as usize {
        if !c.slots.is_alive(s as u32) {
            continue;
        }
        let (x, y, radius) = (c.x[s], c.y[s], c.radius(s));
        // The mouth follows the length at `intake_curve` 0 and the area at 1. The reference body
        // has the same mouth on both.
        let mouth = c.length(s) * (1.0 - intake_curve) + c.area(s) / REF_WIDTH * intake_curve;
        let mut budget = intake_rate * c.filter[s] * mouth;
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
                // Every test is false for NaN, so a body or a plant with a wild value eats and
                // loses nothing.
                if budget > 0.0 && room > 0.0 && dx * dx + dy * dy <= touch * touch {
                    let take = budget.min(room).min(plants.reserve[j] * bite_fraction);
                    plants.reserve[j] -= take;
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
    let (basal, part_upkeep) = (p.get(id::BASAL), p.get(id::PART_UPKEEP));
    let (neuron_upkeep, conn_upkeep) = (p.get(id::NEURON_UPKEEP), p.get(id::CONN_UPKEEP));
    let (move_cost, per_mass) = (p.get(id::MOVE_COST), p.get(id::ENERGY_PER_MASS));
    let (grow_reserve, grow_rate) = (p.get(id::GROW_RESERVE), p.get(id::GROW_RATE));
    let (build_cost, grow_floor) = (p.get(id::BUILD_COST), p.get(id::GROW_FLOOR));
    let (part_mass, eye_cost) = (p.get(id::PART_MASS), p.get(id::EYE_COST));
    let (upkeep_curve, motor_curve) = (p.get(id::UPKEEP_CURVE), p.get(id::MOTOR_CURVE));
    let (old_cost, lifespan) = (p.get(id::OLD_COST), p.get(id::LIFESPAN));
    // `REF_AREA` to the power 1/4. With it the upkeep curve meets the line at the reference body.
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
        let (mass, parts) = (c.mass(s, part_mass, eye_cost), c.part_sum(s, eye_cost));
        // What upkeep is paid for: the mass at `upkeep_curve` 0, and the mass to the power 3/4 at
        // 1, so that a small body pays more for each unit of its mass.
        let paid = mass * (1.0 - upkeep_curve) + ref_root * pow075(mass) * upkeep_curve;
        // The force that the motor applies at full thrust is `drive * length`. At `motor_curve` 1
        // the force follows the area, and so does its cost.
        let drive = flag_force * c.flag_push[s] + cilia_force * c.cilia[s];
        let pushed = c.length(s) * (1.0 - motor_curve) + area / REF_WIDTH * motor_curve;
        let upkeep = basal * paid
            + part_upkeep * paid * parts
            + neuron_upkeep * brains.n_neur[s] as f32
            + conn_upkeep * brains.n_conn[s] as f32
            + move_cost * thrust * thrust * drive * pushed;
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
