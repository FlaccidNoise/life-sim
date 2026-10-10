//! Creature arrays. One index per slot. A dead slot holds stale values, except `uid`, which is 0.

use crate::genome::GENE_RANGE;
use crate::math::sin_cos;
use crate::pool::Slots;
use crate::snapshot::{LoadError, Reader, Writer};

pub const MAX_CREATURES: u32 = 4096;
/// The radius of the largest adult the gene ranges allow. Sets the neighbour search box.
pub const MAX_RADIUS: f32 = GENE_RANGE[0].1 * (1.0 + GENE_RANGE[1].1) / 4.0;
/// Bit 0 of `mark`: the creature is in the player's lineage.
pub const MARK_LINEAGE: u8 = 1;

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
    /// From `birth_growth` to 1.
    pub growth: Vec<f32>,
    pub energy: Vec<f32>,
    pub age: Vec<u32>,
    pub generation: Vec<u32>,
    /// The uid of the budding parent. 0 for a founder.
    pub parent: Vec<u32>,
    pub mark: Vec<u8>,
    pub bud_cooldown: Vec<u32>,
    // Set from the genome at birth.
    pub len: Vec<f32>,
    pub wid: Vec<f32>,
    pub flagellum: Vec<f32>,
    pub cilia: Vec<f32>,
    pub filter: Vec<f32>,
    pub chemo: Vec<f32>,
    pub hue: Vec<f32>,
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
            flagellum: floats(),
            cilia: floats(),
            filter: floats(),
            chemo: floats(),
            hue: floats(),
        }
    }
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
    pub fn length(&self, s: usize) -> f32 {
        self.len[s] * self.growth[s]
    }

    pub fn width(&self, s: usize) -> f32 {
        self.len[s] * self.wid[s] * self.growth[s]
    }

    pub fn mass(&self, s: usize) -> f32 {
        self.length(s) * self.width(s)
    }

    pub fn radius(&self, s: usize) -> f32 {
        (self.length(s) + self.width(s)) / 4.0
    }

    /// Energy as a share of capacity. Capacity is `energy_per_mass * mass`.
    pub fn energy01(&self, s: usize, energy_per_mass: f32) -> f32 {
        self.energy[s] / (energy_per_mass * self.mass(s))
    }

    /// The live slot indices in ascending order, then each field for those slots in the same order.
    /// The fields are in the order of the struct. `hc` and `hs` are left out.
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
        w.f32s(&gather(&live, &self.len));
        w.f32s(&gather(&live, &self.wid));
        w.f32s(&gather(&live, &self.flagellum));
        w.f32s(&gather(&live, &self.cilia));
        w.f32s(&gather(&live, &self.filter));
        w.f32s(&gather(&live, &self.chemo));
        w.f32s(&gather(&live, &self.hue));
    }

    /// Reads what `save` wrote. The slot list must be strictly ascending and below capacity, every
    /// field must have one value per listed slot, every uid must be above 0 and unique, and every
    /// parent uid must be below the uid of its child. The float values are not checked.
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
        scatter(&live, r.f32s()?, &mut c.len)?;
        scatter(&live, r.f32s()?, &mut c.wid)?;
        scatter(&live, r.f32s()?, &mut c.flagellum)?;
        scatter(&live, r.f32s()?, &mut c.cilia)?;
        scatter(&live, r.f32s()?, &mut c.filter)?;
        scatter(&live, r.f32s()?, &mut c.chemo)?;
        scatter(&live, r.f32s()?, &mut c.hue)?;
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
