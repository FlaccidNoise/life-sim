//! The frame that the page draws: a header, then one record for each creature in view, then one
//! for each plant in view. Words are `u32`. Floats are stored by bit pattern. `src/protocol.ts`
//! mirrors this layout.

use crate::creature::MARK_LINEAGE;
use crate::params::id;
use crate::plant;
use crate::world::World;

pub const HEADER_WORDS: u32 = 8;
pub const CREATURE_STRIDE: u32 = 10;
pub const PLANT_STRIDE: u32 = 4;
pub const NO_SLOT: u32 = 0xFFFF_FFFF;
pub const FLAG_LINEAGE: u32 = 1;
pub const FLAG_POSSESSED: u32 = 2;
pub const FLAG_JUVENILE: u32 = 4;
/// A body this far outside the view is still in the frame, so a body on the edge is drawn whole.
const MARGIN: f32 = 32.0;

/// Writes `world.frame` for the view `[x0, x1] x [y0, y1]` grown by `MARGIN`. Returns the words
/// written. Records are in grid order.
///
/// Header: tick, creature records, plant records, creatures alive, plants alive, the possessed
/// slot or `NO_SLOT`, 1 when a creature is possessed and its brain is driving, 0.
/// Creature record: x, y, heading, length, width, hue, energy01, then uid, slot, flags.
/// Plant record: x, y, radius, reserve01.
pub fn write(world: &mut World, x0: f32, y0: f32, x1: f32, y1: f32) -> u32 {
    let per_mass = world.params.get(id::ENERGY_PER_MASS);
    let plant_cap = world.params.get(id::PLANT_CAP);
    let World {
        tick,
        creatures: c,
        plants,
        control,
        grid,
        frame,
        ..
    } = world;
    let (x0, y0, x1, y1) = (x0 - MARGIN, y0 - MARGIN, x1 + MARGIN, y1 + MARGIN);
    // False for NaN, so a body at NaN is in no frame.
    let in_view = |x: f32, y: f32| x >= x0 && x <= x1 && y >= y0 && y <= y1;
    // The grid is from the start of the last tick. Creatures have moved since.
    grid.rebuild(&c.slots, &c.x, &c.y);
    plants.refresh_grid();
    let possessed = if control.possessed != 0 {
        control.possessed_slot
    } else {
        NO_SLOT
    };
    let brain_driving = (control.possessed != 0 && !control.manual) as u32;
    frame.clear();
    frame.extend_from_slice(&[
        *tick,
        0,
        0,
        c.slots.count(),
        plants.slots.count(),
        possessed,
        brain_driving,
        0,
    ]);

    let mut records = 0;
    grid.for_each_in_box(x0, y0, x1, y1, |slot| {
        let s = slot as usize;
        if !in_view(c.x[s], c.y[s]) {
            return;
        }
        let floats = [
            c.x[s],
            c.y[s],
            c.heading[s],
            c.length(s),
            c.width(s),
            c.hue[s],
            c.energy01(s, per_mass),
        ];
        let mut flags = 0;
        if c.mark[s] & MARK_LINEAGE != 0 {
            flags |= FLAG_LINEAGE;
        }
        if slot == possessed {
            flags |= FLAG_POSSESSED;
        }
        if c.growth[s] < 1.0 {
            flags |= FLAG_JUVENILE;
        }
        frame.extend(floats.map(f32::to_bits));
        frame.extend_from_slice(&[c.uid[s], slot, flags]);
        records += 1;
    });
    frame[1] = records;

    let mut records = 0;
    plants.grid.for_each_in_box(x0, y0, x1, y1, |slot| {
        let s = slot as usize;
        if !in_view(plants.x[s], plants.y[s]) {
            return;
        }
        let reserve = plants.reserve[s];
        let floats = [
            plants.x[s],
            plants.y[s],
            plant::radius(reserve, plant_cap),
            reserve / plants.cap[s],
        ];
        frame.extend(floats.map(f32::to_bits));
        records += 1;
    });
    frame[2] = records;
    frame.len() as u32
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::genome::Genome;
    use crate::world::SpawnAt;

    const CREATURE: usize = CREATURE_STRIDE as usize;

    /// The record of the creature in `slot`.
    fn record(w: &World, slot: u32) -> &[u32; CREATURE] {
        let records = w.frame[HEADER_WORDS as usize..].as_chunks::<CREATURE>().0;
        records[..w.frame[1] as usize]
            .iter()
            .find(|r| r[8] == slot)
            .expect("the slot is in the frame")
    }

    #[test]
    fn frame_holds_the_creatures_inside_the_view_plus_margin_and_no_others() {
        let mut w = World::new(5, 1536.0, 1024.0);
        w.seed_founders(1000, 0);
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
        let mut got: Vec<u32> = records.iter().skip(8).step_by(CREATURE).copied().collect();
        got.sort_unstable();
        assert!(!want.is_empty() && want.len() < 1000);
        assert_eq!(got, want);
        assert_eq!(words, HEADER_WORDS + got.len() as u32 * CREATURE_STRIDE);
        assert_eq!(
            w.frame[..8],
            [3, got.len() as u32, 0, 1000, 0, NO_SLOT, 0, 0]
        );
    }

    #[test]
    fn a_creature_record_holds_the_real_values() {
        let mut w = World::new(5, 1536.0, 1024.0);
        w.seed_founders(50, 0);
        w.run(3);
        w.creatures.energy[4] = 0.75 * w.params.get(id::ENERGY_PER_MASS) * w.creatures.mass(4);
        write(&mut w, 0.0, 0.0, 1536.0, 1024.0);
        let (c, r) = (&w.creatures, record(&w, 4));
        let floats = [
            c.x[4],
            c.y[4],
            c.heading[4],
            c.length(4),
            c.width(4),
            c.hue[4],
        ];
        assert_eq!(r[..6], floats.map(f32::to_bits));
        assert!((f32::from_bits(r[6]) - 0.75).abs() < 1e-6);
        assert_eq!(r[7..], [c.uid[4], 4, 0]);
        assert!(c.heading[4] != 0.0 && c.length(4) > c.width(4));
    }

    #[test]
    fn the_header_and_the_flags_follow_possession_and_growth() {
        let mut w = World::new(5, 1536.0, 1024.0);
        w.seed_founders(50, 0);
        let view = |w: &mut World| write(w, 0.0, 0.0, 1536.0, 1024.0);
        assert!(w.possess(w.creatures.uid[7]));
        assert!(w.possess(w.creatures.uid[9]));
        w.creatures.growth[9] = 0.5;
        w.creatures.growth[11] = 0.5;
        view(&mut w);
        assert_eq!(w.frame[5..7], [9, 1]);
        assert_eq!(record(&w, 7)[9], FLAG_LINEAGE);
        assert_eq!(
            record(&w, 9)[9],
            FLAG_LINEAGE | FLAG_POSSESSED | FLAG_JUVENILE
        );
        assert_eq!(record(&w, 11)[9], FLAG_JUVENILE);
        assert_eq!(record(&w, 0)[9], 0);

        w.input(true, 0.0, 0.0);
        view(&mut w);
        assert_eq!(w.frame[5..7], [9, 0]);

        w.release();
        view(&mut w);
        assert_eq!(w.frame[5..7], [NO_SLOT, 0]);
        assert_eq!(record(&w, 9)[9], FLAG_LINEAGE | FLAG_JUVENILE);
    }

    #[test]
    fn plant_records_follow_the_creature_records_and_are_culled_by_the_view() {
        let mut w = World::new(5, 1536.0, 1024.0);
        w.seed_founders(20, 0);
        for (x, reserve, cap) in [(100.0, 20.0, 20.0), (1400.0, 5.0, 10.0)] {
            let s = w.plants.slots.alloc().expect("plant slot") as usize;
            let p = &mut w.plants;
            (p.x[s], p.y[s], p.reserve[s], p.cap[s]) = (x, 500.0, reserve, cap);
            p.dirty = true;
        }
        let words = write(&mut w, 0.0, 0.0, 1536.0, 1024.0);
        assert_eq!(w.frame[..5], [0, 20, 2, 20, 2]);
        assert_eq!(
            words as usize,
            8 + 20 * CREATURE + 2 * PLANT_STRIDE as usize
        );
        let far = &w.frame[8 + 20 * CREATURE + PLANT_STRIDE as usize..];
        // x, y, a radius of 2 + 6 * sqrt(5 / 20), and a reserve01 of 5 / 10.
        assert_eq!(far, [1400.0f32, 500.0, 5.0, 0.5].map(f32::to_bits));

        write(&mut w, 0.0, 0.0, 200.0, 1024.0);
        assert_eq!((w.frame[2], w.frame[4]), (1, 2));
        let near = &w.frame[w.frame.len() - PLANT_STRIDE as usize..];
        assert_eq!(near, [100.0f32, 500.0, 8.0, 1.0].map(f32::to_bits));
    }

    #[test]
    fn a_body_at_nan_is_in_no_frame() {
        let mut w = World::new(5, 64.0, 64.0);
        for x in [f32::NAN, 10.0] {
            let at = SpawnAt {
                x,
                y: 10.0,
                heading: 0.0,
                growth: 1.0,
                energy01: 1.0,
                parent: 0,
                generation: 0,
                mark: 0,
            };
            w.spawn(Genome::default(), at).expect("slot");
        }
        write(&mut w, 0.0, 0.0, 64.0, 64.0);
        assert_eq!(w.frame[1], 1);
        assert_eq!(record(&w, 1)[8], 1);
    }

    #[test]
    fn writing_a_frame_changes_neither_the_hash_nor_the_future() {
        let start = || {
            let mut w = World::new(5, 1536.0, 1024.0);
            w.seed_founders(200, 0);
            w.run(3);
            w
        };
        let (mut a, mut b) = (start(), start());
        write(&mut a, 0.0, 0.0, 1536.0, 1024.0);
        a.save_buf = a.save();
        a.write_heirs();
        assert_eq!(a.state_hash(), b.state_hash());
        a.run(50);
        b.run(50);
        assert_eq!(a.state_hash(), b.state_hash());
    }
}
