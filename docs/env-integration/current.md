# Current Integration Contract

`CurrentField` is a vector field on a coarse toroidal grid representing water
currents. Currents push cells in a direction, making down-current locomotion
cheaper and up-current harder. Rewards sensing current direction and adapting
movement strategy. This document defines configuration, wiring, and the physics
hook contract.

## Config Fields

| Field                 | Type   | Default | Description                                       |
| --------------------- | ------ | ------- | ------------------------------------------------- |
| `currentGridCols`     | number | 32      | Current grid columns                              |
| `currentGridRows`     | number | 32      | Current grid rows                                 |
| `currentPatchCount`   | number | 16      | Number of Gaussian vector bumps                   |
| `currentPatchRadius`  | number | 6       | Patch radius in grid cells                        |
| `currentStrength`     | number | 0.5     | Max current speed per component                   |
| `currentEvolveRate`   | number | 0.01    | How fast currents shift per tick ∈ [0, 0.25]      |
| `currentDriftForce`   | number | 0.3     | Force multiplier: strength * (vx, vy) applied     |

## world.ts Wiring

```ts
import { CurrentField } from '../core/environment/current-field';
import { applyCurrent } from '../core/physics/current-force';

// In World constructor / init (stream 4):
const currentRng = this.rng.split(4); // STREAM_CURRENT
this.current = new CurrentField(
  cfg.currentGridCols, cfg.currentGridRows,
  cfg.worldWidth, cfg.worldHeight
);
this.current.init(
  currentRng,
  cfg.currentPatchCount,
  cfg.currentPatchRadius,
  cfg.currentStrength
);

// In World.tick() environment phase — after food.step():
this.current.step(cfg.currentEvolveRate);

// In World.tick() forces phase — alongside computeRepulsion / applyThrust:
applyCurrent(this.current, f, live, n, cfg.currentDriftForce);
```

The current force call MUST go BEFORE `integrate()`, alongside the other force
accumulators (`computeRepulsion`, `applyThrust`, `computeBondForces`,
`computeAdhesion`). Order within the FORCES block doesn't matter (all are
additive).

## Physics Hook (current-force.ts)

`applyCurrent(currentField, f, live, n, strength)` iterates the compact live
list, samples the current vector at each cell's position, and adds
`strength * (vx, vy)` to the forceX/forceY accumulator. Allocation-free.

Cells in a current get pushed; the semi-implicit Euler integrator + drag turn
the drift into a net displacement proportional to the current strength.

## SensorChannel.CURRENT (future)

`SensorChannel.CURRENT` appends TWO scalars to the neural input vector:
`current.currentVx` and `current.currentVy` (after calling `current.sample(x, y)`).
This lets motile cells sense and exploit currents. Deferred until sensors/think
plumbing is ready.

## main.ts Overlay (optional / defer)

- **Arrow field overlay**: draw small arrows (direction + magnitude) at each
  patch center, scaled by `currentStrength`. Toggle with a key (e.g., `C`).
- **HUD readout**: display `(current.currentVx, current.currentVy)` in the
  info panel when the current overlay is active.

## Determinism Notes

- Seeded init: `CurrentField.init(rng, ...)` consumes from a deterministic
  `Rng` — same seed → same spatial pattern.
- Deterministic step: `step(evolveRate)` is pure floating-point diffusion of
  each vector component — no RNG, no `Math.random()`.
- Consequence: byte-identical re-simulation is possible when the Rng seed,
  config, and tick ordering are preserved.