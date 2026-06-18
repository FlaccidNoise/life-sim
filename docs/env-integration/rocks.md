# Rocks / Static Terrain — Integration Contract

Rocks are **immovable circular obstacles**. They are NOT cells — they live outside the cell SoA, have no metabolism, and never die. They create spatial heterogeneity (shelter, chokepoints, territory) that fuels ecological speciation (spec §4.5 refuge payoff, §10 R1).

## Config Fields

Add to the simulation Config object:

```ts
/** Number of rocks to attempt to place. Some may be skipped if the world is too
 *  dense for rejection sampling. Default: 0 (no rocks). */
rockCount: number;

/** Minimum rock radius in world units. Default: 15. */
rockRadiusMin: number;

/** Maximum rock radius in world units. Default: 40. */
rockRadiusMax: number;

/** Hookean repulsion stiffness when a cell overlaps a rock. Default: 5. */
rockRepulsion: number;

/** Grid cell size (world units) for rock neighbour queries. Should be ≥ the
 *  maximum cell radius + maximum rock radius to guarantee the 3×3 block covers
 *  the interaction cutoff. Default: 80. */
rockGridSize: number;
```

**Defaults** (when `rockCount > 0`):
- `rockCount = 0` (disabled)
- `rockRadiusMin = 15`
- `rockRadiusMax = 40`
- `rockRepulsion = 5`
- `rockGridSize = 80`

## world.ts Wiring

```ts
import { RockField } from '../core/environment/rock-field';
import { applyRockCollision } from '../core/physics/rock-collision';

// In the World constructor:
const ROCK_STREAM = 42; // dedicated rng.split substream ID
this.rockField = new RockField(
  config.rockCount,
  Math.max(3, Math.floor(config.worldWidth / config.rockGridSize)),
  Math.max(3, Math.floor(config.worldHeight / config.rockGridSize)),
  config.worldWidth,
  config.worldHeight,
);
this.rockField.init(
  rng.split(ROCK_STREAM),
  config.rockCount,
  config.worldWidth,
  config.worldHeight,
  config.rockRadiusMin,
  config.rockRadiusMax,
);
```

In the tick loop, after `computeRepulsion`:

```ts
if (this.rockField.rockCount > 0) {
  applyRockCollision(
    this.rockField,
    this.cells.fields,
    this.live,
    this.aliveCount,
    config.rockRepulsion,
    config.worldWidth,
    config.worldHeight,
  );
}
applyThrust(...)
integrate(...)
```

## Determinism

Rocks are initialized from `rng.split(42)` — a dedicated substream ID. Adding rocks does NOT shift the draw order of any other subsystem. Two runs with the same seed produce byte-identical rock placements.

## Renderer Note

Draw rocks as grey (or semi-transparent dark) filled discs using the RockField's `cx`/`cy`/`radius` arrays. Since rocks are static, the renderer can cache the draw commands (e.g., instanced quads or a single static mesh). This should be a new overlay rendered behind cells but above the background.

Suggested color: `rgba(100, 100, 110, 0.6)` — a neutral grey that's visible but doesn't distract from cells.

## Hand-of-God / Debug

In `main.ts` or the debug overlay:
- Key to toggle rock visibility (show/hide the rock overlay)
- Key to spawn a rock at the mouse cursor position (for interactive testing)
- Spawned rocks should be added to the RockField by appending to `cx`/`cy`/`radius` and calling `buildGrid()`. Keep `rockCount ≤ maxRocks`.

## Rock Grid Constraint

The RockField's internal uniform grid uses `rockGridSize` for its cell dimensions. The 3×3 neighbourhood query requires `gridCols ≥ 3` and `gridRows ≥ 3`. The constructor enforces this and will throw if the world is too small for the grid size.

The grid cell size should be large enough that the 3×3 block always covers the maximum possible cell-rock interaction distance (`maxCellRadius + maxRockRadius`). Otherwise, a cell might be close to a rock in an adjacent bucket that's outside the 3×3 window.