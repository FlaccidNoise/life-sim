//! Budding. STUB until Task 14: nothing buds.

use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

/// STUB: does nothing.
pub fn step(_world: &mut World) {}

/// STUB: writes nothing.
pub fn save(_world: &World, _w: &mut Writer) {}

/// STUB: reads nothing.
pub fn load(_world: &mut World, _r: &mut Reader) -> Result<(), LoadError> {
    Ok(())
}
