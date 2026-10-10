//! The frame that the page draws: a header, then one record for each creature in view. Words are
//! `u32`. Floats are stored by bit pattern. `src/protocol.ts` mirrors this layout.

use crate::world::World;

pub const HEADER_WORDS: u32 = 8;
pub const CREATURE_STRIDE: u32 = 10;
pub const PLANT_STRIDE: u32 = 4;
pub const NO_SLOT: u32 = 0xFFFF_FFFF;
/// A creature this far outside the view is still in the frame, so a body on the edge is drawn whole.
const MARGIN: f32 = 32.0;
/// Golden-ratio step. Gives neighbouring uids well-separated hues.
const HUE_STEP: f32 = 0.618_034;

/// Writes `world.frame` for the view `[x0, x1] x [y0, y1]` grown by `MARGIN`. Returns the words
/// written. Records are in grid order.
pub fn write(world: &mut World, x0: f32, y0: f32, x1: f32, y1: f32) -> u32 {
    let World {
        tick,
        creatures: c,
        grid,
        frame,
        ..
    } = world;
    let (x0, y0, x1, y1) = (x0 - MARGIN, y0 - MARGIN, x1 + MARGIN, y1 + MARGIN);
    // The grid is from the start of the last tick. Creatures have moved since.
    grid.rebuild(&c.slots, &c.x, &c.y);
    frame.clear();
    frame.extend_from_slice(&[*tick, 0, 0, c.slots.count(), 0, NO_SLOT, 0, 0]);
    let mut records = 0;
    grid.for_each_in_box(x0, y0, x1, y1, |slot| {
        let s = slot as usize;
        let (x, y) = (c.x[s], c.y[s]);
        if x < x0 || x > x1 || y < y0 || y > y1 {
            return;
        }
        let size = 2.0 * c.radius[s];
        let hue = (c.uid[s] as f32 * HUE_STEP) % 1.0;
        let floats = [x, y, 0.0, size, size, hue, 1.0];
        frame.extend(floats.map(f32::to_bits));
        frame.extend_from_slice(&[c.uid[s], slot, 0]);
        records += 1;
    });
    frame[1] = records;
    frame.len() as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_holds_the_creatures_inside_the_view_plus_margin_and_no_others() {
        let mut w = World::new(5, 1536.0, 1024.0);
        w.spawn_drifters(1000);
        w.run(3);
        let (x0, y0, x1, y1) = (400.0f32, 300.0f32, 600.0f32, 500.0f32);
        let words = write(&mut w, x0, y0, x1, y1);
        let want: Vec<u32> = (0..1000u32)
            .filter(|&s| {
                let (x, y) = (w.creatures.x[s as usize], w.creatures.y[s as usize]);
                x >= x0 - MARGIN && x <= x1 + MARGIN && y >= y0 - MARGIN && y <= y1 + MARGIN
            })
            .collect();
        let records = &w.frame[HEADER_WORDS as usize..];
        // Word 8 of a record is the slot.
        let mut got: Vec<u32> = records
            .iter()
            .skip(8)
            .step_by(CREATURE_STRIDE as usize)
            .copied()
            .collect();
        got.sort_unstable();
        assert!(!want.is_empty() && want.len() < 1000);
        assert_eq!(got, want);
        assert_eq!(words, HEADER_WORDS + got.len() as u32 * CREATURE_STRIDE);
        assert_eq!(w.frame[..4], [3, got.len() as u32, 0, 1000]);
        let s = records[8] as usize;
        assert_eq!(records[0], w.creatures.x[s].to_bits());
        assert_eq!(records[3], (2.0 * w.creatures.radius[s]).to_bits());
        assert_eq!(records[7], w.creatures.uid[s]);
    }

    #[test]
    fn writing_a_frame_changes_neither_the_hash_nor_the_future() {
        let start = || {
            let mut w = World::new(5, 1536.0, 1024.0);
            w.spawn_drifters(200);
            w.run(3);
            w
        };
        let (mut a, mut b) = (start(), start());
        write(&mut a, 0.0, 0.0, 1536.0, 1024.0);
        a.save_buf = a.save();
        assert_eq!(a.state_hash(), b.state_hash());
        a.run(50);
        b.run(50);
        assert_eq!(a.state_hash(), b.state_hash());
    }
}
