/**
 * DAY/NIGHT + SEASONS cycle module (§4.1, §10 R1).
 *
 * Pure deterministic functions of (tick, config params) — no state, no RNG, no
 * allocations. All return values are in [0, 1] unless otherwise noted.
 *
 * SELECTION-GRADIENT RATIONALE (§4.1 / §10 R1):
 *   Night drops photosynthesis to ~0, creating a temporal scarcity that punishes
 *   monocultures timed to a single peak. A pure-photo ecosystem optimized for
 *   noon would starve at midnight — the cycle is the anti-monoculture gradient
 *   in the TIME dimension, complementing the patchy SPATIAL gradient in LightField.
 *
 *   Seasons shift the baseline light amplitude over long periods, so a strategy
 *   that works in "summer" may fail in "winter." This adds a second, slower
 *   selection pressure orthogonal to the day/night rhythm.
 */

// ---------------------------------------------------------------------------
// Raw sinusoidal helpers (internal)
// ---------------------------------------------------------------------------

/** Raw day/night sinusoid: 1 = midday, 0 = midnight. Not depth-adjusted. */
function rawDay(tick: number, dayLength: number): number {
  return (1 + Math.sin((2 * Math.PI * tick) / dayLength)) / 2;
}

/** Raw season sinusoid: 1 = peak summer, 0 = peak winter. Not depth-adjusted. */
function rawSeason(tick: number, seasonLength: number): number {
  return (1 + Math.sin((2 * Math.PI * tick) / seasonLength)) / 2;
}

/** Apply depth: depth=0 → returns 1 (flat, no variation). depth=1 → returns raw. */
function applyDepth(raw: number, depth: number): number {
  return 1 - depth * (1 - raw);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Day/night fraction in [0, 1].
 *
 * `dayNightDepth` ∈ [0, 1] controls the swing:
 *   - depth = 0 → always 1 (eternal noon, no night pressure)
 *   - depth = 1 → full 0..1 sinusoidal swing (midnight ≈ 0)
 *   - depth = 0.6 → nights dim to ~0.4, retaining some ambient glow
 *
 * The underlying curve is `(1 + sin(2π·tick / dayLength)) / 2`.
 */
export function dayFraction(tick: number, dayLength: number, dayNightDepth: number): number {
  return applyDepth(rawDay(tick, dayLength), dayNightDepth);
}

/**
 * Season fraction in [0, 1].
 *
 * Same shape as dayFraction but with a much longer period (e.g. 12000 ticks).
 * 1 = peak summer, 0 = peak winter.
 */
export function seasonFraction(tick: number, seasonLength: number): number {
  return rawSeason(tick, seasonLength);
}

/**
 * Combined day/night + seasons light multiplier ∈ [0, ~1].
 *
 * Computed as `dayFraction * seasonFraction` (both depth-adjusted independently)
 * and clamped to [0, 1 + ε] to tolerate floating-point rounding above 1.
 *
 * This is the single scalar that metabolism should multiply into its photoGain
 * each tick — no per-cell state, no allocations.
 *
 * @param tick          current simulation tick
 * @param dayLength     ticks per full day/night cycle (e.g. 600)
 * @param dayNightDepth depth of the day/night swing [0, 1]
 * @param seasonLength  ticks per full season cycle (e.g. 12000)
 * @param seasonDepth   depth of the seasonal swing [0, 1]
 */
export function lightMultiplier(
  tick: number,
  dayLength: number,
  dayNightDepth: number,
  seasonLength: number,
  seasonDepth: number,
): number {
  const day = applyDepth(rawDay(tick, dayLength), dayNightDepth);
  const season = applyDepth(rawSeason(tick, seasonLength), seasonDepth);
  const m = day * season;
  // Clamp: day*season ∈ [0, 1] mathematically but FP may overshoot slightly.
  return m < 0 ? 0 : m > 1 ? 1 : m;
}

/**
 * Ambient light scalar ∈ [0, 1] that a SENSOR cell can read.
 *
 * Peak at midday (= 1), dimmest at midnight (= 1 - dayNightDepth). Season is
 * intentionally NOT included — the sensor reads the instantaneous light level,
 * and season modulation is already baked into the metabolism multiplier.
 * Pure function of (tick, config), no allocations.
 */
export function ambientLight(tick: number, dayLength: number, dayNightDepth: number): number {
  return applyDepth(rawDay(tick, dayLength), dayNightDepth);
}