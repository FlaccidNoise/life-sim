# Sessile Chain-Plants — Design

**Date:** 2026-06-18
**Status:** Approved design, pending implementation plan
**Supersedes:** the free-clone PHOTO plant model (single PHOTO cells that divide into independent drifting clones) in the live demo.

## Motivation

The current plant model — single `PHOTO` cells that photosynthesize and divide into independent free-floating clones — produces a near-uniform "drifting green carpet" that is visually illegible and doesn't read as *plants*. Plants should feel rooted and structured: an anchored base with a chain of cells growing off it, immobile, like kelp. Food should appear in discrete **pockets**, and the world should hold still (no drift) so the dynamics are watchable.

## Goals

1. A plant is a sessile, multicellular **organism**: an anchored, tough **base** cell + a bonded **chain** of up to ~5 PHOTO cells that sways.
2. Plants grow **gradually** at the tip, paced by their light pocket.
3. Plants reproduce by **spores** that drift a short distance and anchor as new bases.
4. Grazing **severs** the chain (freed upper cells become drifting food); the base regrows. The base is **tough** (slow to eat, but evolvably killable).
5. Food forms discrete **pockets**; drift/current is **off** by default.
6. Tick-0 world is a handful of **hand-placed** founders (plants + creatures).

## Non-goals

- Keeping the old free-clone PHOTO model alive in the live demo (it is replaced there).
- A general plant genome / evolvable plant morphology (chains are a fixed body plan for now; creatures still evolve).
- Re-validating the full headless ecology in this design doc (the probes encode the *old* ecology and are migrated as phased implementation work, not specified here).

## Reused machinery (no new logic)

- **Photosynthesis** — `metabolism.ts` PHOTO branch: `gain = photoGain · light.sampleAt(x,y) · area`, depletes the local light patch. Unchanged; every plant cell uses it.
- **Bonds + organisms** — `bonds.ts`, `organisms.ts`. A plant is an organism; chain links are bonds.
- **Bond removal / reachability** — `bonds.removeBond(slot)`; organism re-derivation via `aggregateOrganisms`.
- **MEAT** — grazed debris and dead chains convert to MEAT (existing decay + edibility), so no new "drifting food" type is needed.
- **Deterministic placement** — `hashFloat3(seed, tick, cellIndex)` (RNG-free, used by lifecycle division) for growth jitter and spore ejection direction.
- **Light field** — already patch-capable (`light-field.ts` seeds Gaussian bumps toward a per-patch `cap`); we only retune its parameters.

## Architecture

### New per-cell state

Add **one** field to `cell-store.ts` (both the `CellArrays` interface and the `CELL_FIELDS` SoA descriptor; wiped on `alloc` recycle like `latchPrey`/`latchCell`):

- `anchored: Uint8Array` — `1` ⇒ this cell is a pinned, tough plant **base**. `0` ⇒ everything else (chain cells, creatures, spores, MEAT).

No other new state. "Base vs chain" = `anchored`. "Spore" needs no flag: after this change the **only** free PHOTO cells (`cellType === PHOTO && organismId === 0`) are spores, because grazed debris becomes MEAT and free-clone division is gone.

> Determinism note: `anchored` affects physics, so it is **on the determinism contract** (unlike `localDensity`). It must be set deterministically and serialized wherever the contract is checked.

### Physics — anchoring (`integrator.ts`)

At the top of the per-cell integration loop:

```
if (anchored[i]) { velX[i] = 0; velY[i] = 0; forceX[i] = 0; forceY[i] = 0; continue; }
```

The base is immovable; bonded chain cells integrate normally and sway off it. (`mass = Infinity` is insufficient — residual velocity still carries the cell — so the explicit flag is required.)

### Plant lifecycle

```
spore (free PHOTO, drifting)
  └─ settles (speed < ε) ──> ANCHOR: anchored=1, new organism id ──> base (1 cell)
        └─ growPlants: bank light energy ──> add tip cell + bond (up to ~5)
              └─ mature (≥5 cells, energy ≥ sporeThreshold) ──> emit spore (ejection impulse)
        └─ grazed chain cell drained ≤0 ──> sever: remove its bonds,
              reachability-from-base frees unreachable cells ──> freed cells become MEAT,
              base + stub survive, regrow from new most-distal cell
        └─ base drained ≤0 (slow: ×baseToughness) ──> whole remaining chain ──> MEAT (plant dies)
```

### New tick steps (insertion points in `world.ts tick()`)

1. **`severEatenChainCells`** — after `metabolize` / `transferEnergy` (~line 679), before `lifecycle`. For each PHOTO cell with `organismId !== 0` and `energy <= 0`:
   - Remove all its bonds (`removeBond`).
   - Run a **reachability pass from all `anchored` bases** over the live bond graph; any organism cell not reachable from a base → convert to **MEAT** (`cellType = MEAT`, `organismId = 0`, energy = `mass · meatEnergyOnDeath`, strip remaining bonds).
   - The eaten cell itself → MEAT.
   - `bonds.rebuildLive` after.
   - This is the *only* per-cell plant death path (organism cells remain exempt from `lifecycle` death/division).

2. **`growPlants`** — after `aggregateOrganisms` (~line 775). For each plant organism with cell count < `plantMaxChain` (5) and organism energy ≥ `plantGrowthThreshold`:
   - Find the most-distal cell from the base (BFS over the ≤5-cell chain).
   - Allocate a PHOTO cell at `tip + plantBondLen` along the base→tip axis (deterministic jitter via `hashFloat3`), `organismId` = plant, `anchored = 0`.
   - `addBond(tip, new, plantBondLen)`; deduct `plantGrowthCost` from the base.
   - `bonds.rebuildLive` after.

3. **`producePlantSpores`** — alongside `reproduceOrganisms` (~line 815). For each **mature** plant (cells ≥ `plantMaturityChain`, base energy ≥ `plantSporeThreshold`):
   - Allocate a free PHOTO cell (`organismId = 0`, `anchored = 0`) near the base; set its velocity to `plantSporeImpulse` in a deterministic direction (`hashFloat3`).
   - Deduct `plantSporeCost` from the base.

4. **Spore settling** — folded into `growPlants` (or a tiny `settleSpores` pass): for each free PHOTO cell (= spore) whose speed `< plantSettleSpeed`, **anchor** it: `anchored = 1`, assign a fresh `organisms.alloc()` id. It is now a 1-cell base and grows on subsequent ticks. A spore that settles in darkness gets ~0 photosynthesis and starves before maturing → pockets self-select.

### Base toughness (`metabolism.ts`)

At the digestion clamp (line ~128, DIGESTIVE/MOTILE branch — the only branch that eats PHOTO), scale the rate by the prey cell's toughness:

```
const rate = anchored[j] ? digestRate * baseToughness : digestRate;
const extracted = Math.min(avail, rate);
```

`baseToughness` (~0.1) makes a base ~10× slower to drain, so a forager must camp on it — but a lineage that evolves a high enough digest rate can still kill bases (emergent, as desired). No hard invulnerability.

### Light pockets + drift (config / `main.ts`)

- `lightPatchCount ≈ 10`, `lightPatchRadius ≈ 2` (grid cells), `lightDiffuse ≈ 0.02` — fewer, smaller, sharp pockets instead of 32 overlapping radius-6 blobs. Keep `lightRegen` so pockets sustain producers.
- `currentStrength: 0` — drift off by default. Spore dispersal comes from `plantSporeImpulse`, not current.

### Initial scene (`main.ts`)

Replace `seedLife(18000)` and the 250-forager / 24-predator loops with hand-placed founders:
- ~8–12 plant **bases** (1 anchored PHOTO each) placed in/near light pockets; they grow chains live.
- A few creatures: ~4 foragers + ~2 predators near pockets so interactions are watchable.
- A small `seedPlantBase(x, y)` helper (alloc PHOTO, `anchored=1`, fresh organism id).

All counts/positions are tuning knobs.

## New config knobs (defaults)

| Knob | Default | Meaning |
|---|---|---|
| `plantMaxChain` | 5 | hard cap on cells per plant |
| `plantMaturityChain` | 5 | min cells before it can spore |
| `plantGrowthThreshold` | tbd in tuning | organism energy needed to grow a tip cell |
| `plantGrowthCost` | tbd | energy spent per tip cell |
| `plantBondLen` | ~2.5·cellRadius | chain link rest length |
| `plantSporeThreshold` | tbd | base energy needed to spore |
| `plantSporeCost` | tbd | energy spent per spore |
| `plantSporeImpulse` | tbd | spore ejection speed (sets dispersal distance) |
| `plantSettleSpeed` | small | speed below which a spore anchors |
| `baseToughness` | 0.1 | base digest-rate multiplier |

Energy-economy knobs (`tbd`) are set during a headless tuning pass so plants persist in pockets without exploding or going extinct.

## Determinism

- All placement/dispersal randomness uses `hashFloat3(seed, tick, cellIndex)` — no RNG draw-order dependence.
- All structural changes (grow, spore, sever, anchor) iterate the live set in **ascending slot order** and `rebuildLive` after, per the existing contract.
- `anchored` is on-contract: set deterministically; include in any reproducibility serialization/check.
- Target: two runs with the same seed are byte-identical (mirrors `reproducibility.test.ts`).

## Testing

New tests (default config where possible, dedicated config where needed):
- **Anchor**: an anchored base does not move under bond pull / repulsion / (disabled) current.
- **Growth**: a seeded base in light grows to exactly `plantMaxChain` cells and stops.
- **Sever-on-graze**: eating a mid-chain cell frees the cells above it (they become MEAT), base + stub survive, chain regrows.
- **Base toughness**: a base drains at ~`baseToughness`× the rate of a chain cell; survives a fixed forager contact far longer than a chain cell.
- **Base death**: draining a base to 0 converts the whole remaining chain to MEAT.
- **Spore**: a mature plant emits a spore that drifts and anchors into a new base; a spore in darkness starves without anchoring into a viable plant.
- **Determinism**: two seeded runs of the live-demo plant config are byte-identical.

Existing tests/probes that encode the old free-clone ecology are migrated as **phased implementation work** (the implementation plan sequences this so the suite stays green between phases).

## Risks / open tuning

- **Economy balance** — growth/spore/toughness costs need a headless tuning pass so pockets sustain plants and foragers without extinction or explosion (the recurring r/K tension; see `sim-feel-dejam` memory).
- **Spore spam vs sparsity** — `plantSporeCost` / `plantSporeImpulse` / `plantSettleSpeed` jointly control colonization rate; tune live.
- **Probe migration cost** — replacing the plant model invalidates the headless ecology probes; budget for re-validating or retiring them.
