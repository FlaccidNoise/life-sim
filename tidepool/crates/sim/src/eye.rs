//! Eyes. A body sees plants and bodies inside the cones of its eye parts.
//!
//! `Creatures::express` makes the cones from the genome, and `frame::write` sends those of the
//! possessed body to the page. Nothing scans them yet.

use crate::world::World;

/// No cone is longer than this, in world units. It bounds the scan.
pub const EYE_REACH: f32 = 64.0;
/// The half angle of a cone in radians is `EYE_HALF_MIN + EYE_HALF_SPAN * extra`.
pub const EYE_HALF_MIN: f32 = 0.2;
pub const EYE_HALF_SPAN: f32 = 1.0;

/// Writes nothing yet.
pub fn see(_world: &mut World, _slot: usize) {}
