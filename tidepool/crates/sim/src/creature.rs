//! Creature arrays. One index per slot. A dead slot holds stale values.

use crate::pool::Slots;
use crate::snapshot::{LoadError, Reader, Writer};

pub const MAX_CREATURES: u32 = 4096;

pub struct Creatures {
    pub slots: Slots,
    pub uid: Vec<u32>,
    pub x: Vec<f32>,
    pub y: Vec<f32>,
    pub vx: Vec<f32>,
    pub vy: Vec<f32>,
    pub radius: Vec<f32>,
}

impl Default for Creatures {
    fn default() -> Creatures {
        let n = MAX_CREATURES as usize;
        Creatures {
            slots: Slots::new(MAX_CREATURES),
            uid: vec![0; n],
            x: vec![0.0; n],
            y: vec![0.0; n],
            vx: vec![0.0; n],
            vy: vec![0.0; n],
            radius: vec![0.0; n],
        }
    }
}

impl Creatures {
    /// The live slot indices in ascending order, then each field for those slots in the same order.
    pub fn save(&self, w: &mut Writer) {
        let live: Vec<u32> = (0..self.slots.high_water())
            .filter(|&s| self.slots.is_alive(s))
            .collect();
        let f32s = |w: &mut Writer, a: &[f32]| {
            w.f32s(&live.iter().map(|&s| a[s as usize]).collect::<Vec<_>>())
        };
        w.u32s(&live);
        w.u32s(
            &live
                .iter()
                .map(|&s| self.uid[s as usize])
                .collect::<Vec<_>>(),
        );
        f32s(w, &self.x);
        f32s(w, &self.y);
        f32s(w, &self.vx);
        f32s(w, &self.vy);
        f32s(w, &self.radius);
    }

    /// Reads what `save` wrote. The slot list must be strictly ascending and below capacity, and
    /// every field must have one value per listed slot.
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
        let sized = |n: usize| {
            if n == live.len() {
                Ok(())
            } else {
                Err(LoadError::Invalid("creature field length"))
            }
        };
        let f32s = |r: &mut Reader, a: &mut [f32]| {
            let v = r.f32s()?;
            sized(v.len())?;
            for (&s, x) in live.iter().zip(v) {
                a[s as usize] = x;
            }
            Ok(())
        };
        let uid = r.u32s()?;
        sized(uid.len())?;
        for (&s, u) in live.iter().zip(uid) {
            c.uid[s as usize] = u;
        }
        f32s(r, &mut c.x)?;
        f32s(r, &mut c.y)?;
        f32s(r, &mut c.vx)?;
        f32s(r, &mut c.vy)?;
        f32s(r, &mut c.radius)?;
        Ok(c)
    }
}
