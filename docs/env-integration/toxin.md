# Toxin Integration Contract

`ToxinField` is a scalar toxin grid that damages cells in high-concentration areas,
driving avoidance behavior and resistance adaptation. Mirrors `FoodField` exactly in
structure (double-buffered, deposit/diffuse/decay). This document defines its
configuration, wiring, and the metabolism hook contract.

## Config Fields

| Field               | Type   | Default | Description                                      |
| ------------------- | ------ | ------- | ------------------------------------------------ |
| `toxinGridCols`     | number | 64      | Toxin grid columns                               |
| `toxinGridRows`     | number | 64      | Toxin grid rows                                  |
| `toxinDiffuse`      | number | 0.15    | Diffusion rate per tick ∈ [0, 0.25]              |
| `toxinDecay`        | number | 0.05    | Fraction of toxin lost per tick ∈ [0, 1)         |
| `toxinDamage`       | number | 1.0     | Energy damage per unit of toxin concentration    |
| `toxinMeatDeposit`  | number | 0.5     | Toxin deposited per decaying MEAT cell per tick  |

## world.ts Wiring

```ts
import { ToxinField } from '../core/environment/toxin-field';

// In World constructor / init (stream 3):
const toxinRng = this.rng.split(3); // STREAM_TOXIN
this.toxin = new ToxinField(
  cfg.toxinGridCols, cfg.toxinGridRows,
  cfg.worldWidth, cfg.worldHeight
);

// In World.tick() environment phase — after food.step(), before rebuildLive():
// Toxin deposits from decaying MEAT cells.
const toxin = this.toxin;
const tdep = cfg.toxinMeatDeposit;
for (let k = 0; k < this.liveCount; k++) {
  const idx = this.liveIndices[k]!;
  if (f.cellType[idx] === CellType.MEAT) {
    toxin.depositAt(f.posX[idx]!, f.posY[idx]!, tdep);
  }
}
toxin.step(cfg.toxinDiffuse, cfg.toxinDecay);
```

## Metabolism Hook (metabolism.ts)

After temperature modulation, add a toxin-damage deduction. In the metabolize
kernel loop (or as a post-pass), for each living cell:

```ts
const t = this.toxin.sampleAt(posX[i], posY[i]);
if (t > 0) {
  energy[i] -= cfg.toxinDamage * t;
  if (energy[i] < 0) energy[i] = 0;
}
```

This is ONE new branch in `metabolism.ts` just after the basal cost section.
The energy floor must be >= 0 — lifecycle death naturally harvests cells that
hit zero.

## SensorChannel.TOXIN (future)

`SensorChannel.TOXIN` appends a single scalar to the neural input vector:
`this.toxin.sampleAt(cellX, cellY)`. This lets motile cells sense and flee
toxin gradients. Deferred until sensors/think plumbing is ready.

## main.ts Overlay (optional / defer)

- **Heatmap layer**: map toxin concentration → red intensity, drawn as a
  semi-transparent canvas overlay. Toggle with a key (e.g., `X`).
- **HUD readout**: display `toxin.sampleAt(cursorX, cursorY)` in the info panel.

## Determinism Notes

- No `init()` seeding required — toxin starts empty and accumulates from
  simulation events (MEAT decay).
- `step(diffuse, decay)` is pure floating-point arithmetic — no RNG, no `Math.random()`.
- Byte-identical replay is possible when the same config and seed are used
  (toxin evolution depends only on simulation state, which is itself deterministic).