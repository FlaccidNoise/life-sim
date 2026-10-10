//! Math that gives the same bits in native and in WASM. No standard-library transcendentals.

pub const PI: f32 = core::f32::consts::PI;
pub const TAU: f32 = core::f32::consts::TAU;
const HALF_PI: f32 = core::f32::consts::FRAC_PI_2;

/// Into `(-PI, PI]`. `%` is exact, so any finite input lands in range.
pub fn wrap_angle(a: f32) -> f32 {
    let r = a % TAU;
    if r > PI {
        r - TAU
    } else if r <= -PI {
        r + TAU
    } else {
        r
    }
}

fn sin(a: f32) -> f32 {
    let mut x = wrap_angle(a);
    if x > HALF_PI {
        x = PI - x;
    } else if x < -HALF_PI {
        x = -PI - x;
    }
    let x2 = x * x;
    x * (1.0 - x2 * (1.0 / 6.0 - x2 * (1.0 / 120.0 - x2 * (1.0 / 5040.0 - x2 * (1.0 / 362_880.0)))))
}

/// Polynomial sine and cosine. Max error under 1e-4.
pub fn sin_cos(a: f32) -> (f32, f32) {
    (sin(a), sin(a + HALF_PI))
}

/// Rational tanh, clamped to `[-3, 3]` so it reaches exactly plus or minus 1.
pub fn act(x: f32) -> f32 {
    let x = x.clamp(-3.0, 3.0);
    let x2 = x * x;
    x * (27.0 + x2) / (27.0 + 9.0 * x2)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sin_cos_is_close_to_std() {
        let mut a = -20.0f32;
        while a < 20.0 {
            let (s, c) = sin_cos(a);
            #[allow(clippy::disallowed_methods)]
            let (es, ec) = ((a as f64).sin() as f32, (a as f64).cos() as f32);
            assert!((s - es).abs() < 1e-4 && (c - ec).abs() < 1e-4, "at {a}");
            a += 0.01;
        }
    }

    #[test]
    fn act_is_odd_bounded_and_monotonic() {
        assert_eq!(act(0.0), 0.0);
        assert!((act(3.0) - 1.0).abs() < 1e-6 && (act(100.0) - 1.0).abs() < 1e-6);
        assert_eq!(act(-1.5), -act(1.5));
        assert!(act(0.5) < act(0.6));
    }
}
