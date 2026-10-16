//! The bite of a jaw (rule J1 of the M4 plan). Task 2 of that plan puts it in the tick. The rule
//! comes in Task 3.

use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

/// After `mate::step`. Nothing yet: rule J1 comes in Task 3.
pub fn step(_world: &mut World) {}

/// Writes nothing: the bite target is motor scratch, and the hurt is a creature field.
pub fn save(_world: &World, _w: &mut Writer) {}

/// Reads nothing.
pub fn load(_world: &mut World, _r: &mut Reader) -> Result<(), LoadError> {
    Ok(())
}
