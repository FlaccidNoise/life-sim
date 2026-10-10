//! The scent grid. Plants deposit into it, and it diffuses and decays.

use crate::params::id;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

pub const SCENT_CELL: f32 = 8.0;
/// The field steps on one tick in this many.
const STEP_EVERY: u32 = 2;

pub struct Field {
    pub gw: usize,
    pub gh: usize,
    /// Saved.
    pub a: Vec<f32>,
    /// Scratch for `diffuse`.
    pub b: Vec<f32>,
}

impl Field {
    /// A grid of zeros for a world of `w` by `h`.
    pub fn new(w: f32, h: f32) -> Field {
        let gw = (w / SCENT_CELL).ceil() as usize;
        let gh = (h / SCENT_CELL).ceil() as usize;
        Field {
            gw,
            gh,
            a: vec![0.0; gw * gh],
            b: vec![0.0; gw * gh],
        }
    }

    /// The column and row of the cell that holds the point. A point outside the world, or at NaN,
    /// is in the nearest edge cell.
    fn cell(&self, x: f32, y: f32) -> (usize, usize) {
        let cx = ((x / SCENT_CELL) as usize).min(self.gw - 1);
        let cy = ((y / SCENT_CELL) as usize).min(self.gh - 1);
        (cx, cy)
    }

    pub fn deposit(&mut self, x: f32, y: f32, amount: f32) {
        let (cx, cy) = self.cell(x, y);
        self.a[cy * self.gw + cx] += amount;
    }

    /// One 5-point diffusion step, then decay. A cell on an edge reads itself in place of the
    /// neighbour it lacks, so `decay` of 1 keeps the total.
    pub fn diffuse(&mut self, rate: f32, decay: f32) {
        let (gw, gh) = (self.gw, self.gh);
        let stencil = |c: f32, around: f32| (c + rate * (around - 4.0 * c)) * decay;
        let last = gw - 1;
        for y in 0..gh {
            let (up, dn) = (y.saturating_sub(1) * gw, (y + 1).min(gh - 1) * gw);
            // Rows of one length, so the loop below has no bounds checks and vectorizes.
            let row = &self.a[y * gw..][..gw];
            let up = &self.a[up..][..gw];
            let dn = &self.a[dn..][..gw];
            let out = &mut self.b[y * gw..][..gw];
            out[0] = stencil(row[0], row[0] + row[last.min(1)] + up[0] + dn[0]);
            for x in 1..last {
                out[x] = stencil(row[x], row[x - 1] + row[x + 1] + up[x] + dn[x]);
            }
            out[last] = stencil(
                row[last],
                row[last.saturating_sub(1)] + row[last] + up[last] + dn[last],
            );
        }
        std::mem::swap(&mut self.a, &mut self.b);
    }

    /// The cell that holds the point.
    pub fn sample(&self, x: f32, y: f32) -> f32 {
        let (cx, cy) = self.cell(x, y);
        self.a[cy * self.gw + cx]
    }

    /// Central difference, per cell, clamped at edges.
    pub fn gradient(&self, x: f32, y: f32) -> (f32, f32) {
        let (cx, cy) = self.cell(x, y);
        let at = |cx: usize, cy: usize| self.a[cy * self.gw + cx];
        let east = at((cx + 1).min(self.gw - 1), cy);
        let south = at(cx, (cy + 1).min(self.gh - 1));
        (
            (east - at(cx.saturating_sub(1), cy)) * 0.5,
            (south - at(cx, cy.saturating_sub(1))) * 0.5,
        )
    }
}

/// On even ticks: each plant deposits `scent_deposit * reserve / plant_cap`, then one diffusion
/// step.
pub fn step(world: &mut World) {
    if !world.tick.is_multiple_of(STEP_EVERY) {
        return;
    }
    let World {
        params,
        plants,
        scent,
        ..
    } = world;
    let (deposit, plant_cap) = (params.get(id::SCENT_DEPOSIT), params.get(id::PLANT_CAP));
    for s in 0..plants.slots.high_water() as usize {
        if plants.slots.is_alive(s as u32) {
            scent.deposit(
                plants.x[s],
                plants.y[s],
                deposit * plants.reserve[s] / plant_cap,
            );
        }
    }
    scent.diffuse(params.get(id::SCENT_DIFFUSE), params.get(id::SCENT_DECAY));
}

/// `a`. `b` is scratch.
pub fn save(world: &World, w: &mut Writer) {
    w.f32s(&world.scent.a);
}

/// Reads `a` into the field that `World::load` made. It must have one value per cell. The values
/// are not checked.
pub fn load(world: &mut World, r: &mut Reader) -> Result<(), LoadError> {
    let a = r.f32s()?;
    if a.len() != world.scent.a.len() {
        return Err(LoadError::Invalid("scent field size"));
    }
    world.scent.a = a;
    Ok(())
}
