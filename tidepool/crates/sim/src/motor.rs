//! Motion: commands to velocity and spin, the push between overlapping bodies, and the world edge.
//!
//! Thrust and turning both come from the parts a body carries. A flagellum steers only while it
//! pushes. Cilia turn a body at rest. Drag is stronger across the heading than along it, so turn
//! radius grows with speed.

use crate::creature::{MAX_CREATURES, MAX_RADIUS};
use crate::math::{sin_cos, wrap_angle};
use crate::params::id;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

/// Two bodies farther apart than this cannot touch.
const BODY_REACH: f32 = 2.0 * MAX_RADIUS;

/// Scratch. The push on each slot from the bodies that overlap it. Never saved.
pub struct Motor {
    pub push_x: Vec<f32>,
    pub push_y: Vec<f32>,
}

impl Default for Motor {
    fn default() -> Motor {
        let n = MAX_CREATURES as usize;
        Motor {
            push_x: vec![0.0; n],
            push_y: vec![0.0; n],
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
    let repel = params.get(id::REPEL);
    for s in 0..c.slots.high_water() as usize {
        if !c.slots.is_alive(s as u32) {
            continue;
        }
        let (px, py, ri) = (c.x[s], c.y[s], c.radius(s));
        let (mut fx, mut fy) = (0.0f32, 0.0f32);
        grid.for_each_in_box(
            px - BODY_REACH,
            py - BODY_REACH,
            px + BODY_REACH,
            py + BODY_REACH,
            |j| {
                let j = j as usize;
                let (dx, dy) = (px - c.x[j], py - c.y[j]);
                let rs = ri + c.radius(j);
                let d2 = dx * dx + dy * dy;
                if d2 < rs * rs && d2 > 0.0 {
                    let d = d2.sqrt();
                    let f = (rs - d) / d * repel;
                    fx += dx * f;
                    fy += dy * f;
                }
            },
        );
        (motor.push_x[s], motor.push_y[s]) = (fx, fy);
    }
    let (flag_force, cilia_force) = (params.get(id::FLAG_FORCE), params.get(id::CILIA_FORCE));
    let (flag_torque, cilia_torque) = (params.get(id::FLAG_TORQUE), params.get(id::CILIA_TORQUE));
    let (inertia_k, v_max) = (params.get(id::INERTIA_K), params.get(id::V_MAX));
    let keep_fwd = 1.0 - params.get(id::DRAG_FWD);
    let keep_side = 1.0 - params.get(id::DRAG_SIDE);
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
        // The force is `drive * length` and the mass is `length * width`.
        let drive = flag_force * c.flag_push[s] + cilia_force * c.cilia[s];
        let accel = thrust * drive / width;
        let steer = cilia_torque * c.cilia[s] + flag_torque * c.flag_push[s] * thrust;
        let a_ang = turn * steer / (2.0 * inertia_k * width * length);

        let mut vx = c.vx[s] + hc * accel + motor.push_x[s];
        let mut vy = c.vy[s] + hs * accel + motor.push_y[s];
        // Drag acts on the velocity along the heading and across it at different rates.
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
