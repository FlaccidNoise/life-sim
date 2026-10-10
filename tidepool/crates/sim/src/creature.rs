//! Creature arrays. One index per slot. A dead slot holds stale values.

use crate::pool::Slots;
use crate::snapshot::Writer;

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
}
