# Lenia 3D — Creatures-as-Lenia

A 3D rebuild where each creature is an **evolving Particle-Lenia cluster**. Fuses Lenia's
emergence (self-organizing bodies/gaits from kernel+growth math) with the life-sim's
genome + economy + evolution design.

## Why a new module (not a refactor of `src/core`)

`src/core` is hardwired to 2D: the store uses `x[]/y[]`, fields are 2D grids, the spatial
hash is 2D, and the brain steers in a 2D heading frame. Particle Lenia is 3D-native and its
motion *emerges* from particle dynamics (no heading-frame neural steering). A fresh 3D-native
module that reuses the *philosophy* (deterministic core separate from renderer; heritable
genome mutated at birth; pure-economic selection) is cleaner than refactoring 24k lines of
2D-coupled code. The old 2D sim stays intact at `index.html`.

## Particle Lenia math (per creature, intra-cluster)

Each creature = `n` particles at positions `p_i`. Dynamics (Euler, `dp/dt = -∇E`):

- Kernel: `K(r) = wK·exp(-(r-muK)²/sigmaK²)`  (Gaussian shell)
- Potential: `U_i = Σ_{j≠i} K(d_ij)`
- Growth: `G(u) = exp(-(u-muG)²/sigmaG²)`
- Repulsion: `R` via `-∇R_i = Σ cRep·max(1-d_ij,0)·û_ij`
- `∇G_i = G'(U_i)·Σ K'(d_ij)·û_ij`, with `K'(r)=K(r)·(-2(r-muK)/sigmaK²)`, `G'(u)=G(u)·(-2(u-muG)/sigmaG²)`
- `dp_i/dt = ∇G_i - ∇R_i`  (= `-∇E`, E=R-G)

Plus a **food-seeking CoM drift** (uniform accel on all particles toward nearest food) so the
emergent body also forages — the ecological leg. Cluster internal form/gait stays pure Lenia.

## Genome (heritable, mutated at birth)

`muK, sigmaK, wK, muG, sigmaG, cRep` (Lenia params) + `n` (particle count) + `hue` (lineage) +
`hungerDrive, maxSpeed` (foraging) + `reproThreshold, birthEnergy, moveCost` (life history).
Selection = survive + reproduce. No fitness function.

## Economy

Food particles drift in 3D; creatures eat food within their cluster radius → energy. Reproduce
(split: child seeded as a mutated blob near parent, parent pays birthEnergy+overhead). Die
(energy≤0) → corpse spawns food at particle positions (closes the loop).

## Rendering

Three.js: instanced spheres (one instance per particle, colored by creature hue), food as
points. Orbit camera. **No sprite system, no zoom levels** (per the brief).
