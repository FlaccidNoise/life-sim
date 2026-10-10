//! Counters, and the readings that the page and the gates ask for by key.

use crate::creature::MARK_LINEAGE;
use crate::params::id;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

pub const STAT_CREATURES: u32 = 0;
pub const STAT_PLANTS: u32 = 1;
/// Total since the world began.
pub const STAT_BIRTHS: u32 = 2;
pub const STAT_DEATHS: u32 = 3;
/// Among the living.
pub const STAT_MAX_GENERATION: u32 = 4;
pub const STAT_MEAN_ENERGY01: u32 = 5;
/// Living creatures with the player lineage mark.
pub const STAT_LINEAGE_ALIVE: u32 = 6;

/// Saved.
#[derive(Default)]
pub struct Stats {
    pub births: u64,
    pub deaths: u64,
    /// Energy that creatures took from plants.
    pub eaten: f64,
}

impl Stats {
    pub fn save(&self, w: &mut Writer) {
        w.u64(self.births);
        w.u64(self.deaths);
        w.u64(self.eaten.to_bits());
    }

    pub fn load(r: &mut Reader) -> Result<Stats, LoadError> {
        Ok(Stats {
            births: r.u64()?,
            deaths: r.u64()?,
            eaten: f64::from_bits(r.u64()?),
        })
    }
}

impl World {
    /// An unknown `k` returns -1.
    pub fn stat(&self, k: u32) -> f64 {
        let c = &self.creatures;
        let live = || (0..c.slots.high_water() as usize).filter(|&s| c.slots.is_alive(s as u32));
        match k {
            STAT_CREATURES => c.slots.count() as f64,
            STAT_PLANTS => self.plants.slots.count() as f64,
            STAT_BIRTHS => self.stats.births as f64,
            STAT_DEATHS => self.stats.deaths as f64,
            STAT_MAX_GENERATION => live().map(|s| c.generation[s]).max().unwrap_or(0) as f64,
            STAT_MEAN_ENERGY01 => {
                let per_mass = self.params.get(id::ENERGY_PER_MASS);
                let sum: f64 = live().map(|s| c.energy01(s, per_mass) as f64).sum();
                sum / c.slots.count().max(1) as f64
            }
            STAT_LINEAGE_ALIVE => live().filter(|&s| c.mark[s] & MARK_LINEAGE != 0).count() as f64,
            _ => -1.0,
        }
    }
}
