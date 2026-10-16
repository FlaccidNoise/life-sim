//! Debris: what a dead body leaves, which a filter eats after the plants (rule F1 of the M4 plan).
//! Task 2 of that plan builds the pool and its snapshot. The rule comes in Task 4.

use crate::grid::Grid;
use crate::pool::Slots;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

/// A budget of `docs/architecture.md` §2, the owner's (choice C5), not a tuned number.
pub const MAX_DEBRIS: u32 = 4096;
/// The radius of a piece. A constant of the draw, as `plant::RADIUS_MIN` is.
pub const DEBRIS_RADIUS: f32 = 2.0;

/// Every piece holds a finite energy of 0 or more. `load` keeps that.
pub struct Debris {
    pub slots: Slots,
    pub x: Vec<f32>,
    pub y: Vec<f32>,
    pub energy: Vec<f32>,
    /// Not saved. Rebuilt when `dirty`.
    pub grid: Grid,
    /// Set by whatever adds or removes a piece.
    pub dirty: bool,
}

impl Debris {
    /// An empty pool for a world of `w` by `h`.
    pub fn new(w: f32, h: f32) -> Debris {
        let n = MAX_DEBRIS as usize;
        Debris {
            slots: Slots::new(MAX_DEBRIS),
            x: vec![0.0; n],
            y: vec![0.0; n],
            energy: vec![0.0; n],
            grid: Grid::new(w, h),
            dirty: false,
        }
    }

    /// Rebuilds the grid when `dirty`. Call it before any read of the grid.
    pub fn refresh_grid(&mut self) {
        if self.dirty {
            self.grid.rebuild(&self.slots, &self.x, &self.y);
            self.dirty = false;
        }
    }
}

/// Decay. Nothing yet: rule F1 comes in Task 4.
pub fn step(_world: &mut World) {}

/// The live slots, then x, y, and energy for those slots. The grid is scratch.
pub fn save(world: &World, w: &mut Writer) {
    let d = &world.debris;
    let live: Vec<u32> = (0..d.slots.high_water())
        .filter(|&s| d.slots.is_alive(s))
        .collect();
    w.u32s(&live);
    for a in [&d.x, &d.y, &d.energy] {
        let values: Vec<f32> = live.iter().map(|&s| a[s as usize]).collect();
        w.f32s(&values);
    }
}

/// Reads what `save` wrote into the empty pool that `World::load` made. The slot list must be
/// strictly ascending and below `MAX_DEBRIS`, every field must have one value per listed slot, and
/// every energy must be finite and not below 0. Places are not checked, as a plant's are not.
pub fn load(world: &mut World, r: &mut Reader) -> Result<(), LoadError> {
    let live = r.u32s()?;
    if live.windows(2).any(|p| p[0] >= p[1]) {
        return Err(LoadError::Invalid("debris slots not ascending"));
    }
    if live.last().is_some_and(|&s| s >= MAX_DEBRIS) {
        return Err(LoadError::Invalid("debris slot past capacity"));
    }
    let d = &mut world.debris;
    for &s in &live {
        d.slots.mark_alive(s);
    }
    for a in [&mut d.x, &mut d.y, &mut d.energy] {
        let values = r.f32s()?;
        if values.len() != live.len() {
            return Err(LoadError::Invalid("debris field length"));
        }
        for (&s, v) in live.iter().zip(values) {
            a[s as usize] = v;
        }
    }
    // False for NaN.
    if !live
        .iter()
        .all(|&s| (0.0..f32::INFINITY).contains(&d.energy[s as usize]))
    {
        return Err(LoadError::Invalid("debris energy out of range"));
    }
    d.dirty = true;
    Ok(())
}
