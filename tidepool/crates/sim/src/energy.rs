//! Eating, upkeep, growth, and death.
//!
//! A filter mouth feeds on every plant the body touches, with no brain output. A full creature
//! takes nothing. Upkeep is paid for mass, for parts, for the brain, and for thrust. A juvenile
//! with a reserve builds mass. A creature with no energy starves, and an old one dies.

use crate::control::{CAUSE_OLD_AGE, CAUSE_STARVED};
use crate::params::id;
use crate::plant;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

/// Growth must leave this share of the reserve that starts it, so a step of growth cannot starve
/// the juvenile that takes it.
const GROW_FLOOR: f32 = 0.5;

/// Each live creature in slot order takes from the plants it touches, in grid order. What a plant
/// loses is what the creature gains and what `stats.eaten` counts.
pub fn contact(world: &mut World) {
    // `plant::step` runs later in the tick, so a plant added since then is not in the grid yet.
    world.plants.refresh_grid();
    let p = &world.params;
    let (per_mass, intake_rate) = (p.get(id::ENERGY_PER_MASS), p.get(id::INTAKE_RATE));
    let (bite_fraction, plant_cap) = (p.get(id::BITE_FRACTION), p.get(id::PLANT_CAP));
    let (c, plants, stats) = (&mut world.creatures, &mut world.plants, &mut world.stats);
    for s in 0..c.slots.high_water() as usize {
        if !c.slots.is_alive(s as u32) {
            continue;
        }
        let (x, y, radius) = (c.x[s], c.y[s], c.radius(s));
        let mut budget = intake_rate * c.filter[s] * c.length(s);
        let mut room = per_mass * c.mass(s) - c.energy[s];
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
    let lifespan = p.get(id::LIFESPAN) as u32;
    let (flag_force, cilia_force) = (p.get(id::FLAG_FORCE), p.get(id::CILIA_FORCE));
    let (basal, part_upkeep) = (p.get(id::BASAL), p.get(id::PART_UPKEEP));
    let (neuron_upkeep, conn_upkeep) = (p.get(id::NEURON_UPKEEP), p.get(id::CONN_UPKEEP));
    let (move_cost, per_mass) = (p.get(id::MOVE_COST), p.get(id::ENERGY_PER_MASS));
    let (grow_reserve, grow_rate) = (p.get(id::GROW_RESERVE), p.get(id::GROW_RATE));
    let build_cost = p.get(id::BUILD_COST);
    let (c, brains) = (&mut world.creatures, &world.brains);
    let mut deaths: Vec<(u32, u32)> = Vec::new();

    for s in 0..c.slots.high_water() as usize {
        if !c.slots.is_alive(s as u32) {
            continue;
        }
        // The count stops at the top of its range: a snapshot can hold any age.
        c.age[s] = c.age[s].saturating_add(1);

        let (mass, growth, thrust) = (c.mass(s), c.growth[s], c.cmd_thrust[s]);
        let parts = c.flagellum[s] + c.cilia[s] + c.filter[s] + c.chemo[s];
        // The force that the motor applies at full thrust is `drive * length`.
        let drive = flag_force * c.flagellum[s] + cilia_force * c.cilia[s];
        let upkeep = basal * mass
            + part_upkeep * mass * parts
            + neuron_upkeep * brains.n_neur[s] as f32
            + conn_upkeep * brains.n_conn[s] as f32
            + move_cost * thrust * thrust * drive * c.length(s);
        let mut energy = c.energy[s] - upkeep;

        let reserve = grow_reserve * per_mass * mass;
        if growth < 1.0 && energy > reserve {
            c.growth[s] = (growth + grow_rate).min(1.0);
            let cost = build_cost * (c.mass(s) - mass);
            if energy - cost > reserve * GROW_FLOOR {
                energy -= cost;
            } else {
                c.growth[s] = growth;
            }
        }
        // The capacity of the body as it is now, after any growth.
        energy = energy.min(per_mass * c.mass(s));
        c.energy[s] = energy;

        if energy <= 0.0 {
            deaths.push((s as u32, CAUSE_STARVED));
        } else if c.age[s] >= lifespan {
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
