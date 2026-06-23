# Living-world build — locked spec (branch `feat/living-world`)

Four features, all OFF-by-default true no-ops, all turned ON in the live demo afterward.
Designed + adversarially verified (workflow `living-world-design`). This doc is the CONTRACT —
the gene layout + RNG draw order is LAW; do not improvise on determinism-critical code.

## Invariants (sacred)
- **Determinism**: seeded-reproducible. Every new gene RNG-gated → OFF path takes founder value with NO
  draw. OFF-state golden `world.test.ts a32e9375` + `gate-check.ts` (ch1 b2620ed6/a1e4388b,
  ch2 c7700033/e69daa13) must stay byte-identical with all new features at OFF defaults.
- **Cardinal rule**: no fitness/score/lineage/founder/species into survival/repro/death/movement. Senses
  read cellType/position/organism flags only.
- **OFF = true no-op**. `defaultConfig()` is the ONE config (demo + headless + tests).

## LOCKED gene layout (append-only at tail; slots 0..17 / brain 0..19 UNTOUCHED)
ScalarGene (genome.ts), new SCALAR_GENE_COUNT = **22**:
- `FORAGE_PREF` (17, existing): gate WIDENED `foodChannels < 2` (was `!== 2`) → draws for N=2 AND N=3.
- `FORAGE_PREF_C` (18, NEW): gate `foodChannels < 3`. center `foragePrefC`=0.5, costKey null, min 0 max 1.
- `SENSE_RANGE_B` (19, NEW): gate `foodChannels < 3`. center `senseStep`, costKey `senseRangeCost`, min 8 max 256.
- `SENSE_RANGE_C` (20, NEW): gate `foodChannels < 3`. center `senseStep`, costKey `senseRangeCost`, min 8 max 256.
- `PHERO_DEPOSIT` (21, NEW): gate `!pheromoneEnabled`. center `pheroDeposit`=1.0, costKey `pheroDepositCost`=0.01, min 0 max 5.
- Channel A reuses existing `SENSE_RANGE` (slot 2) — do NOT add a SENSE_RANGE_A (avoids the double-tax).

Brain (genome.ts), new BRAIN_GENES = **24**, BRAIN_CORE_GENES = 10 (unchanged):
- core 0-9, WALL 10-13, FLOW 14-17, HUNGER 18-19 — UNCHANGED.
- `PHERO_LAT_TURN` 20, `PHERO_FWD_TURN` 21, `PHERO_LAT_THRUST` 22, `PHERO_FWD_THRUST` 23 (NEW): gate
  `pheroSenseGenes` (= cfg.pheromoneEnabled, captured at World construction like wallSenseGenes/flowSenseGenes,
  threaded through reproduce→mutateGenome). FOUNDER_BRAIN extends to 24 entries; the 4 new = 0.

### Gate tables (the ONE source of truth — generalize the FORAGE_PREF special-case)
scalar `geneGatedOff(g, cfg)` in seedScalarGenes + mutateScalarGenes (skip whole gaussian when true):
- 17 → `cfg.foodChannels < 2`; 18,19,20 → `cfg.foodChannels < 3`; 21 → `!cfg.pheromoneEnabled`; else false.
brain per-block predicate in seedGenome + mutateGenome (add isPhero to the existing chain):
- isWall 10-13 / isFlow 14-17 / isHunger 18-19 / **isPhero 20-23** → drawn iff its flag.
hue draw stays the LAST brain-stage draw in both seed and mutate.

### Why byte-identical for any OFF subset
Every new gated draw is at the TAIL after all legacy draws; each gate is range-disjoint and skips the WHOLE
gaussian. All-OFF (channels=1, pheromoneEnabled=false) → scalar slots 17-21 skip, brain 20-23 skip → exactly
the legacy 17-scalar / 20-brain stream → `a32e9375`. F3 (flowPush/corridors) and F4 (render) draw ZERO rng.

## Config knobs (all OFF defaults are true no-ops)
- `foodChannels` (exists): allow value 3. Demo = 3.
- `foragePrefC` 0.5, `pheroDeposit` 1.0, `pheroDepositCost` 0.01 — new gene centers/costs.
- `foodPocketChannelMode`: how pockets are assigned a resource (deterministic). 0/legacy = all channel A.
- `pheromoneEnabled` false→demo true; `pheroDiffuse` 0.2, `pheroDecay` 0.02, `pheroDepositOnGraze` true,
  `pheroAlarmStrength` 0 (alarm-on-bite is secondary, default 0 since inert at scale).
- `flowPushStrength` 0→demo 0.25 (flowPushSizeExp exists, big bodies resist).
- Biolum config lives in the RENDER layer (renderer/main), not core sim config.

## Feature mechanics
**F1 multi-resource** — couple DIET to PLACE via per-pocket resource assignment:
- FoodField: refactor `{B, B2}` → `channelB: Float64Array[]` length = channels, lazily sized. Keep
  channels 1 & 2 paths bit-identical (the double-buffer swap is the fragile edit — channelB[0]/[1] must equal
  old B/B2 including swap). Each `=== 2` site (food-field.ts:78 alloc, :96 fracA, sense.ts:37, economy.ts:169)
  gets an `else if (cfg.foodChannels === 3)` branch BEFORE the existing branches; 1/2 branches untouched.
- `fertility` map stays the legacy single pocket map (locations shared → deadWaterCost + founder in-pocket
  test unchanged). What differs per channel: which POCKETS grow which resource. In seedPatches, assign each
  pocket a channel deterministically (pocket index based, RNG-free, or forked like lever C) and grow only that
  channel's biomass there. So a B-specialist must physically live in a B-pocket → allopatric partitioning,
  WALL-INDEPENDENT (fixes the inert-C bug). N=3 preference = simplex over {A,B,C} from FORAGE_PREF + FORAGE_PREF_C.
- senseFood N=3: per-channel ∇ blended by the 3-way preference, each channel smelled at its own range
  (A=SENSE_RANGE, B=SENSE_RANGE_B, C=SENSE_RANGE_C). economy graze splits the eat budget 3-way by preference.
- Update headless GENE_LABELS / SCALAR_GENE_COUNT-sized arrays: gene-variance.ts, life-history.ts, harness.ts,
  diversity-sweep.ts (bumping the count crashes their import-time assert otherwise).
- Tests: channels=3 same-seed stable hash; channels=3 NON-VACUITY (3rd channel actually grazed + hashed);
  ch1/ch2 + golden unchanged.

**F2 pheromones** — the delayed-feedback breathing engine:
- New `PheroField` (new file, mirror FoodField's scalar-field pattern): one Float64 grid `P`, diffuse
  (double-buffer toroidal 4-neighbour) + decay, wall no-flux via foodBlockedMask. RNG-free.
- DEPOSIT (default source = on-graze, ubiquitous → field populates at 8192²): in metabolize, when
  `pheroDepositOnGraze && gained>0`, add `PHERO_DEPOSIT_gene[i] * pheroDepositOnGrazeAmt` into P at the
  creature's cell, ascending live-slot, RNG-free, gated on phero!==null. Alarm-on-bite (in hunt) secondary,
  `pheroAlarmStrength` default 0.
- SENSE: senseEnv-style — pheroSenseX/Y = ∇P (toroidal central diff). Wire into steer() via the 4 PHERO brain
  genes (evolvable sign → evolution picks flee vs aggregate). Founder weight 0; measure if it evolves off 0.
- world.step: `phero.step(...)` immediately AFTER food.step; `phero.hashInto(h)` gated (after food.hashInto).
- Tests: pheromoneEnabled OFF==golden, ON!=default, ablation (brain[20..23] stay 0 when off after long run),
  2-hunter-1-cell deposit ascending-order determinism. Headless probe: does PHERO_FWD_THRUST evolve off 0?

**F3 mixing** — flow-push only this pass (corridors deferred):
- Demo `flowPushStrength` 0.25. applyFlowForce already wired; OFF default 0 byte-identical. In the DEMO
  flowStrength=0.15 already (flowSenseGenes already true) so turning push on does NOT change gating. Add a test
  comparing {flowStrength:0.15, flowPushStrength:0.25} vs {flowStrength:0.15, flowPushStrength:0} (isolates the
  force from the flowSenseGenes gating effect). Document that flowPush>0 with flowStrength=0 re-gates FLOW.
- Dynamic corridors: DEFERRED (determinism-unsafe as designed; net-new hash state). Fast-follow, level-triggered.

**F4 bioluminescence** — render-only, ZERO sim impact:
- Additive GLOW pass in the WebGL renderer (creatures/food glow, intensity ~ activity/energy, parts by
  function), composing with existing color-by modes + trails. MUST bracket
  gl.enable(BLEND)/blendFunc(SRC_ALPHA,ONE) ... gl.disable(BLEND) so OFF reproduces today's pixels exactly.
  Pin any new palette constant inlined into GLSL in palette.test.ts. Toggle in the render layer.

## Build order (strict serialization on shared core files)
0. **Keystone (DONE BY ORCHESTRATOR FIRST)**: genome.ts + config.ts gene/knob scaffolding + gate tables +
   FOUNDER_BRAIN/counts + headless GENE_LABELS + OFF/ablation tests. GATE: golden + gate-check byte-identical
   BEFORE any mechanic uses the genes.
1. F1 mechanics (food-field/sense/economy/world) — gate.
2. F2 mechanics (phero-field/sense/brain/economy/world) — gate.
3. F3 flow-push (config/demo/test) + F4 biolum (render-only, parallel) — gate.
4. Wire demo ON, multi-seed alive-guardrail, vite, tune feel across seeds.
After EVERY step: tsc + vitest (golden + per-knob OFF==default/ON!=default) + gate-check, GREEN before next.
