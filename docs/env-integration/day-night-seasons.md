# Day/Night + Seasons Integration Contract

**Module:** `src/core/environment/cycle.ts`
**Date:** 2025-06-17
**Status:** Ready for integration

---

## 1. New Config Fields

Add these to the global `Config` type (currently in `src/core/sim/config.ts`):

| Field | Type | Default | Meaning |
|---|---|---|---|
| `dayLength` | `number` | `600` | Ticks per full day/night cycle |
| `dayNightDepth` | `number` | `0.6` | Day/night swing depth [0, 1]; 0 = eternal noon, 1 = full blackout at midnight |
| `seasonLength` | `number` | `12000` | Ticks per full season cycle |
| `seasonDepth` | `number` | `0.25` | Seasonal swing depth [0, 1]; 0 = no seasons |

Suggested defaults give a ~10-second day cycle at 60fps with a subtle 25% seasonal amplitude.

---

## 2. Metabolism Hook (Recommended Approach)

**File:** `src/core/sim/metabolism.ts`

The cleanest integration point is in `metabolize()`. Multiply the photosynthetic gain by `lightMultiplier`:

```ts
import { lightMultiplier } from '../environment/cycle';

// Inside metabolize(), where photoGain is applied:
const multiplier = lightMultiplier(
  tick, config.dayLength, config.dayNightDepth,
  config.seasonLength, config.seasonDepth,
);
photoGain *= multiplier;
```

This means **`metabolize()` gains one new parameter** (`tick: number`). It reads `config.dayLength` etc. from the existing `Config` argument.

**Why this hook?** It dims photosynthesis globally without touching the LightField's spatial pattern. The field keeps its patchy shape; night just scales the metabolic yield. This avoids rewriting the field regen logic and keeps concerns separated: `LightField` owns spatial heterogeneity, `cycle.ts` owns temporal heterogeneity.

**Alternative (not recommended):** Scale `LightField` regen target by the multiplier. This changes the field values permanently, which means spatial diffusion fights the temporal dimming — a complex interaction we don't want.

---

## 3. Ambient Light Sensor Channel

**File:** `src/core/cells/types.ts` (or wherever `SensorChannel` enum lives)

Add a new sensor channel:

```ts
AMBIENT_LIGHT = ?  // next available index
```

**File:** `src/core/sim/think.ts`

When a SENSOR cell reads the `AMBIENT_LIGHT` channel, inject:

```ts
import { ambientLight } from '../environment/cycle';

// In the sensor read path:
if (channel === SensorChannel.AMBIENT_LIGHT) {
  value = ambientLight(tick, config.dayLength, config.dayNightDepth);
}
```

This is a scalar (one float), not a position-dependent field read. It represents the global light level at the cell's location at the current tick.

---

## 4. main.ts HUD + Render

**File:** `src/core/sim/main.ts`

### HUD line

Add a status line showing the current time-of-day and season:

```
Day 42  ☀️ Noon     🌱 Summer
Day 42  🌙 Night    ❄️ Winter
```

Derive from `dayFraction` / `seasonFraction`:
- `dayFraction > 0.8` → "☀️ Noon"
- `dayFraction > 0.5` → "🌤 Day"
- `dayFraction > 0.2` → "🌅 Dusk/Dawn"
- else → "🌙 Night"

### Speed control keys

- `[` / `]` → halve / double `dayLength` (speed up / slow down the cycle)
- `{` / `}` → halve / double `seasonLength`

These directly mutate `config.dayLength` / `config.seasonLength` at runtime.

### Background dimming (optional)

Multiply the render background color by `lightMultiplier` so the world visually darkens. This is cosmetic — the metabolic effect is already applied.

---

## 5. Determinism Guarantee

`lightMultiplier`, `dayFraction`, `seasonFraction`, and `ambientLight` are **pure functions** of `(tick, config params)`. They use only `Math.sin` (no `Math.random`, no `Date`, no external state). Given the same tick and config, the output is **byte-identical** across runs and machines — safe for the deterministic replay contract.

No allocations occur in any of these functions (no arrays, no objects, only stack-allocated numbers).

---

## 6. File Checklist

Files created by the cycle module:

| File | Purpose |
|---|---|
| `src/core/environment/cycle.ts` | Pure functions: `dayFraction`, `seasonFraction`, `lightMultiplier`, `ambientLight` |
| `src/core/environment/cycle.test.ts` | vitest unit tests |
| `docs/env-integration/day-night-seasons.md` | This contract |

Files that need edits (by the integrator, NOT by the cycle module author):

| File | Edit |
|---|---|
| `src/core/sim/config.ts` | Add 4 config fields |
| `src/core/sim/metabolism.ts` | Pass `tick` + multiply photoGain by `lightMultiplier` |
| `src/core/cells/types.ts` | Add `AMBIENT_LIGHT` sensor channel |
| `src/core/sim/think.ts` | Inject `ambientLight` scalar for the channel |
| `src/core/sim/main.ts` | HUD line + speed keys + optional background dimming |