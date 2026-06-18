# Bioluminescence — Integration Contract

Emergent cell capability: NEURON cells bound as GLOW effectors emit light into a
patchy toroidal `GlowField` when their activation a(t) > 0, costing energy per
active effector. Whether glowing helps or hurts is decided by the economy —
lure prey, signal mates, counter-illumination at night all EMERGE from
selection pressure, not scripted behaviours.

## Files

- `src/core/environment/glow-field.ts` — `GlowField` (coarse grid, double-buffered, persistent)
- `src/core/neural/glow.ts` — `GlowEffectors` (SoA pool) + `computeGlow()`

## Config fields

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `glowGridCols` | number | 32 | GlowField grid columns |
| `glowGridRows` | number | 32 | GlowField grid rows |
| `glowDiffuse` | number | 0.2 | Diffusion coefficient ∈ [0, 0.25] |
| `glowDecay` | number | 0.05 | Per-tick decay ∈ [0, 1) |
| `glowGain` | number | 1.0 | Scalar multiplier on a(t) → deposited light |
| `glowCost` | number | 0.05 | Energy subtracted per active glow effector per tick |

## World tick wiring (in world.ts)

```
1. After THINK + NeuralNetwork.swap():
   computeGlow(net, glowField, glowEffectors, store.fields, config.glowGain)

2. During environment phase (with light/food step):
   glowField.step(config.glowDiffuse, config.glowDecay)

3. During metabolism (in metabolize call):
   For each GLOW effector with a(t) > 0, subtract config.glowCost from that neuron's energy.
   Pass config.glowCost as a new parameter to the metabolize function.
```

## Constructor wiring

```ts
this.glowField = new GlowField(config.glowGridCols, config.glowGridRows, worldW, worldH);
this.glowEffectors = new GlowEffectors(config.maxCells); // one per cell max
```

## Sensor integration (SensorChannel.GLOW — deferred)

Add `GLOW: 2` to `SensorChannel` in `network.ts`. In `think.ts`, inject
`glowField.sampleAt(posX[i], posY[i])` as the scalar for GLOW-channel sensors
(in the existing sensor injection loop body at step (c)). This lets organisms
evolve to climb glow gradients (phototaxis toward bioluminescent lures).

## Genome integration (deferred)

A new genome parameter (e.g., `glowRule`) or a binding rule at organism
construction time that maps a NEURON cell to a GLOW effector slot in
`GlowEffectors`. Could be:
- A per-neuron gene flag `isGlowEffector`
- A separate genome table of glow bindings (neuron slot → gain)

Defer to the genome/species integrator.

## Rendering (main.ts)

Render `glowField.field` as a warm yellow additive overlay at night
(dim/moderate during day). Key to toggle visibility (e.g., `G` or `B`).

## Determinism

- `computeGlow` reads `net.actCur` (deterministic after THINK) and cell
  positions (deterministic) — safe for byte-identical contract.
- `GlowEffectors` must be rebuilt on structural events (cell birth/death,
  neuron type changes), identical to how motor and sensor bindings are rebuilt.
  No `Math.random` or `Date.now` anywhere in the glow pipeline.
- `GlowField.step()` is pure arithmetic — deterministic.

## Zero allocation after construction

- `GlowField` pre-allocates both buffers in constructor.
- `GlowEffectors` pre-allocates all arrays in constructor.
- `computeGlow` is a plain loop — no allocations in hot path.