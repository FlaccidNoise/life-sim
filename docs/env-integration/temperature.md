# Temperature Integration Contract

`TemperatureField` is a spatial temperature gradient that modulates cellular
metabolism, forcing local adaptation → spatial divergence → speciation (§4.1,
§10 R1). This document defines its configuration, wiring, and the metabolism
hook contract for implementers.

## Config Fields

All values go into the environment config section alongside existing light/food
config. Namespaced `temp` to avoid collision.

| Field             | Type   | Default | Description                                       |
| ----------------- | ------ | ------- | ------------------------------------------------- |
| `tempGridCols`    | number | 64      | Temperature grid columns                           |
| `tempGridRows`    | number | 64      | Temperature grid rows                              |
| `tempPatchCount`  | number | 20      | Number of Gaussian warm/cool patches               |
| `tempPatchRadius` | number | 8       | Patch radius in grid cells                         |
| `tempMin`         | number | 5       | Minimum temperature (coldest patch floor)           |
| `tempMax`         | number | 40      | Maximum temperature (warmest patch ceiling)         |
| `tempDiffuse`     | number | 0.15    | Diffusion rate per tick ∈ [0, 0.25]               |
| `tempRegen`       | number | 0.1     | Relaxation rate toward climate capacity ∈ (0, 1]  |
| `tempComfortLow`  | number | 15      | Below this, cold penalty applies                   |
| `tempComfortHigh` | number | 30      | Above this, heat stress penalty applies            |
| `tempColdPenalty` | number | 0.05    | Multiplier: basal scaled by 1 + penalty * Δ        |
| `tempHeatPenalty` | number | 0.03    | Multiplier: basal scaled by 1 + penalty * Δ        |

## world.ts Wiring

```ts
import { TemperatureField } from '../core/environment/temperature-field';

// In World constructor / init:
const tempRng = rng.split(NEW_STREAM_ID);  // pick next unused stream ID
this.tempField = new TemperatureField(
  cfg.tempGridCols, cfg.tempGridRows,
  cfg.worldWidth, cfg.worldHeight
);
this.tempField.init(tempRng, cfg.tempPatchCount, cfg.tempPatchRadius,
                    cfg.tempMin, cfg.tempMax);

// In World.step() environment phase:
this.tempField.step(cfg.tempDiffuse, cfg.tempRegen);

// Seasonal modulation (cycle module applies externally):
//   this.tempField.cap[i] = originalCap[i] * seasonFactor;
// This shifts the entire relaxation target by the season multiplier.
// Applied BEFORE tempField.step() in the environment phase.
```

## Metabolism Hook (metabolism.ts)

When computing basal metabolic cost for a cell at position (x, y):

```ts
const temp = tempField.sampleAt(x, y);
let tempMultiplier = 1;
if (temp < cfg.tempComfortLow) {
  tempMultiplier = 1 + cfg.tempColdPenalty * (cfg.tempComfortLow - temp);
} else if (temp > cfg.tempComfortHigh) {
  tempMultiplier = 1 + cfg.tempHeatPenalty * (temp - cfg.tempComfortHigh);
}
basalCost *= tempMultiplier;
```

This is ONE new branch in `metabolism.ts` — a comfort-band check with two
linear penalties. No other metabolism logic changes.

## SensorChannel.TEMP (think.ts — future)

`SensorChannel.TEMP` appends a single scalar to the neural input vector:
the temperature at the cell's position. Implementation is a one-line injection
in the sensor readout loop. Deferred until sensors/think plumbing is ready.

## Seasonal Modulation (cycle module)

The cycle module owns temporal variation. Each tick it computes a
`seasonFraction ∈ [0, 1]` and MULTIPLIES the temperature field's `cap` array:

```ts
const seasonFactor = 0.8 + 0.4 * Math.sin(2 * Math.PI * seasonFraction);
for (let i = 0; i < tempField.cap.length; i++) {
  tempField.cap[i] = originalCap[i] * seasonFactor;
}
```

This shrinks/stretches the relaxation target. The field's own `step()` then
relaxes toward the seasonally-scaled cap. The cycle module is SEPARATE from
TemperatureField — the field owns only the spatial pattern + diffusion.

## main.ts Overlay

Mirror the existing light overlay pattern:

- **Heatmap layer**: map `[tempMin, tempMax]` → blue–red gradient, drawn as a
  semi-transparent canvas overlay toggled by a key (e.g., `T`).
- **HUD readout**: display `tempField.sampleAt(cursorX, cursorY)` in the info
  panel when the temperature overlay is active.

## Determinism Contract

- Seeded init: `TemperatureField.init(rng, ...)` consumes from a deterministic
  `Rng` — same seed → same spatial pattern.
- Deterministic step: `step(diffuse, regen)` is pure floating-point arithmetic
  on the grid — no `Math.random()`, no `Date`.
- Consequence: byte-identical re-simulation is possible when the Rng seed,
  config, and tick ordering are preserved.