//! Abilities: dash, lunge, and the toxin cloud (rules A1 to A3 of the M4 plan), and the pool of
//! clouds. Task 2 of that plan builds the pool and its snapshot. The rules come in Task 5.

use crate::pool::Slots;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

/// A budget, not a tuned number.
pub const MAX_CLOUDS: u32 = 256;

/// Every live cloud has at least 1 tick to live, a finite radius and drain of 0 or more, and a
/// maker uid that the world has given out. `load` keeps that.
pub struct Clouds {
    pub slots: Slots,
    pub x: Vec<f32>,
    pub y: Vec<f32>,
    pub radius: Vec<f32>,
    /// Ticks left to live.
    pub left: Vec<u32>,
    /// Energy per tick that the cloud takes from each body inside it but its maker.
    pub drain: Vec<f32>,
    /// The uid of the body that released the cloud. It can be dead.
    pub maker: Vec<u32>,
}

impl Default for Clouds {
    fn default() -> Clouds {
        let n = MAX_CLOUDS as usize;
        Clouds {
            slots: Slots::new(MAX_CLOUDS),
            x: vec![0.0; n],
            y: vec![0.0; n],
            radius: vec![0.0; n],
            left: vec![0; n],
            drain: vec![0.0; n],
            maker: vec![0; n],
        }
    }
}

/// Dash, lunge, and toxin, after `control::apply` and before `motor::step`. Nothing yet: the rules
/// come in Task 5.
pub fn step(_world: &mut World) {}

/// The clouds drain the bodies inside them, after `bite::step`. Nothing yet: the rule comes in
/// Task 5.
pub fn clouds(_world: &mut World) {}

/// The live slots, then each field for those slots in the order of the struct.
pub fn save(world: &World, w: &mut Writer) {
    let c = &world.clouds;
    let live: Vec<u32> = (0..c.slots.high_water())
        .filter(|&s| c.slots.is_alive(s))
        .collect();
    let floats = |a: &[f32]| -> Vec<f32> { live.iter().map(|&s| a[s as usize]).collect() };
    let words = |a: &[u32]| -> Vec<u32> { live.iter().map(|&s| a[s as usize]).collect() };
    w.u32s(&live);
    w.f32s(&floats(&c.x));
    w.f32s(&floats(&c.y));
    w.f32s(&floats(&c.radius));
    w.u32s(&words(&c.left));
    w.f32s(&floats(&c.drain));
    w.u32s(&words(&c.maker));
}

/// Puts one value into `a` at each live slot. `Invalid` unless there is one value per live slot.
fn scatter<T>(live: &[u32], values: Vec<T>, a: &mut [T]) -> Result<(), LoadError> {
    if values.len() != live.len() {
        return Err(LoadError::Invalid("cloud field length"));
    }
    for (&s, v) in live.iter().zip(values) {
        a[s as usize] = v;
    }
    Ok(())
}

/// Reads what `save` wrote. The slot list must be strictly ascending and below `MAX_CLOUDS`, every
/// field must have one value per listed slot, and every cloud must hold what the struct says.
pub fn load(world: &mut World, r: &mut Reader) -> Result<(), LoadError> {
    let live = r.u32s()?;
    if live.windows(2).any(|p| p[0] >= p[1]) {
        return Err(LoadError::Invalid("cloud slots not ascending"));
    }
    if live.last().is_some_and(|&s| s >= MAX_CLOUDS) {
        return Err(LoadError::Invalid("cloud slot past capacity"));
    }
    let mut c = Clouds::default();
    for &s in &live {
        c.slots.mark_alive(s);
    }
    scatter(&live, r.f32s()?, &mut c.x)?;
    scatter(&live, r.f32s()?, &mut c.y)?;
    scatter(&live, r.f32s()?, &mut c.radius)?;
    scatter(&live, r.u32s()?, &mut c.left)?;
    scatter(&live, r.f32s()?, &mut c.drain)?;
    scatter(&live, r.u32s()?, &mut c.maker)?;
    // False for NaN.
    let finite = |v: f32| (0.0..f32::INFINITY).contains(&v);
    let sound = |s: usize| {
        c.left[s] > 0 && finite(c.radius[s]) && finite(c.drain[s]) && c.maker[s] < world.next_uid
    };
    if !live.iter().all(|&s| sound(s as usize)) {
        return Err(LoadError::Invalid("cloud out of range"));
    }
    world.clouds = c;
    Ok(())
}
