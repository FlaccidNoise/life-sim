# B-food — food-field retune: separate drifting A/B patches (per-pocket independent drift)

**First sub-project of Bucket B (density/predation) of the living-ecosystem roadmap.** Verified against `main`
@ `ffbc152` (post A1+A2+DAMPING+founder-resilience). Bead `life-sim-4bxw`. Owner-approved decisions (2026-06-24):
**per-pocket independent drift** (the new mechanic) + **retune-then-document-predation-honestly** (B is primarily
a diversity lever; prey-concentration is a measured-not-promised secondary benefit, per `predation-engine-ceiling`).

## Goal

Today the 2-channel demo (`main.ts`: `foodPatchCount 40`, `foodPatchRadius 8`, `pocketChannelMode 0`,
`fertilityDriftRate 1`) grows channels A and B **co-located in the same 40 pockets**, all drifting along two
**per-channel global** directions (`dirA`/`dirB`). The owner wants **blobby, sparser, independently-drifting
two-channel patches that overlap/merge** — i.e. *separate* A-patches and B-patches, each wandering on its own,
crossing and merging. This is the structural **diversity** lever (distinct drifting niches → a deeper two-niche
FORAGE_PREF split than co-located A+B can produce), and it *also* concentrates prey into rich blobs (a predation
prerequisite, though the ceiling memory cautions concentration alone was a "red herring" for reviving predation).

The demonstrable positive result: in forage color-mode, two distinct specialist populations (A-eaters and
B-eaters) thriving in their respective drifting patches — a real two-niche split, not today's single-niche
A-monoculture.

## What's already there (reuse, don't rebuild)

`FoodField` already supports: `pocketChannelMode=1` (place-coupled — each pocket's `channelMask` assigns it to
ONE channel, so an A-pocket grows only A; allocated for 2-channel when mode 1); migrating pockets
(`driftPockets` moves each pocket's centre; `seedPatches` draws the drift directions from a **forked velocity
rng** so the main organism stream is never touched; periodic RNG-free recarve rebuilds fertility/Kcell/mask from
the moved centres); Gaussian-sum fertility (overlapping pockets' biomass adds → "merge"). So the demo retune is
mostly **config/tuning** of existing levers; the one genuinely-new mechanic is **per-pocket** (vs per-channel)
drift.

## B-food-1 — per-pocket independent drift (the new mechanic)

**Change:** replace the two per-channel global directions with a **per-pocket velocity**.
- New config flag `cfg.perPocketDrift` (default **true**, on-by-default policy; ablatable). When off → the legacy
  per-channel `dirA`/`dirB` drift, byte-identical to today.
- In `seedPatches` (when `driftRate>0 && velocityRng` AND `perPocketDrift`): draw a per-pocket velocity for each
  pocket from the **forked velocity rng** — `angle = velocityRng.float()*2π`, `speed = driftBaseSpeed · (channel
  rate)` (reuse `driftRateA`/`driftRateB` by the pocket's channel so A and B can still have different *average*
  speeds, but each pocket's *direction* is independent). Store `pocketVelX[p]/pocketVelY[p]`. This draws `count`
  values from the FORKED stream (vs 2 for the legacy directions) — the main organism RNG is untouched either way,
  so organism determinism is preserved; the food drift pattern differs (a new, deterministic world).
- In `driftPockets`: move each pocket `p` along `pocketVelX[p]/pocketVelY[p]` (instead of its channel's global
  `dir`). The per-pocket velocities persist across recarves (like `pocketPeak`/`pocketScale`).
- `reset()` restores the seeded velocities (capture them in the saved start-of-run state alongside `seedPc/seedPr`).

**Determinism:** the per-pocket draws are on the forked velocity rng (never main); run-to-run reproducible. The
ablation `perPocketDrift:false` is byte-identical to today's per-channel drift (same forked draws: 2 directions).
Per-pocket on changes the forked draw count → a different (deterministic) drift pattern.

**Tests:** (a) `perPocketDrift:false` == today's drift (byte-identical world hash); (b) `perPocketDrift:true`
diverges (the pattern changed) AND each pocket's centre moves along a distinct direction over N ticks (not all
along one of two global dirs — assert the set of pocket displacement angles has spread > the 2-direction case);
(c) organism determinism (run-twice-same-hash) holds with it on; (d) determinism after a recarve (the velocities
persist).

## B-food-2 — demo retune + honest measurement

**Demo config changes** (`main.ts` + `life-history.ts DEMO_OVERRIDES`, tunable knobs):
- `pocketChannelMode 0→1` — separate A-patches and B-patches (the "two-channel patches"). This is a deliberate
  per-feature flip (not a blanket default change; the global `defaultConfig` default stays mode 0).
- `foodPatchCount 40→20` (sparser), `foodPatchRadius 8→14` (blobbier) — starting values; live-tunable.
- Keep `fertilityDriftRate 1` + `perPocketDrift true` (from B-food-1) → independently-drifting patches.

**Measure honestly** (extend `liveness-probe.ts` / a new `forage-diversity-probe.ts`, multi-seed `--demo`):
- **Diversity (the primary win):** FORAGE_PREF mean/std under the retune vs today's mode-0 co-located baseline.
  Hypothesis: separate drifting A/B patches sustain BOTH an A-specialist and a B-specialist population →
  FORAGE_PREF std UP and bimodal (vs today's single-niche A-monoculture, std tight near 0). Report the split (or
  its absence) with numbers. This is the demonstrable positive result.
- **Prey concentration (secondary):** prey nearest-neighbour distance (NND) / local density under the retune vs
  baseline. Does sparser+blobbier+separate concentrate prey? Report honestly (the ceiling memory says NND-closing
  is necessary-not-sufficient for predation).
- **Liveness:** the sparser/blobbier field must not starve the population — liveness PASS (no extinction, 3 seeds).
  If sparser starves it, tune `foodPatchCount`/`foodCap`/`foodRegen` up (don't ship a dead world).

## Determinism & policy

- Determinism is the ONLY invariant. `perPocketDrift` is a new feature → ships ON, ablatable, no golden hash; the
  per-pocket velocity draws stay on the forked velocity rng (the cardinal food-field rule — never touch the main
  organism stream). `pocketChannelMode 1` in the demo is a deliberate per-feature flip (the global default stays
  0 — mode 0/1 are mutually exclusive, per `feature-default-on-policy`).
- Per feature: ablation toggle (`perPocketDrift`) + same-(config,seed)→same-hash test + liveness guardrail.

## Slicing

- **B-food-1** — per-pocket-drift mechanic (food-field.ts + config + tests). Ablatable, byte-identical off,
  testable in isolation (pocket-displacement-angle spread).
- **B-food-2** — demo retune (mode-1 + sparser + blobbier) + the forage-diversity + prey-concentration + liveness
  measurement. The demonstrable two-niche win.

Each is one plan → subagent-build → independent-review → measure → merge cycle.

## Out of scope

B-pred (predation founding/concentration + BITE_GATE re-measure on the retuned field) and B-tune (coexistence or
honest-ceiling-doc) are the NEXT B sub-projects. B-food does NOT touch the predation economy — it's the food
structure + the diversity win. The 3-channel path, walls, wall-tied splits, lever-C variance are unchanged.
