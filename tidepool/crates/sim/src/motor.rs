//! Motion: commands to velocity, the push between overlapping bodies, and the world edge.
//!
//! STUB until Task 11. A creature turns and swims at a fixed rate with no inertia and no drag, so
//! that steering can be seen. The push and the world edge are the final rules.

use crate::creature::{MAX_CREATURES, MAX_RADIUS};
use crate::math::{sin_cos, wrap_angle};
use crate::params::id;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

/// Two bodies farther apart than this cannot touch.
const BODY_REACH: f32 = 2.0 * MAX_RADIUS;
/// Stub only. Task 11 deletes both: radians per tick at full turn, and units per tick at full thrust.
const STUB_TURN_RATE: f32 = 0.1;
const STUB_SPEED: f32 = 1.5;

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
    for s in 0..c.slots.high_water() as usize {
        if !c.slots.is_alive(s as u32) {
            continue;
        }
        c.heading[s] = wrap_angle(c.heading[s] + c.cmd_turn[s] * STUB_TURN_RATE);
        (c.hs[s], c.hc[s]) = sin_cos(c.heading[s]);
        let speed = c.cmd_thrust[s] * STUB_SPEED;
        c.vx[s] = c.hc[s] * speed + motor.push_x[s];
        c.vy[s] = c.hs[s] * speed + motor.push_y[s];
        // At a world edge the position is clamped and the velocity that points out is lost.
        let (x, y) = (c.x[s] + c.vx[s], c.y[s] + c.vy[s]);
        if !(0.0..=*w).contains(&x) {
            c.vx[s] = 0.0;
        }
        if !(0.0..=*h).contains(&y) {
            c.vy[s] = 0.0;
        }
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
