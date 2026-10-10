//! Rooted plants and the fertility map they grow on.
//!
//! STUB until Task 12. The pool, the map, and the plant grid have their final shape. Nothing is
//! generated, seeded, grown, or saved yet.

use crate::grid::{Grid, CELL};
use crate::pool::Slots;
use crate::rng::Rng;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

pub const MAX_PLANTS: u32 = 8192;
/// The radius of a plant with no reserve, and what a reserve of `plant_cap` adds to it.
const RADIUS_MIN: f32 = 2.0;
const RADIUS_SPAN: f32 = 6.0;

pub struct Plants {
    pub slots: Slots,
    pub x: Vec<f32>,
    pub y: Vec<f32>,
    pub reserve: Vec<f32>,
    pub cap: Vec<f32>,
    /// Not saved. Rebuilt when `dirty`.
    pub grid: Grid,
    /// Set by whatever adds, removes, or moves a plant.
    pub dirty: bool,
}

impl Plants {
    /// An empty pool for a world of `w` by `h`.
    pub fn new(w: f32, h: f32) -> Plants {
        let n = MAX_PLANTS as usize;
        Plants {
            slots: Slots::new(MAX_PLANTS),
            x: vec![0.0; n],
            y: vec![0.0; n],
            reserve: vec![0.0; n],
            cap: vec![0.0; n],
            grid: Grid::new(w, h),
            dirty: false,
        }
    }

    /// Rebuilds the plant grid when `dirty`. Call it before any read of the grid.
    pub fn refresh_grid(&mut self) {
        if self.dirty {
            self.grid.rebuild(&self.slots, &self.x, &self.y);
            self.dirty = false;
        }
    }
}

/// Cells of `grid::CELL` (32) units, values in `[0, 1]`. Saved.
pub struct Fertility {
    pub gw: usize,
    pub gh: usize,
    pub v: Vec<f32>,
}

impl Fertility {
    /// A map of zeros for a world of `w` by `h`. It has the cells of `Grid::new(w, h)`.
    pub fn new(w: f32, h: f32) -> Fertility {
        let gw = (w / CELL).ceil() as usize;
        let gh = (h / CELL).ceil() as usize;
        Fertility {
            gw,
            gh,
            v: vec![0.0; gw * gh],
        }
    }

    /// STUB: a map of zeros, and no draw from `rng`. `World::seed_founders` already calls it with
    /// `rng_plants` and the `fert_blobs` and `fert_radius` parameters.
    pub fn generate(_rng: &mut Rng, w: f32, h: f32, _blobs: u32, _radius: f32) -> Fertility {
        Fertility::new(w, h)
    }

    /// The value of the cell that holds the point. A point outside the world reads the nearest
    /// edge cell.
    pub fn at(&self, x: f32, y: f32) -> f32 {
        let cx = ((x / CELL) as usize).min(self.gw - 1);
        let cy = ((y / CELL) as usize).min(self.gh - 1);
        self.v[cy * self.gw + cx]
    }
}

/// `2 + 6 * sqrt(reserve / plant_cap)`.
pub fn radius(reserve: f32, plant_cap: f32) -> f32 {
    RADIUS_MIN + RADIUS_SPAN * (reserve / plant_cap).sqrt()
}

/// Founder plants. Called by `World::seed_founders` after the fertility map is made and the
/// creatures are placed. STUB: places nothing.
pub fn seed(_world: &mut World, _n: u32) {}

/// STUB: does nothing.
pub fn step(_world: &mut World) {}

/// STUB: writes nothing. Task 12 saves the pool and the fertility map.
pub fn save(_world: &World, _w: &mut Writer) {}

/// STUB: reads nothing. Task 12 sets `plants.dirty` here, since the grid is not saved.
pub fn load(_world: &mut World, _r: &mut Reader) -> Result<(), LoadError> {
    Ok(())
}
