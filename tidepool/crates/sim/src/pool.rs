//! Slot allocator for a fixed-capacity pool. `alloc` gives the lowest free slot, so slot order is
//! deterministic.

pub struct Slots {
    alive: Vec<u64>,
    count: u32,
    capacity: u32,
    high_water: u32,
}

impl Slots {
    pub fn new(capacity: u32) -> Slots {
        Slots {
            alive: vec![0; capacity.div_ceil(64) as usize],
            count: 0,
            capacity,
            high_water: 0,
        }
    }

    /// The lowest free slot.
    pub fn alloc(&mut self) -> Option<u32> {
        let word = self.alive.iter().position(|&w| w != u64::MAX)?;
        let bit = self.alive[word].trailing_ones();
        let slot = word as u32 * 64 + bit;
        if slot >= self.capacity {
            return None;
        }
        self.alive[word] |= 1 << bit;
        self.count += 1;
        self.high_water = self.high_water.max(slot + 1);
        Some(slot)
    }

    pub fn free(&mut self, slot: u32) {
        debug_assert!(self.is_alive(slot));
        self.alive[slot as usize / 64] &= !(1 << (slot % 64));
        self.count -= 1;
    }

    /// Marks a free slot below `capacity` as alive. For `load`, which rebuilds the pool slot by slot.
    pub fn mark_alive(&mut self, slot: u32) {
        debug_assert!(slot < self.capacity && !self.is_alive(slot));
        self.alive[slot as usize / 64] |= 1 << (slot % 64);
        self.count += 1;
        self.high_water = self.high_water.max(slot + 1);
    }

    pub fn is_alive(&self, slot: u32) -> bool {
        self.alive[slot as usize / 64] >> (slot % 64) & 1 == 1
    }

    pub fn count(&self) -> u32 {
        self.count
    }

    pub fn capacity(&self) -> u32 {
        self.capacity
    }

    /// One past the highest slot ever allocated.
    pub fn high_water(&self) -> u32 {
        self.high_water
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alloc_returns_lowest_free_slot() {
        let mut s = Slots::new(8);
        assert_eq!(
            (s.alloc(), s.alloc(), s.alloc()),
            (Some(0), Some(1), Some(2))
        );
        s.free(1);
        assert_eq!(s.alloc(), Some(1));
        assert_eq!(s.count(), 3);
    }

    #[test]
    fn alloc_fails_when_full() {
        let mut s = Slots::new(2);
        s.alloc();
        s.alloc();
        assert_eq!(s.alloc(), None);
    }
}
