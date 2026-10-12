//! Motion: commands to velocity and spin, the push between overlapping bodies, and the world edge.
//!
//! Thrust and turning both come from the parts a body carries. A flagellum at the tail steers only
//! while it pushes, and one on the side turns a body at rest. So do cilia. A fin turns a body only
//! at speed. Drag is stronger across the heading than along it, so turn radius grows with speed.

use crate::creature::{self, MAX_CREATURES, MAX_RADIUS};
use crate::genome::REF_WIDTH;
use crate::math::{sin_cos, wrap_angle};
use crate::params::id;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

/// The most velocity across the heading that a tick can take, whatever the fins.
const SIDE_DRAG_MAX: f32 = 0.95;

/// Scratch. Never saved.
pub struct Motor {
    /// The push on each slot from the bodies that overlap it.
    pub push_x: Vec<f32>,
    pub push_y: Vec<f32>,
    /// Of each live slot, filled once per tick, so that the neighbour loop reads one value per
    /// body.
    pub radius: Vec<f32>,
    pub mass: Vec<f32>,
    /// `creature::heft` of each live slot, so that a tick works it out once per body.
    pub heft: Vec<f32>,
}

impl Default for Motor {
    fn default() -> Motor {
        let n = MAX_CREATURES as usize;
        Motor {
            push_x: vec![0.0; n],
            push_y: vec![0.0; n],
            radius: vec![0.0; n],
            mass: vec![0.0; n],
            heft: vec![0.0; n],
        }
    }
}

/// The push on every slot is worked out before any creature moves, so the result does not depend
/// on slot order.
pub fn step(world: &mut World) {
    let World {
        creatures: c,
        grid,
        params,
        motor,
        w,
        h,
        ..
    } = world;
    let Motor {
        push_x,
        push_y,
        radius,
        mass,
        heft,
    } = motor;
    let repel = params.get(id::REPEL);
    let (part_mass, eye_cost) = (params.get(id::PART_MASS), params.get(id::EYE_COST));
    for s in 0..c.slots.high_water() as usize {
        if c.slots.is_alive(s as u32) {
            // The mass is that of `Creatures::mass`, written out: the WASM build does not inline
            // that call, and the call made a tick 2% slower.
            heft[s] = creature::heft(c.part_sum(s, eye_cost), part_mass);
            (radius[s], mass[s]) = (c.radius(s), c.area(s) * heft[s]);
        }
    }
    for s in 0..c.slots.high_water() as usize {
        if !c.slots.is_alive(s as u32) {
            continue;
        }
        let (px, py, ri, mi) = (c.x[s], c.y[s], radius[s], mass[s]);
        let (mut fx, mut fy) = (0.0f32, 0.0f32);
        // A body farther away than this cannot touch this one.
        let reach = ri + MAX_RADIUS;
        grid.for_each_in_box(px - reach, py - reach, px + reach, py + reach, |j| {
            let j = j as usize;
            let (dx, dy) = (px - c.x[j], py - c.y[j]);
            let rs = ri + radius[j];
            let d2 = dx * dx + dy * dy;
            if d2 < rs * rs && d2 > 0.0 {
                let d = d2.sqrt();
                // The lighter body of a pair takes more of the push, and two equal bodies each
                // take a share of 1. The share is `2 * mass[j] / (mi + mass[j])`, written so
                // that it rounds as the pinned rows of the gates do.
                let share = 1.0 + (2.0 * mass[j] / (mi + mass[j]) - 1.0);
                let f = (rs - d) / d * repel * share;
                fx += dx * f;
                fy += dy * f;
            }
        });
        (push_x[s], push_y[s]) = (fx, fy);
    }
    let (flag_force, cilia_force) = (params.get(id::FLAG_FORCE), params.get(id::CILIA_FORCE));
    let (flag_torque, cilia_torque) = (params.get(id::FLAG_TORQUE), params.get(id::CILIA_TORQUE));
    let (fin_torque, fin_grip) = (params.get(id::FIN_TORQUE), params.get(id::FIN_GRIP));
    let (inertia_k, v_max) = (params.get(id::INERTIA_K), params.get(id::V_MAX));
    // The part of the turn rule that is the same for every body, worked out once per tick.
    let ref_inertia = 2.0 * inertia_k * REF_WIDTH;
    let fin_turn = fin_torque / v_max;
    let keep_fwd = 1.0 - params.get(id::DRAG_FWD);
    let drag_side = params.get(id::DRAG_SIDE);
    let keep_ang = 1.0 - params.get(id::DRAG_ANG);
    for s in 0..c.slots.high_water() as usize {
        if !c.slots.is_alive(s as u32) {
            continue;
        }
        let (width, length) = (c.width(s), c.length(s));
        // Only a snapshot can hold a body with no size. It has no mass to push, so it stays put.
        if !(width > 0.0 && length > 0.0) {
            continue;
        }
        let (thrust, turn) = (c.cmd_thrust[s], c.cmd_turn[s]);
        let (hc, hs) = (c.hc[s], c.hs[s]);
        // The force grows with the area and the mass is the area times the heft, so the width of
        // the reference body stands in for the width and top speed does not depend on size. The
        // weight of the parts slows a body.
        let drive = flag_force * c.flag_push[s] + cilia_force * c.cilia[s];
        let accel = thrust * drive / (REF_WIDTH * heft[s]);
        // A fin steers with the water that passes it, so it does nothing at rest or in reverse.
        // It reads the speed that the body had before this tick: a turn that waits for the new
        // velocity made a tick 5% slower in WASM.
        let swim = c.vx[s] * hc + c.vy[s] * hs;
        let steer = cilia_torque * c.cilia[s]
            + flag_torque * c.flag_push[s] * thrust
            + flag_torque * c.flag_side[s]
            + fin_turn * c.fin[s] * swim.max(0.0);
        let a_ang = turn * steer / (ref_inertia * length * heft[s]);

        let mut vx = c.vx[s] + hc * accel + push_x[s];
        let mut vy = c.vy[s] + hs * accel + push_y[s];
        // Drag acts on the velocity along the heading and across it at different rates. A fin
        // grips the water: it adds to the drag across the heading.
        let keep_side = 1.0 - (drag_side + fin_grip * c.fin[s]).min(SIDE_DRAG_MAX);
        let fwd = (vx * hc + vy * hs) * keep_fwd;
        let side = (-vx * hs + vy * hc) * keep_side;
        vx = fwd * hc - side * hs;
        vy = fwd * hs + side * hc;
        let v2 = vx * vx + vy * vy;
        if v2 > v_max * v_max {
            let k = v_max / v2.sqrt();
            vx *= k;
            vy *= k;
        }

        c.omega[s] = (c.omega[s] + a_ang) * keep_ang;
        c.heading[s] = wrap_angle(c.heading[s] + c.omega[s]);
        (c.hs[s], c.hc[s]) = sin_cos(c.heading[s]);
        // At a world edge the position is clamped and the velocity that points out is lost.
        let (x, y) = (c.x[s] + vx, c.y[s] + vy);
        c.vx[s] = if (0.0..=*w).contains(&x) { vx } else { 0.0 };
        c.vy[s] = if (0.0..=*h).contains(&y) { vy } else { 0.0 };
        c.x[s] = x.clamp(0.0, *w);
        c.y[s] = y.clamp(0.0, *h);
    }
}

/// Writes nothing: the motor's own state is scratch.
pub fn save(_world: &World, _w: &mut Writer) {}

/// Reads nothing.
pub fn load(_world: &mut World, _r: &mut Reader) -> Result<(), LoadError> {
    Ok(())
}
