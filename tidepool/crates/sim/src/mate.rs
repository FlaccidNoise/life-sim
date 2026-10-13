//! Mating. Two full-grown bodies that touch and both accept take each other's genome as a donor
//! for their next brood.
//!
//! A stub: no pair is made yet. A donor is world state already, and it is saved here.

use crate::genome::Genome;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

/// Returns at once.
pub fn step(_world: &mut World) {}

/// The live slots in ascending order.
fn live(world: &World) -> impl Iterator<Item = usize> + '_ {
    let slots = &world.creatures.slots;
    (0..slots.high_water())
        .filter(|&s| slots.is_alive(s))
        .map(|s| s as usize)
}

/// For each live slot in slot order: the uid of its donor, or 0 for none, and then the genome of
/// the donor.
pub fn save(world: &World, w: &mut Writer) {
    for s in live(world) {
        match &world.donors[s] {
            Some((uid, genome)) => {
                w.u32(*uid);
                genome.save(w);
            }
            None => w.u32(0),
        }
    }
}

/// Reads what `save` wrote. The uid of a donor must be one that the world has given out. The donor
/// can be dead. Its genome is held to the rules of `Genome::load`.
pub fn load(world: &mut World, r: &mut Reader) -> Result<(), LoadError> {
    let slots: Vec<usize> = live(world).collect();
    for s in slots {
        let uid = r.u32()?;
        if uid >= world.next_uid {
            return Err(LoadError::Invalid("donor uid not below next uid"));
        }
        world.donors[s] = match uid {
            0 => None,
            uid => Some((uid, Genome::load(r)?)),
        };
    }
    Ok(())
}
