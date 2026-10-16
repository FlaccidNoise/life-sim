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

/// `x` to the power 3/4, by two square roots. 0 for `x <= 0`.
pub fn pow075(x: f32) -> f32 {
    if x > 0.0 {
        let root = x.sqrt();
        root * root.sqrt()
    } else {
        0.0
    }
}

/// `x` to the power `k`, for `k` in steps of 0.25: `n = round(4k)` quarters. The whole part of
/// `n / 4` is a product of `x`, and the quarter left over is a square root or a fourth root by
/// square roots, so a whole `k` is exact. 1 for `n = 0`, for any `x`. 0 for `x <= 0` and `n > 0`.
pub fn pow_quarters(x: f32, k: f32) -> f32 {
    let n = (4.0 * k).round() as u32;
    if n == 0 {
        return 1.0;
    }
    if x <= 0.0 {
        return 0.0;
    }
    let half = x.sqrt();
    let mut v = match n % 4 {
        0 => 1.0,
        1 => half.sqrt(),
        2 => half,
        _ => half * half.sqrt(),
    };
    for _ in 0..n / 4 {
        v *= x;
    }
    v
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
    fn pow_quarters_is_exact_at_whole_and_half_powers() {
        let (r25, r5) = (0.25f32.sqrt(), 0.5f32.sqrt());
        assert_eq!(r25, 0.5);
        let cases = [
            // (x, k, x^k)
            (0.0, 0.0, 1.0),
            (0.25, 0.0, 1.0),
            (0.5, 0.0, 1.0),
            (1.0, 0.0, 1.0),
            (0.0, 1.0, 0.0),
            (0.25, 1.0, 0.25),
            (0.5, 1.0, 0.5),
            (1.0, 1.0, 1.0),
            (0.0, 1.5, 0.0),
            (0.25, 1.5, 0.125),
            (0.5, 1.5, 0.5 * r5),
            (1.0, 1.5, 1.0),
            (0.0, 2.5, 0.0),
            (0.25, 2.5, 0.03125),
            (0.5, 2.5, 0.25 * r5),
            (1.0, 2.5, 1.0),
        ];
        for (x, k, want) in cases {
            assert_eq!(pow_quarters(x, k), want, "{x}^{k}");
        }
    }

    #[test]
    #[allow(clippy::disallowed_methods)]
    fn pow_quarters_is_close_to_std_at_every_quarter() {
        for q in 0..=16 {
            let k = q as f32 / 4.0;
            for i in 0..=100 {
                let x = i as f32 / 100.0;
                let want = (x as f64).powf(k as f64) as f32;
                assert!((pow_quarters(x, k) - want).abs() < 1e-6, "{x}^{k}");
            }
        }
        assert_eq!(pow_quarters(-1.0, 1.5), 0.0);
    }

    #[test]
    fn act_is_odd_bounded_and_monotonic() {
        assert_eq!(act(0.0), 0.0);
        assert!((act(3.0) - 1.0).abs() < 1e-6 && (act(100.0) - 1.0).abs() < 1e-6);
        assert_eq!(act(-1.5), -act(1.5));
        assert!(act(0.5) < act(0.6));
    }
}
