//! Brain inputs: the creature's own state, and the scent at its centre.

use crate::brain::{
    thinks, IN_AGE, IN_CONST, IN_ENERGY, IN_GRAD_FWD, IN_GRAD_SIDE, IN_SCENT, IN_SPEED,
};
use crate::params::id;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

/// Added to the local scent level before the gradient is divided by it, so that a place with no
/// scent gives a gradient of 0 and not a division by zero.
const SCENT_FLOOR: f32 = 1e-6;

/// Each live creature whose turn it is to think gets its 7 inputs.
///
/// The gradient is divided by the local scent level, so a creature far from food still gets a
/// direction. `IN_GRAD_SIDE` is positive when scent rises on the creature's `+heading` side.
pub fn step(world: &mut World) {
    let World {
        creatures: c,
        brains,
        params,
        scent,
        tick,
        ..
    } = world;
    let every = params.get(id::THINK_EVERY) as u32;
    let (v_max, gain) = (params.get(id::V_MAX), params.get(id::CHEMO_GAIN));
    let per_mass = params.get(id::ENERGY_PER_MASS);
    for s in 0..c.slots.high_water() as usize {
        if !c.slots.is_alive(s as u32) || !thinks(*tick, s, every) {
            continue;
        }
        let (hc, hs, chemo) = (c.hc[s], c.hs[s], c.chemo[s]);
        let s0 = scent.sample(c.x[s], c.y[s]);
        let (gx, gy) = scent.gradient(c.x[s], c.y[s]);
        let k = gain * chemo / (s0 + SCENT_FLOOR);
        let level = s0 * chemo;
        let energy01 = c.energy01(s, per_mass);
        let speed = (c.vx[s] * c.vx[s] + c.vy[s] * c.vy[s]).sqrt();
        let input = brains.inputs_mut(s);
        input[IN_CONST] = 1.0;
        input[IN_ENERGY] = energy01;
        input[IN_AGE] = c.age[s] as f32 / c.old[s];
        input[IN_SPEED] = speed / v_max;
        input[IN_SCENT] = level / (1.0 + level);
        input[IN_GRAD_FWD] = ((gx * hc + gy * hs) * k).clamp(-1.0, 1.0);
        input[IN_GRAD_SIDE] = ((-gx * hs + gy * hc) * k).clamp(-1.0, 1.0);
    }
}

/// Writes nothing: the inputs are brain activations, and `brain::save` writes those.
pub fn save(_world: &World, _w: &mut Writer) {}

/// Reads nothing.
pub fn load(_world: &mut World, _r: &mut Reader) -> Result<(), LoadError> {
    Ok(())
}
