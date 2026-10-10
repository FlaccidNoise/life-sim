//! The world: every piece of simulation state, the tick, and the state hash.

use crate::creature::Creatures;
use crate::grid::Grid;
use crate::rng::Rng;
use crate::snapshot::{crc32, Writer};

/// Largest sum of two radii. Sets the neighbour search box.
const BODY_REACH: f32 = 16.0;
/// Velocity change per unit of overlap, per unit of distance.
const REPEL: f32 = 0.2;

pub struct World {
    pub tick: u32,
    pub w: f32,
    pub h: f32,
    pub creatures: Creatures,
    /// Starts at 1. 0 means none.
    pub next_uid: u32,
    pub rng_spawn: Rng,
    /// Scratch. Rebuilt every tick, never saved.
    pub grid: Grid,
}

impl World {
    pub fn new(seed: u32, w: f32, h: f32) -> World {
        let root = Rng::new(seed as u64);
        World {
            tick: 0,
            w,
            h,
            creatures: Creatures::default(),
            next_uid: 1,
            rng_spawn: root.fork(1),
            grid: Grid::new(w, h),
        }
    }

    /// Random position, velocity in `[-1, 1]`, radius in `[3, 8]`. Stops when the pool is full.
    pub fn spawn_drifters(&mut self, n: u32) {
        let (c, r) = (&mut self.creatures, &mut self.rng_spawn);
        for _ in 0..n {
            let Some(slot) = c.slots.alloc() else { return };
            let s = slot as usize;
            c.uid[s] = self.next_uid;
            self.next_uid += 1;
            c.x[s] = r.range(0.0, self.w);
            c.y[s] = r.range(0.0, self.h);
            c.vx[s] = r.range(-1.0, 1.0);
            c.vy[s] = r.range(-1.0, 1.0);
            c.radius[s] = r.range(3.0, 8.0);
        }
    }

    pub fn tick(&mut self) {
        let c = &mut self.creatures;
        self.grid.rebuild(&c.slots, &c.x, &c.y);
        for s in 0..c.slots.high_water() as usize {
            if !c.slots.is_alive(s as u32) {
                continue;
            }
            let (px, py, ri) = (c.x[s], c.y[s], c.radius[s]);
            let (mut fx, mut fy) = (0.0f32, 0.0f32);
            self.grid.for_each_in_box(
                px - BODY_REACH,
                py - BODY_REACH,
                px + BODY_REACH,
                py + BODY_REACH,
                |j| {
                    let j = j as usize;
                    let (dx, dy) = (px - c.x[j], py - c.y[j]);
                    let rs = ri + c.radius[j];
                    let d2 = dx * dx + dy * dy;
                    if d2 < rs * rs && d2 > 0.0 {
                        let d = d2.sqrt();
                        let f = (rs - d) / d * REPEL;
                        fx += dx * f;
                        fy += dy * f;
                    }
                },
            );
            c.vx[s] += fx;
            c.vy[s] += fy;
        }
        for s in 0..c.slots.high_water() as usize {
            if !c.slots.is_alive(s as u32) {
                continue;
            }
            let x = c.x[s] + c.vx[s];
            let y = c.y[s] + c.vy[s];
            if !(0.0..=self.w).contains(&x) {
                c.vx[s] = -c.vx[s];
            }
            if !(0.0..=self.h).contains(&y) {
                c.vy[s] = -c.vy[s];
            }
            c.x[s] = x.clamp(0.0, self.w);
            c.y[s] = y.clamp(0.0, self.h);
        }
        self.tick += 1;
    }

    pub fn run(&mut self, ticks: u32) {
        for _ in 0..ticks {
            self.tick();
        }
    }

    /// Every field that affects the future, live slots only. Header, then one part per module.
    pub fn save_payload(&self) -> Vec<u8> {
        let mut w = Writer::new();
        w.u32(self.tick);
        w.f32(self.w);
        w.f32(self.h);
        w.u32(self.next_uid);
        w.u32(self.rng_spawn.0 as u32);
        w.u32((self.rng_spawn.0 >> 32) as u32);
        self.creatures.save(&mut w);
        w.bytes
    }

    pub fn state_hash(&self) -> u32 {
        crc32(&self.save_payload())
    }
}
