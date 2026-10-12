//! Creature arrays. One index per slot. A dead slot holds stale values, except `uid`, which is 0.

use crate::eye::{EYE_HALF_MIN, EYE_HALF_SPAN, EYE_REACH};
use crate::genome::{
    Genome, KIND_CHEMO, KIND_CILIA, KIND_EYE, KIND_FILTER, KIND_FIN, KIND_FLAGELLUM, LEN_RANGE,
    REF_PARTS, WID_RANGE,
};
use crate::math::{sin_cos, PI};
use crate::pool::Slots;
use crate::snapshot::{LoadError, Reader, Writer};

pub const MAX_CREATURES: u32 = 4096;
/// The radius of the largest adult the gene ranges allow. Sets the neighbour search box.
pub const MAX_RADIUS: f32 = LEN_RANGE.1 * (1.0 + WID_RANGE.1) / 4.0;
/// Bit 0 of `mark`: the creature is in the player's lineage.
pub const MARK_LINEAGE: u8 = 1;
/// The most eye cones on one body. Eye genes past it still cost their size.
pub const MAX_EYES: usize = 8;

pub struct Creatures {
    pub slots: Slots,
    pub uid: Vec<u32>,
    pub x: Vec<f32>,
    pub y: Vec<f32>,
    pub vx: Vec<f32>,
    pub vy: Vec<f32>,
    pub heading: Vec<f32>,
    /// The cosine and the sine of `heading`. Not saved: `load` works them out again.
    pub hc: Vec<f32>,
    pub hs: Vec<f32>,
    pub omega: Vec<f32>,
    /// In `[0, 1]`. Written by the brain or by control. Read by the motor.
    pub cmd_thrust: Vec<f32>,
    /// In `[-1, 1]`.
    pub cmd_turn: Vec<f32>,
    /// From the parent's `egg` to 1.
    pub growth: Vec<f32>,
    pub energy: Vec<f32>,
    pub age: Vec<u32>,
    pub generation: Vec<u32>,
    /// The uid of the budding parent. 0 for a founder.
    pub parent: Vec<u32>,
    pub mark: Vec<u8>,
    pub bud_cooldown: Vec<u32>,
    // From here on: what `express` makes of the genome, at spawn and at load. Not saved.
    pub len: Vec<f32>,
    pub wid: Vec<f32>,
    pub hue: Vec<f32>,
    pub egg: Vec<f32>,
    pub old: Vec<f32>,
    /// The sum of `size * push_of(anchor)` over the flagella.
    pub flag_push: Vec<f32>,
    /// The sum of `size * side_of(anchor)` over the flagella.
    pub flag_side: Vec<f32>,
    pub cilia: Vec<f32>,
    pub fin: Vec<f32>,
    pub filter: Vec<f32>,
    pub chemo: Vec<f32>,
    /// The sizes of every part that is not an eye, summed in gene order.
    pub plain_sum: Vec<f32>,
    pub eye_sum: Vec<f32>,
    /// Eye cones, at most `MAX_EYES`. The five arrays below hold `MAX_EYES` values per slot.
    pub n_eyes: Vec<u8>,
    /// Radians from the heading.
    pub eye_dir: Vec<f32>,
    /// The cosine and the sine of `eye_dir`: the axis of the cone for a body with heading 0.
    pub eye_ax: Vec<f32>,
    pub eye_ay: Vec<f32>,
    /// The cosine of the half angle.
    pub eye_cos: Vec<f32>,
    pub eye_size: Vec<f32>,
}

impl Default for Creatures {
    fn default() -> Creatures {
        let n = MAX_CREATURES as usize;
        let floats = || vec![0.0; n];
        Creatures {
            slots: Slots::new(MAX_CREATURES),
            uid: vec![0; n],
            x: floats(),
            y: floats(),
            vx: floats(),
            vy: floats(),
            heading: floats(),
            hc: floats(),
            hs: floats(),
            omega: floats(),
            cmd_thrust: floats(),
            cmd_turn: floats(),
            growth: floats(),
            energy: floats(),
            age: vec![0; n],
            generation: vec![0; n],
            parent: vec![0; n],
            mark: vec![0; n],
            bud_cooldown: vec![0; n],
            len: floats(),
            wid: floats(),
            hue: floats(),
            egg: floats(),
            old: floats(),
            flag_push: floats(),
            flag_side: floats(),
            cilia: floats(),
            fin: floats(),
            filter: floats(),
            chemo: floats(),
            plain_sum: floats(),
            eye_sum: floats(),
            n_eyes: vec![0; n],
            eye_dir: vec![0.0; n * MAX_EYES],
            eye_ax: vec![0.0; n * MAX_EYES],
            eye_ay: vec![0.0; n * MAX_EYES],
            eye_cos: vec![0.0; n * MAX_EYES],
            eye_size: vec![0.0; n * MAX_EYES],
        }
    }
}

/// How much of a part's size pushes along the body: 0 from the nose to the middle, 1 at the tail.
pub fn push_of(anchor: f32) -> f32 {
    let back = (2.0 * anchor - 1.0).max(0.0);
    back * back
}

/// How much of a part's size works across the body: 1 at the middle, 0 at the nose and the tail.
pub fn side_of(anchor: f32) -> f32 {
    4.0 * anchor * (1.0 - anchor)
}

/// `(1 + part_mass * part_sum) / (1 + part_mass * REF_PARTS)`: the weight of a body's parts
/// against those of the reference body.
pub fn heft(part_sum: f32, part_mass: f32) -> f32 {
    (1.0 + part_mass * part_sum) / (1.0 + part_mass * REF_PARTS)
}

/// The radius of the circle that stands for a body in a push, a bite, and a birth: the mean of
/// its two half axes.
pub fn radius(length: f32, width: f32) -> f32 {
    (length + width) / 4.0
}

/// The values of `a` at the live slots, in slot order.
fn gather<T: Copy>(live: &[u32], a: &[T]) -> Vec<T> {
    live.iter().map(|&s| a[s as usize]).collect()
}

/// Puts one value into `a` at each live slot. `Invalid` unless there is one value per live slot.
fn scatter<T>(live: &[u32], values: Vec<T>, a: &mut [T]) -> Result<(), LoadError> {
    if values.len() != live.len() {
        return Err(LoadError::Invalid("creature field length"));
    }
    for (&s, v) in live.iter().zip(values) {
        a[s as usize] = v;
    }
    Ok(())
}

impl Creatures {
    /// Sets every expressed array of the slot from the genome. Never panics, for any genome. Eye
    /// cones past `MAX_EYES` are not made, and their genes still count in `eye_sum`.
    ///
    /// A loaded genome can hold any float. A part value that is not finite counts as 0, and each
    /// one is held in 0 to 1, so every sum here is finite. `Genome::part_sum` counts a size the
    /// same way.
    pub fn express(&mut self, s: usize, g: &Genome) {
        (self.len[s], self.wid[s], self.hue[s]) = (g.len, g.wid, g.hue);
        (self.egg[s], self.old[s]) = (g.egg, g.old);
        let unit = |v: f32| {
            if v.is_finite() {
                v.clamp(0.0, 1.0)
            } else {
                0.0
            }
        };
        let (mut flag_push, mut flag_side) = (0.0, 0.0);
        let (mut cilia, mut fin, mut filter, mut chemo) = (0.0, 0.0, 0.0, 0.0);
        let (mut plain_sum, mut eye_sum, mut cones) = (0.0, 0.0, 0);
        for part in &g.parts {
            let (anchor, size, extra) = (unit(part.anchor), unit(part.size), unit(part.extra));
            if part.kind != KIND_EYE {
                plain_sum += size;
            }
            match part.kind {
                KIND_FLAGELLUM => {
                    flag_push += size * push_of(anchor);
                    flag_side += size * side_of(anchor);
                }
                KIND_CILIA => cilia += size,
                KIND_FIN => fin += size,
                KIND_FILTER => filter += size,
                KIND_CHEMO => chemo += size,
                KIND_EYE => {
                    eye_sum += size;
                    let (dir, half) = (anchor * PI, EYE_HALF_MIN + EYE_HALF_SPAN * extra);
                    // An eye on the midline is one cone. Any other eye is a pair.
                    let midline = anchor == 0.0 || anchor == 1.0;
                    for dir in [dir, -dir].into_iter().take(if midline { 1 } else { 2 }) {
                        if cones < MAX_EYES {
                            let k = s * MAX_EYES + cones;
                            self.eye_dir[k] = dir;
                            (self.eye_ay[k], self.eye_ax[k]) = sin_cos(dir);
                            self.eye_cos[k] = sin_cos(half).1;
                            self.eye_size[k] = size;
                            cones += 1;
                        }
                    }
                }
                _ => {}
            }
        }
        (self.flag_push[s], self.flag_side[s]) = (flag_push, flag_side);
        (self.cilia[s], self.fin[s]) = (cilia, fin);
        (self.filter[s], self.chemo[s]) = (filter, chemo);
        (self.plain_sum[s], self.eye_sum[s]) = (plain_sum, eye_sum);
        self.n_eyes[s] = cones as u8;
    }

    pub fn length(&self, s: usize) -> f32 {
        self.len[s] * self.growth[s]
    }

    pub fn width(&self, s: usize) -> f32 {
        self.len[s] * self.wid[s] * self.growth[s]
    }

    pub fn area(&self, s: usize) -> f32 {
        self.length(s) * self.width(s)
    }

    pub fn radius(&self, s: usize) -> f32 {
        radius(self.length(s), self.width(s))
    }

    /// How far cone `k` of the body sees, in world units: `eye_range * size * length` of the body
    /// as it has grown, and at most `EYE_REACH`. `eye::see` scans this far and `frame::write` sends
    /// this number to the page, so the cone that the player sees is the cone that the eye scans.
    pub fn cone_range(&self, s: usize, k: usize, eye_range: f32) -> f32 {
        (eye_range * self.eye_size[s * MAX_EYES + k] * self.length(s)).min(EYE_REACH)
    }

    /// The part sizes as the upkeep and the mass count them: an eye's size is times `eye_cost`.
    pub fn part_sum(&self, s: usize, eye_cost: f32) -> f32 {
        self.plain_sum[s] + eye_cost * self.eye_sum[s]
    }

    /// The area times the `heft` of the parts. The reference body has a mass equal to its area.
    pub fn mass(&self, s: usize, part_mass: f32, eye_cost: f32) -> f32 {
        self.area(s) * heft(self.part_sum(s, eye_cost), part_mass)
    }

    /// Energy as a share of capacity. Capacity is `energy_per_mass * area`: parts are not stores.
    pub fn energy01(&self, s: usize, energy_per_mass: f32) -> f32 {
        self.energy[s] / (energy_per_mass * self.area(s))
    }

    /// The live slot indices in ascending order, then each field for those slots in the same order.
    /// The fields are in the order of the struct. `hc`, `hs`, and what `express` makes are left out.
    pub fn save(&self, w: &mut Writer) {
        let live: Vec<u32> = (0..self.slots.high_water())
            .filter(|&s| self.slots.is_alive(s))
            .collect();
        w.u32s(&live);
        w.u32s(&gather(&live, &self.uid));
        w.f32s(&gather(&live, &self.x));
        w.f32s(&gather(&live, &self.y));
        w.f32s(&gather(&live, &self.vx));
        w.f32s(&gather(&live, &self.vy));
        w.f32s(&gather(&live, &self.heading));
        w.f32s(&gather(&live, &self.omega));
        w.f32s(&gather(&live, &self.cmd_thrust));
        w.f32s(&gather(&live, &self.cmd_turn));
        w.f32s(&gather(&live, &self.growth));
        w.f32s(&gather(&live, &self.energy));
        w.u32s(&gather(&live, &self.age));
        w.u32s(&gather(&live, &self.generation));
        w.u32s(&gather(&live, &self.parent));
        w.u8s(&gather(&live, &self.mark));
        w.u32s(&gather(&live, &self.bud_cooldown));
    }

    /// Reads what `save` wrote. The slot list must be strictly ascending and below capacity, every
    /// field must have one value per listed slot, every uid must be above 0 and unique, and every
    /// parent uid must be below the uid of its child. The float values are not checked. The caller
    /// calls `express` for each live slot.
    pub fn load(r: &mut Reader) -> Result<Creatures, LoadError> {
        let live = r.u32s()?;
        if live.windows(2).any(|p| p[0] >= p[1]) {
            return Err(LoadError::Invalid("creature slots not ascending"));
        }
        if live.last().is_some_and(|&s| s >= MAX_CREATURES) {
            return Err(LoadError::Invalid("creature slot past capacity"));
        }
        let mut c = Creatures::default();
        for &s in &live {
            c.slots.mark_alive(s);
        }
        scatter(&live, r.u32s()?, &mut c.uid)?;
        let mut sorted = gather(&live, &c.uid);
        sorted.sort_unstable();
        if sorted.first() == Some(&0) {
            return Err(LoadError::Invalid("creature uid of 0"));
        }
        if sorted.windows(2).any(|p| p[0] == p[1]) {
            return Err(LoadError::Invalid("creature uid repeats"));
        }
        scatter(&live, r.f32s()?, &mut c.x)?;
        scatter(&live, r.f32s()?, &mut c.y)?;
        scatter(&live, r.f32s()?, &mut c.vx)?;
        scatter(&live, r.f32s()?, &mut c.vy)?;
        scatter(&live, r.f32s()?, &mut c.heading)?;
        scatter(&live, r.f32s()?, &mut c.omega)?;
        scatter(&live, r.f32s()?, &mut c.cmd_thrust)?;
        scatter(&live, r.f32s()?, &mut c.cmd_turn)?;
        scatter(&live, r.f32s()?, &mut c.growth)?;
        scatter(&live, r.f32s()?, &mut c.energy)?;
        scatter(&live, r.u32s()?, &mut c.age)?;
        scatter(&live, r.u32s()?, &mut c.generation)?;
        scatter(&live, r.u32s()?, &mut c.parent)?;
        scatter(&live, r.u8s()?, &mut c.mark)?;
        scatter(&live, r.u32s()?, &mut c.bud_cooldown)?;
        for &s in &live {
            let s = s as usize;
            // A uid is given out in birth order, so a parent has a lower uid than its child.
            if c.parent[s] >= c.uid[s] {
                return Err(LoadError::Invalid("creature parent not below its uid"));
            }
            (c.hs[s], c.hc[s]) = sin_cos(c.heading[s]);
        }
        Ok(c)
    }
}
