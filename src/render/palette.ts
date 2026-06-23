/**
 * Palette — the ONE source of truth for the sim's categorical color ramps. Before this, the
 * green→red diet ramp was hand-rolled three inconsistent ways (the dot shader's HSV lerp, the
 * distributions panel's blue-pinned RGB lerp, the legend's two HSL swatches) — none matched and the
 * middle of each went muddy olive. Everything visual now derives from here:
 *
 *   - dietHue/dietColor — trophic role ramp (green herbivore → amber omnivore → red predator), vivid
 *     through the middle because saturation/value stay high (the old muddiness was a dim/grey middle,
 *     not the hue);
 *   - lineageColor — the heritable `hue` gene over the full wheel (kin identity → diversity at a glance);
 *   - energyColor — a heat ramp over a creature's own energy band (starving red → satiated green);
 *   - fieldColor — a stable, perceptually-spread hue per distribution field (golden-angle), so every
 *     histogram reads as its own color instead of one flat blue.
 *
 * The dot shader (renderer.ts) re-implements dietHue + the energy ramp in GLSL; the control points
 * below are canonical and palette.test.ts pins the JS endpoints so the two can't silently drift.
 * Pure functions, no allocation concerns (called off the hot path — panels + legend only).
 */

export type RGB = [number, number, number];

/** HSV→RGB, h/s/v ∈ [0,1], result bytes ∈ [0,255]. Matches the GLSL hsv2rgb in renderer.ts. */
export function hsv2rgb(h: number, s: number, v: number): RGB {
  const r = Math.abs(((h * 6 + 6) % 6) - 3) - 1;
  const g = Math.abs(((h * 6 + 4) % 6) - 3) - 1;
  const b = Math.abs(((h * 6 + 2) % 6) - 3) - 1;
  const cl = (x: number): number => Math.min(1, Math.max(0, x));
  return [
    Math.round(255 * v * (1 - s + s * cl(r))),
    Math.round(255 * v * (1 - s + s * cl(g))),
    Math.round(255 * v * (1 - s + s * cl(b))),
  ];
}

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** `rgb(r,g,b)` string for a 2D-canvas / CSS fill. */
export function rgbCss(c: RGB): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ── Diet (trophic role) ramp ──────────────────────────────────────────────────────────────────
// Canonical control points (HSV hue): green herbivore → gold/amber omnivore → red predator. The
// amber midpoint (0.11, not the linear 0.165 chartreuse) is what keeps an omnivore reading as a
// distinct warm color rather than washed-out yellow-green. GLSL mirrors these exact values.
export const DIET_HUE_HERB = 0.33;
export const DIET_HUE_OMNI = 0.11;
export const DIET_HUE_PRED = 0.0;

/** Eased trophic hue: 0 (herbivore, green) → 0.5 (omnivore, amber) → 1 (predator, red). */
export function dietHue(t: number): number {
  t = clamp01(t);
  return t < 0.5
    ? lerp(DIET_HUE_HERB, DIET_HUE_OMNI, t / 0.5)
    : lerp(DIET_HUE_OMNI, DIET_HUE_PRED, (t - 0.5) / 0.5);
}

/** Vivid full-saturation trophic color for 2D panels + legend (high s/v → no muddy middle). */
export function dietColor(t: number): RGB {
  return hsv2rgb(dietHue(t), 0.85, 0.95);
}

// ── Trophic role buckets ──────────────────────────────────────────────────────────────────────
// Maps the continuous DIET gene to the discrete SHAPE channel (0 circle / 1 diamond / 2 triangle).
// Omnivore is a real middle band, not a single 0.5 cut, so generalists read as their own glyph.
export const DIET_OMNI_LO = 0.4;
export const DIET_OMNI_HI = 0.6;

/** 0 = herbivore (circle), 1 = omnivore (diamond), 2 = predator (triangle). */
export function dietShape(diet: number): 0 | 1 | 2 {
  if (diet < DIET_OMNI_LO) return 0;
  if (diet < DIET_OMNI_HI) return 1;
  return 2;
}

// ── Lineage (kin identity) ────────────────────────────────────────────────────────────────────
/** The heritable hue gene over the full color wheel — same hue ⇒ same lineage. */
export function lineageColor(hue: number): RGB {
  return hsv2rgb(hue - Math.floor(hue), 0.72, 0.95);
}

// ── Energy (behavioral band) heat ramp ────────────────────────────────────────────────────────
// efrac ∈ [0,1] = a creature's energy relative to its own satiated bar. Starving → red (alarm),
// reproductive → amber, satiated → green (healthy). Eased so the amber sits at the band midpoint.
export const ENERGY_HUE_STARVING = 0.0;
export const ENERGY_HUE_REPRO = 0.13;
export const ENERGY_HUE_SATIATED = 0.45;

/** Energy heat hue: 0 (starving, red) → 0.5 (reproductive, amber) → 1 (satiated, green). */
export function energyHue(efrac: number): number {
  efrac = clamp01(efrac);
  return efrac < 0.5
    ? lerp(ENERGY_HUE_STARVING, ENERGY_HUE_REPRO, efrac / 0.5)
    : lerp(ENERGY_HUE_REPRO, ENERGY_HUE_SATIATED, (efrac - 0.5) / 0.5);
}

/** Vivid energy color for 2D panels + legend. */
export function energyColor(efrac: number): RGB {
  return hsv2rgb(energyHue(efrac), 0.8, 0.95);
}

// ── Metabolic-efficiency saturation (freed from vision-range; see creature-visuals spec) ──────────
// Eye SIZE now carries vision range, so colour saturation is reassigned to METAB_EFF: efficient
// creatures are vivid, inefficient ones washed-out. `fear` (from diet) nudges the ceiling so
// predators read a touch more saturated. The Tier-0 GLSL mirrors this exact formula.
export const METAB_MIN = 0.5;
export const METAB_MAX = 1.5;

export function metabSaturation(metab: number, fear: number): number {
  return clamp01((fear > 0.5 ? 0.85 : 0.72) * (0.6 + 0.4 * ((metab - 0.5) * 2)));
}

// ── Distribution field hues ───────────────────────────────────────────────────────────────────
// A stable, perceptually-spread hue per field (golden-angle so adjacent indices look distinct).
// Keyed by the field's index in the registry, NOT its position in the selected set, so a field keeps
// its color no matter which others are shown.
const GOLDEN = 0.61803398875;

export function fieldHue(index: number): number {
  return (0.07 + index * GOLDEN) % 1;
}

/** Solid bar color for a non-diet histogram field. */
export function fieldColor(index: number): RGB {
  return hsv2rgb(fieldHue(index), 0.55, 0.92);
}
