//! Motion: commands to velocity and spin, the push between overlapping bodies, and the world edge.
//!
//! Thrust and turning both come from the parts a body carries. A flagellum at the tail steers only
//! while it pushes, and one on the side turns a body at rest. So do cilia. A fin turns a body only
//! at speed. Drag is stronger across the heading than along it, so turn radius grows with speed.

use crate::creature::{heft, MAX_CREATURES, MAX_RADIUS};
use crate::genome::REF_WIDTH;
use crate::math::{sin_cos, wrap_angle};
use crate::params::id;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

/// Two bodies farther apart than this cannot touch.
const BODY_REACH: f32 = 2.0 * MAX_RADIUS;
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
}

impl Default for Motor {
    fn default() -> Motor {
        let n = MAX_CREATURES as usize;
        Motor {
            push_x: vec![0.0; n],
            push_y: vec![0.0; n],
            radius: vec![0.0; n],
            mass: vec![0.0; n],
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
    } = motor;
    let (repel, push_mass) = (params.get(id::REPEL), params.get(id::PUSH_MASS));
    let (part_mass, eye_cost) = (params.get(id::PART_MASS), params.get(id::EYE_COST));
    for s in 0..c.slots.high_water() as usize {
        if c.slots.is_alive(s as u32) {
            (radius[s], mass[s]) = (c.radius(s), c.mass(s, part_mass, eye_cost));
        }
    }
    for s in 0..c.slots.high_water() as usize {
        if !c.slots.is_alive(s as u32) {
            continue;
        }
        let (px, py, ri, mi) = (c.x[s], c.y[s], radius[s], mass[s]);
        let (mut fx, mut fy) = (0.0f32, 0.0f32);
        grid.for_each_in_box(
            px - BODY_REACH,
            py - BODY_REACH,
            px + BODY_REACH,
            py + BODY_REACH,
            |j| {
                let j = j as usize;
                let (dx, dy) = (px - c.x[j], py - c.y[j]);
                let rs = ri + radius[j];
                let d2 = dx * dx + dy * dy;
                if d2 < rs * rs && d2 > 0.0 {
                    let d = d2.sqrt();
                    // The lighter body of a pair takes more of the push. Two equal bodies each
                    // take the same push as at `push_mass` 0.
                    let share = 1.0 + push_mass * (2.0 * mass[j] / (mi + mass[j]) - 1.0);
                    let f = (rs - d) / d * repel * share;
                    fx += dx * f;
                    fy += dy * f;
                }
            },
        );
        (push_x[s], push_y[s]) = (fx, fy);
    }
    let (flag_force, cilia_force) = (params.get(id::FLAG_FORCE), params.get(id::CILIA_FORCE));
    let (flag_torque, cilia_torque) = (params.get(id::FLAG_TORQUE), params.get(id::CILIA_TORQUE));
    let (fin_torque, fin_grip) = (params.get(id::FIN_TORQUE), params.get(id::FIN_GRIP));
    let (inertia_k, v_max) = (params.get(id::INERTIA_K), params.get(id::V_MAX));
    let curve = params.get(id::MOTOR_CURVE);
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
        let heft = heft(c.part_sum(s, eye_cost), part_mass);
        // The force is `drive * length` and the mass is `length * width`. At `motor_curve` 1 the
        // force grows with the area, so the width of the reference body stands in for the width
        // and top speed does not depend on size. The weight of the parts then slows a body.
        let drive = flag_force * c.flag_push[s] + cilia_force * c.cilia[s];
        let accel = thrust * drive / (width * (1.0 - curve) + REF_WIDTH * heft * curve);

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

        // A fin steers with the water that passes it, so it does nothing at rest or in reverse.
        let steer = cilia_torque * c.cilia[s]
            + flag_torque * c.flag_push[s] * thrust
            + flag_torque * c.flag_side[s]
            + fin_torque * c.fin[s] * fwd.max(0.0) / v_max;
        let a_ang = turn * steer
            / (2.0 * inertia_k * width * length * (1.0 - curve)
                + 2.0 * inertia_k * REF_WIDTH * length * heft * curve);
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
