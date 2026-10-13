//! Brain inputs: the creature's own state, the scent at its centre, and what its eyes see.

use crate::brain::{
    thinks, IN_AGE, IN_CONST, IN_ENERGY, IN_MATE_KIN, IN_MATE_SIZE, IN_SPEED, NO_INPUT,
};
use crate::eye;
use crate::params::id;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

/// Added to the local scent level before the gradient is divided by it, so that a place with no
/// scent gives a gradient of 0 and not a division by zero.
const SCENT_FLOOR: f32 = 1e-6;

/// Each live creature whose turn it is to think gets its inputs: the 6 of the body at their fixed
/// indexes, the 3 of the scent from `Brains::in_scent` if it has a chemoreceptor (the level, the
/// gradient along the heading, and the gradient across it), and those of `eye::see` if it has an
/// eye. The two mate inputs read 0. The eyes scan on one think in `see_every`. On the other thinks
/// the eye inputs keep their last values.
///
/// The gradient is divided by the local scent level, so a creature far from food still gets a
/// direction. The side gradient is positive when scent rises on the creature's `+heading` side.
pub fn step(world: &mut World) {
    // `plant::step` runs later in the tick, so a plant added since then is not in the grid yet.
    world.plants.refresh_grid();
    let params = &world.params;
    let every = params.get(id::THINK_EVERY) as u32;
    let see_every = every * params.get(id::SEE_EVERY) as u32;
    let (v_max, gain) = (params.get(id::V_MAX), params.get(id::CHEMO_GAIN));
    let per_mass = params.get(id::ENERGY_PER_MASS);
    for s in 0..world.creatures.slots.high_water() as usize {
        let World {
            creatures: c,
            brains,
            scent,
            tick,
            ..
        } = world;
        if !c.slots.is_alive(s as u32) || !thinks(*tick, s, every) {
            continue;
        }
        let energy01 = c.energy01(s, per_mass);
        let speed = (c.vx[s] * c.vx[s] + c.vy[s] * c.vy[s]).sqrt();
        let in_scent = brains.in_scent[s];
        let input = brains.inputs_mut(s);
        input[IN_CONST as usize] = 1.0;
        input[IN_ENERGY as usize] = energy01;
        input[IN_AGE as usize] = c.age[s] as f32 / c.old[s];
        input[IN_SPEED as usize] = speed / v_max;
        (input[IN_MATE_SIZE as usize], input[IN_MATE_KIN as usize]) = (0.0, 0.0);
        if in_scent != NO_INPUT {
            let (hc, hs, chemo) = (c.hc[s], c.hs[s], c.chemo[s]);
            let s0 = scent.sample(c.x[s], c.y[s]);
            let (gx, gy) = scent.gradient(c.x[s], c.y[s]);
            let k = gain * chemo / (s0 + SCENT_FLOOR);
            let level = s0 * chemo;
            let input = &mut input[in_scent as usize..][..3];
            input[0] = level / (1.0 + level);
            input[1] = ((gx * hc + gy * hs) * k).clamp(-1.0, 1.0);
            input[2] = ((-gx * hs + gy * hc) * k).clamp(-1.0, 1.0);
        }
        if c.n_eyes[s] > 0 && thinks(*tick, s, see_every) {
            eye::see(world, s);
        }
    }
}

/// Writes nothing: the inputs are brain activations, and `brain::save` writes those.
pub fn save(_world: &World, _w: &mut Writer) {}

/// Reads nothing.
pub fn load(_world: &mut World, _r: &mut Reader) -> Result<(), LoadError> {
    Ok(())
}
