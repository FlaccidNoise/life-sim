//! The frame that the page draws: a header, then one record for each creature in view, then one
//! for each plant in view, then one for each piece of debris and each cloud in view. Words are
//! `u32`. Floats are stored by bit pattern. `src/protocol.ts` mirrors this layout.

use crate::creature::{MARK_LINEAGE, MAX_EYES};
use crate::genome::{PartGene, MAX_PART_GENES, REF_AREA};
use crate::params::id;
use crate::plant;
use crate::world::World;

pub const HEADER_WORDS: u32 = 50;
pub const CREATURE_STRIDE: u32 = 26;
pub const PLANT_STRIDE: u32 = 4;
pub const DEBRIS_STRIDE: u32 = 3;
pub const CLOUD_STRIDE: u32 = 4;
/// The kills in view that the header has room for, and the words of each.
pub const MAX_FRAME_KILLS: usize = 4;
pub const KILL_WORDS: u32 = 3;
/// The most kills that `World::kills` holds between two frames. More are not drawn.
pub const KILL_LOG: usize = 64;
/// Part words in a creature record: one for each part gene that a genome can hold.
pub const PART_WORDS: u32 = MAX_PART_GENES as u32;
/// Words for one eye cone in the header.
pub const CONE_WORDS: u32 = 3;
pub const NO_SLOT: u32 = 0xFFFF_FFFF;
pub const FLAG_LINEAGE: u32 = 1;
pub const FLAG_POSSESSED: u32 = 2;
pub const FLAG_JUVENILE: u32 = 4;
pub const FLAG_BUDDED: u32 = 8;
/// The body was born of a cross.
pub const FLAG_MIXED: u32 = 16;
/// The body accepts a mate now: its `cmd_accept` is above 0.
pub const FLAG_WILLING: u32 = 32;
/// The body holds the genes of a partner for its next bud.
pub const FLAG_DONOR: u32 = 64;
/// A bite of the body took energy in the last `BIT_FLASH` ticks.
pub const FLAG_BIT: u32 = 128;
/// The body lost energy to a hit in the last `HURT_FLASH` ticks.
pub const FLAG_HURT: u32 = 256;
/// The body dashed or lunged in the last `DASH_FLASH` ticks.
pub const FLAG_DASH: u32 = 512;
/// A body this far outside the view is still in the frame, so a body on the edge is drawn whole.
const MARGIN: f32 = 32.0;
/// Ticks that `FLAG_BUDDED` stays set after a bud.
const BUD_FLASH: u32 = 40;
/// Ticks that `FLAG_BIT`, `FLAG_HURT`, and `FLAG_DASH` stay set.
const BIT_FLASH: u32 = 20;
const HURT_FLASH: u32 = 20;
const DASH_FLASH: u32 = 10;
/// The header word that counts the cones of the possessed body, and the first word of the cones.
const CONE_COUNT_AT: usize = 9;
const CONES_AT: usize = CONE_COUNT_AT + 1;
/// The header words after the cones: the debris and cloud records, the `hurt_side` of the
/// possessed body, and the kills in view, their count and then their places.
const DEBRIS_COUNT_AT: usize = CONES_AT + MAX_EYES * CONE_WORDS as usize;
const CLOUD_COUNT_AT: usize = DEBRIS_COUNT_AT + 1;
const HURT_SIDE_AT: usize = CLOUD_COUNT_AT + 1;
const KILL_COUNT_AT: usize = HURT_SIDE_AT + 1;
const KILLS_AT: usize = KILL_COUNT_AT + 1;
const _: () = assert!(HEADER_WORDS as usize == KILLS_AT + MAX_FRAME_KILLS * KILL_WORDS as usize);

/// True when `stamp` is a tick count after an event, and the count `now` is less than `ticks`
/// past it. A stamp of 0 is no event.
fn flashing(stamp: u32, now: u32, ticks: u32) -> bool {
    stamp != 0 && now.wrapping_sub(stamp) < ticks
}

/// True for the `DASH_FLASH` ticks after an ability set its cooldown to `cooldown`. The cooldown
/// falls by 1 on each tick.
fn just_fired(left: u32, cooldown: u32) -> bool {
    left > 0 && left.saturating_add(DASH_FLASH) > cooldown
}

/// A part gene as one word: `kind | q(anchor) << 8 | q(size) << 16 | q(extra) << 24`, where `q`
/// holds a value in 0 to 1 and scales it to a byte. NaN packs as 0.
fn pack(part: &PartGene) -> u32 {
    let q = |v: f32| (v.clamp(0.0, 1.0) * 255.0 + 0.5) as u32;
    part.kind as u32 | q(part.anchor) << 8 | q(part.size) << 16 | q(part.extra) << 24
}

/// Writes `world.frame` for the view `[x0, x1] x [y0, y1]` grown by `MARGIN`, and empties
/// `world.kills`. Returns the words written. Records are in grid order, and clouds in slot order.
///
/// Header: tick, creature records, plant records, creatures alive, plants alive, the possessed
/// slot or `NO_SLOT`, 1 when a creature is possessed and its brain is driving, living creatures
/// with the lineage mark, the buds of the possessed body, and the eye cones of the possessed body:
/// their count, then `MAX_EYES` places of `CONE_WORDS` floats each. A cone is its direction in
/// world radians, the cosine of its half angle, and its range in world units. A place past the
/// count holds zeros. Then debris records, cloud records, the `hurt_side` of the possessed body as
/// a float (0 with none), and the kills in view since the last frame: their count, then
/// `MAX_FRAME_KILLS` places of x and y as floats and the slot of the killer, or `NO_SLOT` when that
/// body is no longer alive.
/// Creature record: x, y, heading, length, width, hue, energy01, then uid, slot, flags, and
/// `hidden | conns << 16` for the hidden neurons and the connections that its brain expresses, then
/// `PART_WORDS` part words in gene order. A place with no part holds 0. The next word is the growth,
/// a float: the share of its full size that the body has grown. The length and the width are as
/// the body is now, so the length over the growth is the length gene. Then the age, a float: the
/// share of its life that the body has lived, `age / old`, as the age input of its brain reads it.
/// The last word is the `diet` gene as the body expresses it, a float in 0 to 1.
/// Plant record: x, y, radius, reserve01.
/// Debris record: x, y, and its energy as a share of the capacity of the reference body, held at 1.
/// Cloud record: x, y, radius, and its ticks left as a share of `toxin_ticks`, held at 1.
/// The body of `slot` for the killer card: see `Control::killer_body`.
pub fn card_body(world: &World, slot: u32) -> Vec<u32> {
    let (c, s) = (&world.creatures, slot as usize);
    let mut words = vec![c.generation[s]];
    words.extend([c.x[s], c.y[s], c.length(s), c.width(s), c.hue[s]].map(f32::to_bits));
    let mut parts = [0; PART_WORDS as usize];
    for (word, part) in parts.iter_mut().zip(&world.genomes[s].parts) {
        *word = pack(part);
    }
    words.extend_from_slice(&parts);
    words.push(c.diet[s].to_bits());
    words
}

pub fn write(world: &mut World, x0: f32, y0: f32, x1: f32, y1: f32) -> u32 {
    let per_mass = world.params.get(id::ENERGY_PER_MASS);
    let plant_cap = world.params.get(id::PLANT_CAP);
    let eye_range = world.params.get(id::EYE_RANGE);
    let cooldown = world.params.get(id::BUD_COOLDOWN) as u32;
    let ability_cooldown = world.params.get(id::ABILITY_COOLDOWN) as u32;
    let toxin_ticks = world.params.get(id::TOXIN_TICKS);
    let World {
        tick,
        creatures: c,
        genomes,
        donors,
        brains,
        plants,
        debris,
        clouds,
        control,
        grid,
        frame,
        kills,
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
                c.cone_range(s, k, eye_range),
            ];
            frame[at..at + cone.len()].copy_from_slice(&cone.map(f32::to_bits));
        }
        frame[HURT_SIDE_AT] = c.hurt_side[s].to_bits();
    }
    let mut shown = 0;
    for &[x, y, killer, uid] in kills.iter() {
        if shown < MAX_FRAME_KILLS && in_view(f32::from_bits(x), f32::from_bits(y)) {
            // A killer that died since, or whose slot a newborn holds, is no slot.
            let killer = if c.slots.is_alive(killer) && c.uid[killer as usize] == uid {
                killer
            } else {
                NO_SLOT
            };
            let at = KILLS_AT + shown * KILL_WORDS as usize;
            frame[at..at + KILL_WORDS as usize].copy_from_slice(&[x, y, killer]);
            shown += 1;
        }
    }
    frame[KILL_COUNT_AT] = shown as u32;
    kills.clear();

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
        if c.mixed_with[s] != 0 {
            flags |= FLAG_MIXED;
        }
        if c.cmd_accept[s] > 0.0 {
            flags |= FLAG_WILLING;
        }
        if donors[s].is_some() {
            flags |= FLAG_DONOR;
        }
        if flashing(c.bit_tick[s], *tick, BIT_FLASH) {
            flags |= FLAG_BIT;
        }
        if flashing(c.hurt_tick[s], *tick, HURT_FLASH) {
            flags |= FLAG_HURT;
        }
        if just_fired(c.cd_dash[s], ability_cooldown) || just_fired(c.cd_lunge[s], ability_cooldown)
        {
            flags |= FLAG_DASH;
        }
        let hidden = brains.n_neur[s] - brains.n_in[s] - brains.n_out[s];
        let brain = hidden as u32 | (brains.n_conn[s] as u32) << 16;
        frame.extend(floats.map(f32::to_bits));
        frame.extend_from_slice(&[c.uid[s], slot, flags, brain]);
        let mut parts = [0; PART_WORDS as usize];
        for (word, part) in parts.iter_mut().zip(&genomes[s].parts) {
            *word = pack(part);
        }
        frame.extend_from_slice(&parts);
        frame.push(c.growth[s].to_bits());
        frame.push((c.age[s] as f32 / c.old[s]).to_bits());
        frame.push(c.diet[s].to_bits());
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

    debris.refresh_grid();
    let full = per_mass * REF_AREA;
    let mut records = 0;
    debris.grid.for_each_in_box(x0, y0, x1, y1, |slot| {
        let s = slot as usize;
        if !in_view(debris.x[s], debris.y[s]) {
            return;
        }
        let floats = [debris.x[s], debris.y[s], (debris.energy[s] / full).min(1.0)];
        frame.extend(floats.map(f32::to_bits));
        records += 1;
    });
    frame[DEBRIS_COUNT_AT] = records;

    let mut records = 0;
    for s in 0..clouds.slots.high_water() as usize {
        if !clouds.slots.is_alive(s as u32) || !in_view(clouds.x[s], clouds.y[s]) {
            continue;
        }
        let left = (clouds.left[s] as f32 / toxin_ticks).min(1.0);
        let floats = [clouds.x[s], clouds.y[s], clouds.radius[s], left];
        frame.extend(floats.map(f32::to_bits));
        records += 1;
    }
    frame[CLOUD_COUNT_AT] = records;
    frame.len() as u32
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::eye::EYE_REACH;
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
        // A founder accepts a mate from its first thought.
        assert_eq!(r[7..10], [c.uid[4], 4, FLAG_WILLING]);
        // A founder brain: 4 hidden neurons and 65 connections.
        assert_eq!(r[10], 4 | 65 << 16);
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

        w.input(true, 0.0, 0.0, false, 0);
        view(&mut w);
        assert_eq!(w.frame[5..7], [9, 0]);

        w.release();
        view(&mut w);
        assert_eq!(w.frame[5..7], [NO_SLOT, 0]);
        assert_eq!(record(&w, 9)[9], FLAG_LINEAGE | FLAG_JUVENILE);
    }

    #[test]
    fn the_mate_flags_follow_the_cross_the_accept_command_and_the_donor() {
        let mut w = World::new(5, 1536.0, 1024.0);
        w.seed_founders(50, 0);
        w.creatures.mixed_with[4] = 2;
        w.creatures.cmd_accept[5] = 0.1;
        w.creatures.cmd_accept[7] = -0.1;
        w.donors[6] = Some((9, w.genomes[8].clone()));
        // The smallest brain, in slot 50.
        let at = SpawnAt {
            x: 10.0,
            y: 10.0,
            heading: 0.0,
            growth: 1.0,
            energy01: 1.0,
            parent: 0,
            generation: 0,
            mark: 0,
        };
        assert_eq!(w.spawn(Genome::default(), at), Some(50));
        write(&mut w, 0.0, 0.0, 1536.0, 1024.0);
        let flags = [4, 5, 6, 7].map(|slot| record(&w, slot)[9]);
        assert_eq!(flags, [FLAG_MIXED, FLAG_WILLING, FLAG_DONOR, 0]);
        assert_eq!(record(&w, 50)[9..11], [0, 0]);
    }

    #[test]
    fn a_record_holds_one_word_for_each_part_and_zeros_after_them() {
        let mut w = World::new(5, 1536.0, 1024.0);
        // The founder with no eye: four parts.
        w.params.set(id::FOUNDER_EYE, 0.0);
        w.seed_founders(50, 0);
        write(&mut w, 0.0, 0.0, 1536.0, 1024.0);
        let parts = &record(&w, 4)[11..11 + PART_WORDS as usize];
        let kinds: Vec<u32> = parts.iter().map(|word| word & 0xFF).collect();
        assert_eq!(kinds, [1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0]);
        assert_eq!(parts[4..], [0; 8]);
        // The flagellum: anchor 1 packs as 255, and the size as its nearest 255th.
        let size = w.genomes[4].parts[0].size;
        assert_eq!(parts[0] >> 8, 255 | ((size * 255.0).round() as u32) << 8);
    }

    /// The page divides the length of a record by its growth, and gets the length gene.
    #[test]
    fn a_record_holds_the_growth_of_a_juvenile_and_of_an_adult() {
        let mut w = World::new(5, 1536.0, 1024.0);
        w.seed_founders(50, 0);
        w.creatures.growth[9] = 0.4;
        write(&mut w, 0.0, 0.0, 1536.0, 1024.0);
        for (slot, growth) in [(9u32, 0.4f32), (4, 1.0)] {
            let r = record(&w, slot);
            assert_eq!(r[CREATURE - 3], growth.to_bits());
            assert_eq!(r[9] & FLAG_JUVENILE != 0, growth < 1.0);
            let gene = f32::from_bits(r[3]) / growth;
            assert!(
                (gene - w.creatures.len[slot as usize]).abs() < 1e-5,
                "{gene}"
            );
        }
    }

    /// The page does not hand over a body near the end of its life. The share is the age input of
    /// the brain, in `sense.rs`.
    #[test]
    fn a_record_holds_the_age_share_of_a_young_body_and_of_an_old_one() {
        let mut w = World::new(5, 1536.0, 1024.0);
        w.seed_founders(50, 0);
        // The lifespan of a founder is 4,800 ticks.
        (w.creatures.age[4], w.creatures.age[9]) = (480, 4560);
        write(&mut w, 0.0, 0.0, 1536.0, 1024.0);
        for (slot, share) in [(4u32, 0.1f32), (9, 0.95)] {
            let s = slot as usize;
            let age = record(&w, slot)[CREATURE - 2];
            assert_eq!(
                age,
                (w.creatures.age[s] as f32 / w.creatures.old[s]).to_bits()
            );
            assert!((f32::from_bits(age) - share).abs() < 1e-6, "slot {slot}");
        }
    }

    /// The page names what a body eats from the last word (Task 4 of the diet plan). A gene out of
    /// range, as a load can hold, is sent as the body expresses it.
    #[test]
    fn a_record_ends_with_the_diet() {
        let mut w = World::new(5, 1536.0, 1024.0);
        w.seed_founders(50, 0);
        for (s, diet) in [(4usize, 0.3f32), (9, 7.0)] {
            w.genomes[s].diet = diet;
            let g = w.genomes[s].clone();
            w.creatures.express(s, &g);
        }
        write(&mut w, 0.0, 0.0, 1536.0, 1024.0);
        for (slot, diet) in [(4u32, 0.3f32), (9, 1.0)] {
            assert_eq!(
                record(&w, slot)[CREATURE - 1],
                diet.to_bits(),
                "slot {slot}"
            );
        }
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
        let cones = w.frame[CONES_AT..DEBRIS_COUNT_AT].as_chunks::<3>().0;
        let (heading, turn) = (w.creatures.heading[9], 0.2 * crate::math::PI);
        // The eye of a founder: a half angle of 0.2 + 0.5, and a range of 16 * 0.2 lengths.
        #[allow(clippy::disallowed_methods)]
        let (cos_half, range) = (0.7f32.cos(), 3.2 * w.creatures.length(9));
        for (cone, dir) in cones.iter().zip([heading + turn, heading - turn]) {
            let cone = cone.map(f32::from_bits);
            assert!((cone[0] - dir).abs() < 1e-3, "{cone:?}");
            assert!((cone[1] - cos_half).abs() < 1e-3, "{cone:?}");
            assert!((cone[2] - range).abs() < 1e-3 && range < EYE_REACH);
        }
        assert_eq!(cones[2..], [[0; 3]; MAX_EYES - 2]);
        assert_eq!(record(&w, 9)[15] & 0xFF, 6);

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

    /// The page draws the cone that the eye scans: `Creatures::cone_range`, which follows the
    /// length of the body as it has grown.
    #[test]
    fn the_cones_of_a_juvenile_are_as_long_as_its_eyes_see() {
        let mut w = World::new(5, 1536.0, 1024.0);
        w.params.set(id::FOUNDER_EYE, 0.2);
        w.seed_founders(50, 0);
        w.creatures.growth[9] = 0.5;
        assert!(w.possess(w.creatures.uid[9]));
        write(&mut w, 0.0, 0.0, 1536.0, 1024.0);
        let range = w.creatures.cone_range(9, 0, w.params.get(id::EYE_RANGE));
        // Half of the 16 * 0.2 lengths that the same body sees when it is full-grown.
        assert!((range - 1.6 * w.creatures.len[9]).abs() < 1e-4, "{range}");
        assert_eq!(w.frame[CONE_COUNT_AT], 2);
        for cone in w.frame[CONES_AT..].as_chunks::<3>().0.iter().take(2) {
            assert_eq!(cone[2], range.to_bits());
        }
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
        // The radius below is for a `plant_cap` of 20.
        w.params.set(id::PLANT_CAP, 20.0);
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
    fn debris_and_cloud_records_follow_the_plants_and_are_culled_by_the_view() {
        let mut w = World::new(5, 1536.0, 1024.0);
        w.seed_founders(20, 0);
        let full = w.params.get(id::ENERGY_PER_MASS) * REF_AREA;
        for (x, energy) in [(100.0, 0.25 * full), (1400.0, 2.0 * full)] {
            let s = w.debris.slots.alloc().expect("debris slot") as usize;
            (w.debris.x[s], w.debris.y[s], w.debris.energy[s]) = (x, 500.0, energy);
            w.debris.dirty = true;
        }
        let ticks = w.params.get(id::TOXIN_TICKS);
        let k = w.clouds.slots.alloc().expect("cloud slot") as usize;
        let c = &mut w.clouds;
        (c.x[k], c.y[k], c.radius[k], c.left[k]) = (120.0, 300.0, 24.0, (ticks / 4.0) as u32);
        let words = write(&mut w, 0.0, 0.0, 1536.0, 1024.0) as usize;
        assert_eq!(w.frame[DEBRIS_COUNT_AT..CLOUD_COUNT_AT + 1], [2, 1]);
        let records = HEADER + 20 * CREATURE;
        let debris = DEBRIS_STRIDE as usize;
        assert_eq!(words, records + 2 * debris + CLOUD_STRIDE as usize);
        let cloud = &w.frame[records + 2 * debris..];
        assert_eq!(cloud, [120.0f32, 300.0, 24.0, 0.25].map(f32::to_bits));
        // A piece's energy is a share of the capacity of the reference body, held at 1.
        let mut shares: Vec<u32> = w.frame[records..records + 2 * debris]
            .chunks(debris)
            .map(|r| r[2])
            .collect();
        shares.sort_unstable();
        assert_eq!(shares, [0.25f32.to_bits(), 1.0f32.to_bits()]);

        write(&mut w, 0.0, 0.0, 200.0, 200.0);
        assert_eq!(w.frame[DEBRIS_COUNT_AT..CLOUD_COUNT_AT + 1], [0, 0]);
    }

    #[test]
    fn the_header_holds_the_kills_in_view_once_and_the_hurt_side_of_the_possessed_body() {
        let mut w = World::new(5, 1536.0, 1024.0);
        w.seed_founders(50, 0);
        let view = |w: &mut World| write(w, 0.0, 0.0, 1536.0, 1024.0);
        assert!(w.possess(w.creatures.uid[2]));
        w.creatures.hurt_side[2] = -0.5;
        let places: Vec<(f32, f32)> = (10..16)
            .map(|s| (w.creatures.x[s], w.creatures.y[s]))
            .collect();
        for s in 10..16 {
            w.kill(s, crate::control::CAUSE_EATEN, Some(30));
        }
        // A killer that is not alive is none: no place in the header.
        w.kill(16, crate::control::CAUSE_EATEN, Some(10));
        view(&mut w);
        assert_eq!(w.frame[HURT_SIDE_AT], (-0.5f32).to_bits());
        assert_eq!(w.frame[KILL_COUNT_AT], MAX_FRAME_KILLS as u32);
        for (k, &(x, y)) in places.iter().take(MAX_FRAME_KILLS).enumerate() {
            let at = KILLS_AT + k * KILL_WORDS as usize;
            assert_eq!(w.frame[at..at + 3], [x.to_bits(), y.to_bits(), 30]);
        }
        // A kill is drawn by one frame.
        view(&mut w);
        assert_eq!(w.frame[KILL_COUNT_AT], 0);
        // A killer alive at the kill that dies before the frame, here in the same list, and whose
        // slot a newborn takes, is no slot in the header: the mark rings no body.
        let late = (w.creatures.x[0], w.creatures.y[0]);
        w.kill_all(&[
            (0, crate::control::CAUSE_EATEN, Some(1)),
            (1, crate::control::CAUSE_SPIKED, Some(0)),
        ]);
        assert_eq!(w.creatures.slots.alloc(), Some(0));
        w.creatures.uid[0] = 999;
        view(&mut w);
        assert_eq!(w.frame[KILL_COUNT_AT], 2);
        let (x, y) = late;
        assert_eq!(
            w.frame[KILLS_AT..KILLS_AT + 3],
            [x.to_bits(), y.to_bits(), NO_SLOT]
        );
        assert_eq!(w.frame[KILLS_AT + 5], NO_SLOT);
        w.release();
        view(&mut w);
        assert_eq!(w.frame[HURT_SIDE_AT], 0);
    }

    #[test]
    fn the_bite_hurt_and_dash_flags_last_their_ticks() {
        let mut w = World::new(5, 1536.0, 1024.0);
        w.seed_founders(50, 0);
        let flags = |w: &mut World, s: u32| {
            write(w, 0.0, 0.0, 1536.0, 1024.0);
            record(w, s)[9] & (FLAG_BIT | FLAG_HURT | FLAG_DASH)
        };
        assert_eq!(flags(&mut w, 4), 0);
        w.tick = 100;
        (w.creatures.bit_tick[4], w.creatures.hurt_tick[5]) = (100, 100 - HURT_FLASH + 1);
        w.creatures.hurt_tick[6] = 100 - HURT_FLASH;
        assert_eq!(flags(&mut w, 4), FLAG_BIT);
        assert_eq!(flags(&mut w, 5), FLAG_HURT);
        assert_eq!(flags(&mut w, 6), 0);
        let cooldown = w.params.get(id::ABILITY_COOLDOWN) as u32;
        for (left, flag) in [
            (cooldown, FLAG_DASH),
            (cooldown - DASH_FLASH + 1, FLAG_DASH),
            (cooldown - DASH_FLASH, 0),
            (0, 0),
        ] {
            (w.creatures.cd_dash[7], w.creatures.cd_lunge[8]) = (left, left);
            assert_eq!(flags(&mut w, 7), flag, "{left} ticks left");
            assert_eq!(flags(&mut w, 8), flag, "{left} ticks left");
        }
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
