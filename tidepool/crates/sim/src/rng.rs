//! Seeded generator: splitmix64. One stream per subsystem, made with `fork`.

use crate::snapshot::{LoadError, Reader, Writer};

const GOLDEN: u64 = 0x9E37_79B9_7F4A_7C15;

fn mix(mut z: u64) -> u64 {
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

#[derive(Clone)]
pub struct Rng(pub u64);

impl Rng {
    pub fn new(seed: u64) -> Rng {
        Rng(seed)
    }

    pub fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(GOLDEN);
        mix(self.0)
    }

    /// In `[0, 1)`, 24 bits.
    pub fn unit(&mut self) -> f32 {
        (self.next_u64() >> 40) as f32 / 16_777_216.0
    }

    pub fn range(&mut self, lo: f32, hi: f32) -> f32 {
        lo + (hi - lo) * self.unit()
    }

    /// In `[0, n)`.
    pub fn below(&mut self, n: u32) -> u32 {
        (((self.next_u64() >> 32) * n as u64) >> 32) as u32
    }

    /// Sum of four uniforms, scaled to unit variance. No transcendentals.
    pub fn gauss(&mut self) -> f32 {
        (self.unit() + self.unit() + self.unit() + self.unit() - 2.0) * 1.732_050_8
    }

    /// An independent stream. Does not advance `self`.
    pub fn fork(&self, tag: u64) -> Rng {
        Rng(mix(self.0 ^ mix(tag.wrapping_add(GOLDEN))))
    }

    /// The low word, then the high word.
    pub fn save(&self, w: &mut Writer) {
        w.u32(self.0 as u32);
        w.u32((self.0 >> 32) as u32);
    }

    pub fn load(r: &mut Reader) -> Result<Rng, LoadError> {
        let (lo, hi) = (r.u32()?, r.u32()?);
        Ok(Rng(lo as u64 | (hi as u64) << 32))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fork_is_independent_and_does_not_advance_parent() {
        let a = Rng::new(7);
        let mut f1 = a.fork(1);
        let mut f2 = a.fork(2);
        let mut again = a.fork(1);
        assert_ne!(f1.next_u64(), f2.next_u64());
        let mut f1b = a.fork(1);
        assert_eq!(f1b.next_u64(), again.next_u64());
    }

    #[test]
    fn gauss_has_unit_variance() {
        let mut r = Rng::new(1);
        let n = 100_000;
        let (mut sum, mut sq) = (0.0f64, 0.0f64);
        for _ in 0..n {
            let g = r.gauss() as f64;
            sum += g;
            sq += g * g;
        }
        let mean = sum / n as f64;
        assert!(mean.abs() < 0.02);
        assert!((sq / n as f64 - mean * mean - 1.0).abs() < 0.03);
    }
}
