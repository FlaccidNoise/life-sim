//! Mating. Two full-grown bodies that touch and both accept take each other's genome as a donor
//! for their next brood. `repro::step` makes that brood and clears the donor.

use crate::genome::Genome;
use crate::motor::NO_TOUCH;
use crate::params::id;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

/// With `mix_rate` at 0 it returns at once: no draw, and no mate value changes.
///
/// Each live slot `s` in ascending order. `j` is the nearest body that `s` touches, as the motor
/// found it on this tick, before any body moved.
///
/// The two mate inputs of `s` are stored: `mate_size` is `area(j) / (area(s) + area(j))` with the
/// areas as the bodies have grown, and `mate_kin` is `1 - 2 * d`, where `d` is the distance
/// between the two hues around the circle, 0 to 0.5. Both are 0 with no body in touch.
///
/// `s` and `j` are a pair if `j > s`, both are full-grown, both hold no donor, both have
/// `cmd_accept` above 0, and neither is in a pair of this tick already. A pair makes one draw from
/// `rng_mate`. With chance `mix_rate` each of the two takes the uid of the other and a copy of its
/// genome as its donor. A pair that the chance turns down is still the pair of the tick for both.
pub fn step(world: &mut World) {
    let rate = world.params.get(id::MIX_RATE);
    if rate <= 0.0 {
        return;
    }
    let World {
        creatures: c,
        genomes,
        donors,
        motor,
        rng_mate,
        ..
    } = world;
    let live = c.slots.high_water() as usize;
    let mut paired = vec![false; live];
    for s in 0..live {
        if !c.slots.is_alive(s as u32) {
            continue;
        }
        if motor.touch[s] == NO_TOUCH {
            (c.mate_size[s], c.mate_kin[s]) = (0.0, 0.0);
            continue;
        }
        let j = motor.touch[s] as usize;
        let (own, other) = (c.area(s), c.area(j));
        let apart = (c.hue[s] - c.hue[j]).abs();
        c.mate_size[s] = other / (own + other);
        c.mate_kin[s] = 1.0 - 2.0 * apart.min(1.0 - apart);

        let free = |k: usize| {
            c.growth[k] >= 1.0 && donors[k].is_none() && c.cmd_accept[k] > 0.0 && !paired[k]
        };
        if j > s && free(s) && free(j) {
            (paired[s], paired[j]) = (true, true);
            if rng_mate.unit() < rate {
                donors[s] = Some((c.uid[j], genomes[j].clone()));
                donors[j] = Some((c.uid[s], genomes[s].clone()));
            }
        }
    }
}

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
