//! The frame that the page draws: a header, then one record for each creature in view, then one
//! for each plant in view. Words are `u32`. Floats are stored by bit pattern. `src/protocol.ts`
//! mirrors this layout.

use crate::creature::{MARK_LINEAGE, MAX_EYES};
use crate::eye::EYE_REACH;
use crate::genome::{PartGene, MAX_PART_GENES};
use crate::params::id;
use crate::plant;
use crate::world::World;

pub const HEADER_WORDS: u32 = 34;
pub const CREATURE_STRIDE: u32 = 22;
pub const PLANT_STRIDE: u32 = 4;
/// Part words in a creature record: one for each part gene that a genome can hold.
pub const PART_WORDS: u32 = MAX_PART_GENES as u32;
/// Words for one eye cone in the header.
pub const CONE_WORDS: u32 = 3;
pub const NO_SLOT: u32 = 0xFFFF_FFFF;
pub const FLAG_LINEAGE: u32 = 1;
pub const FLAG_POSSESSED: u32 = 2;
pub const FLAG_JUVENILE: u32 = 4;
pub const FLAG_BUDDED: u32 = 8;
/// A body this far outside the view is still in the frame, so a body on the edge is drawn whole.
const MARGIN: f32 = 32.0;
/// Ticks that `FLAG_BUDDED` stays set after a bud.
const BUD_FLASH: u32 = 40;
/// The header word that counts the cones of the possessed body, and the first word of the cones.
const CONE_COUNT_AT: usize = 9;
const CONES_AT: usize = CONE_COUNT_AT + 1;
const _: () = assert!(HEADER_WORDS as usize == CONES_AT + MAX_EYES * CONE_WORDS as usize);

/// A part gene as one word: `kind | q(anchor) << 8 | q(size) << 16 | q(extra) << 24`, where `q`
/// holds a value in 0 to 1 and scales it to a byte. NaN packs as 0.
fn pack(part: &PartGene) -> u32 {
    let q = |v: f32| (v.clamp(0.0, 1.0) * 255.0 + 0.5) as u32;
    part.kind as u32 | q(part.anchor) << 8 | q(part.size) << 16 | q(part.extra) << 24
}

/// Writes `world.frame` for the view `[x0, x1] x [y0, y1]` grown by `MARGIN`. Returns the words
/// written. Records are in grid order.
///
/// Header: tick, creature records, plant records, creatures alive, plants alive, the possessed
/// slot or `NO_SLOT`, 1 when a creature is possessed and its brain is driving, living creatures
/// with the lineage mark, the buds of the possessed body, and the eye cones of the possessed body:
/// their count, then `MAX_EYES` places of `CONE_WORDS` floats each. A cone is its direction in
/// world radians, the cosine of its half angle, and its range in world units. A place past the
/// count holds zeros.
/// Creature record: x, y, heading, length, width, hue, energy01, then uid, slot, flags, then
/// `PART_WORDS` part words in gene order. A place with no part holds 0.
/// Plant record: x, y, radius, reserve01.
pub fn write(world: &mut World, x0: f32, y0: f32, x1: f32, y1: f32) -> u32 {
    let per_mass = world.params.get(id::ENERGY_PER_MASS);
    let plant_cap = world.params.get(id::PLANT_CAP);
    let eye_range = world.params.get(id::EYE_RANGE);
    let cooldown = world.params.get(id::BUD_COOLDOWN) as u32;
    let World {
        tick,
        creatures: c,
        genomes,
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
    let lineage = (0..c.slots.high_water() as usize)
        .filter(|&s| c.slots.is_alive(s as u32) && c.mark[s] & MARK_LINEAGE != 0)
        .count() as u32;
    frame.clear();
    frame.resize(HEADER_WORDS as usize, 0);
    frame[..CONES_AT].copy_from_slice(&[
        *tick,
        0,
        0,
        c.slots.count(),
        plants.slots.count(),
        possessed,
        brain_driving,
        lineage,
        control.buds,
        0,
    ]);
    if possessed != NO_SLOT {
        let s = possessed as usize;
        frame[CONE_COUNT_AT] = c.n_eyes[s] as u32;
        for k in 0..c.n_eyes[s] as usize {
            let (eye, at) = (s * MAX_EYES + k, CONES_AT + k * CONE_WORDS as usize);
            let cone = [
                c.heading[s] + c.eye_dir[eye],
                c.eye_cos[eye],
                (eye_range * c.eye_size[eye] * c.length(s)).min(EYE_REACH),
            ];
            frame[at..at + cone.len()].copy_from_slice(&cone.map(f32::to_bits));
        }
    }

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
        // A bud sets the cooldown to the parameter, and the cooldown falls by 1 on each tick.
        let left = c.bud_cooldown[s];
        if left > 0 && left.saturating_add(BUD_FLASH) > cooldown {
            flags |= FLAG_BUDDED;
        }
        frame.extend(floats.map(f32::to_bits));
        frame.extend_from_slice(&[c.uid[s], slot, flags]);
        let mut parts = [0; PART_WORDS as usize];
        for (word, part) in parts.iter_mut().zip(&genomes[s].parts) {
            *word = pack(part);
        }
        frame.extend_from_slice(&parts);
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

    const HEADER: usize = HEADER_WORDS as usize;
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
        w.creatures.energy[4] = 0.75 * w.params.get(id::ENERGY_PER_MASS) * w.creatures.area(4);
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
        assert_eq!(r[7..10], [c.uid[4], 4, 0]);
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
    fn a_record_holds_one_word_for_each_part_and_zeros_after_them() {
        let mut w = World::new(5, 1536.0, 1024.0);
        w.seed_founders(50, 0);
        write(&mut w, 0.0, 0.0, 1536.0, 1024.0);
        let parts = &record(&w, 4)[10..];
        assert_eq!(parts.len(), PART_WORDS as usize);
        let kinds: Vec<u32> = parts.iter().map(|word| word & 0xFF).collect();
        assert_eq!(kinds, [1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0]);
        assert_eq!(parts[4..], [0; 8]);
        // The flagellum: anchor 1 packs as 255, and the size as its nearest 255th.
        let size = w.genomes[4].parts[0].size;
        assert_eq!(parts[0] >> 8, 255 | ((size * 255.0).round() as u32) << 8);
    }

    #[test]
    fn a_part_packs_into_one_word_and_a_wild_value_is_held_in_range() {
        let part = |anchor: f32, size: f32, extra: f32| PartGene {
            kind: 6,
            anchor,
            size,
            extra,
            history: 77,
        };
        assert_eq!(
            pack(&part(0.2, 1.0, 0.4)),
            6 | 51 << 8 | 255 << 16 | 102 << 24
        );
        assert_eq!(pack(&part(f32::NAN, -3.0, f32::INFINITY)), 6 | 255 << 24);
    }

    #[test]
    fn the_header_holds_the_cones_of_the_possessed_body() {
        let mut w = World::new(5, 1536.0, 1024.0);
        w.params.set(id::FOUNDER_EYE, 0.2);
        w.seed_founders(50, 0);
        let view = |w: &mut World| write(w, 0.0, 0.0, 1536.0, 1024.0);
        view(&mut w);
        assert_eq!(w.frame[7..HEADER], [0; HEADER - 7]);

        assert!(w.possess(w.creatures.uid[7]));
        assert!(w.possess(w.creatures.uid[9]));
        w.control.buds = 3;
        view(&mut w);
        assert_eq!(w.frame[7..10], [2, 3, 2]);
        let cones = w.frame[10..HEADER].as_chunks::<3>().0;
        let (heading, turn) = (w.creatures.heading[9], 0.2 * crate::math::PI);
        // The eye of a founder: a half angle of 0.2 + 0.4, and a range of 16 * 0.2 lengths.
        #[allow(clippy::disallowed_methods)]
        let (cos_half, range) = (0.6f32.cos(), 3.2 * w.creatures.length(9));
        for (cone, dir) in cones.iter().zip([heading + turn, heading - turn]) {
            let cone = cone.map(f32::from_bits);
            assert!((cone[0] - dir).abs() < 1e-3, "{cone:?}");
            assert!((cone[1] - cos_half).abs() < 1e-3, "{cone:?}");
            assert!((cone[2] - range).abs() < 1e-3 && range < EYE_REACH);
        }
        assert_eq!(cones[2..], [[0; 3]; MAX_EYES - 2]);
        assert_eq!(record(&w, 9)[14] & 0xFF, 6);

        // A long cone stops at `EYE_REACH`.
        w.params.set(id::EYE_RANGE, 64.0);
        view(&mut w);
        assert_eq!(w.frame[12], EYE_REACH.to_bits());

        w.release();
        view(&mut w);
        // The two bodies keep their marks. The cones go.
        assert_eq!(w.frame[7], 2);
        assert_eq!(w.frame[9..HEADER], [0; HEADER - 9]);
    }

    #[test]
    fn a_body_carries_the_budded_flag_for_a_while_after_a_bud() {
        let mut w = World::new(5, 1536.0, 1024.0);
        w.seed_founders(50, 0);
        let view = |w: &mut World| write(w, 0.0, 0.0, 1536.0, 1024.0);
        let cooldown = w.params.get(id::BUD_COOLDOWN) as u32;
        for (left, flag) in [
            (cooldown, FLAG_BUDDED),
            (cooldown - BUD_FLASH + 1, FLAG_BUDDED),
            (cooldown - BUD_FLASH, 0),
            (0, 0),
            // A snapshot can hold any cooldown.
            (u32::MAX, FLAG_BUDDED),
        ] {
            w.creatures.bud_cooldown[4] = left;
            view(&mut w);
            assert_eq!(record(&w, 4)[9], flag, "{left} ticks left");
        }
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
            HEADER + 20 * CREATURE + 2 * PLANT_STRIDE as usize
        );
        let far = &w.frame[HEADER + 20 * CREATURE + PLANT_STRIDE as usize..];
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
