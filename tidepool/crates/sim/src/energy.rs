//! Eating, upkeep, growth, and death. STUB until Task 13: a creature only ages.

use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

/// STUB: nothing eats.
pub fn contact(_world: &mut World) {}

/// STUB: `age += 1` and nothing else. The count stops at the top of its range: a snapshot can hold
/// any age, and a debug build panics on overflow.
pub fn life(world: &mut World) {
    let c = &mut world.creatures;
    for s in 0..c.slots.high_water() as usize {
        if c.slots.is_alive(s as u32) {
            c.age[s] = c.age[s].saturating_add(1);
        }
    }
}

/// STUB: writes nothing.
pub fn save(_world: &World, _w: &mut Writer) {}

/// STUB: reads nothing.
pub fn load(_world: &mut World, _r: &mut Reader) -> Result<(), LoadError> {
    Ok(())
}
