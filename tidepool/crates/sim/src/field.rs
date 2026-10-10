//! The scent grid. STUB until Task 12: the grid has its final shape and stays at zero.

use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

pub const SCENT_CELL: f32 = 8.0;

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

    /// STUB: does nothing.
    pub fn deposit(&mut self, _x: f32, _y: f32, _amount: f32) {}

    /// STUB: does nothing.
    pub fn diffuse(&mut self, _rate: f32, _decay: f32) {}

    /// The cell that holds the point. STUB: 0.
    pub fn sample(&self, _x: f32, _y: f32) -> f32 {
        0.0
    }

    /// Central difference, per cell, clamped at edges. STUB: (0, 0).
    pub fn gradient(&self, _x: f32, _y: f32) -> (f32, f32) {
        (0.0, 0.0)
    }
}

/// On even ticks: plants deposit, then one diffusion step. STUB: does nothing.
pub fn step(_world: &mut World) {}

/// STUB: writes nothing. Task 12 saves `a`.
pub fn save(_world: &World, _w: &mut Writer) {}

/// STUB: reads nothing.
pub fn load(_world: &mut World, _r: &mut Reader) -> Result<(), LoadError> {
    Ok(())
}
