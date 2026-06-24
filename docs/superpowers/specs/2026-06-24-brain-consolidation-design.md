# Brain consolidation — unified hidden-layer + 4-channel-scent brain (2026-06-24)

**Bead:** life-sim-20xr · **Sub-project 1 of the brain-consolidation-and-interconnection mission.**

## Goal

Merge `feat/living-world` into `main` and reconcile the two divergent `Brain` layouts into ONE
unified brain: a skip-connection MLP where **every sense — including the 4 identity-bearing scent
channels — feeds both a linear synapse path and the nonlinear hidden layer**. This is the load-bearing
foundation; the orphaned-code audit, missing-input wiring, brain-output promotion, sexual-repro seams,
and visibility sweep (the rest of the mission) all build on it.

This sub-project does the MERGE + the LAYOUT RECONCILIATION only. It deliberately does NOT add new
inputs (own-size/diet/crowding), new outputs (bite/breed/scent-deposit), crossoverBrain/brainDistance,
or visibility work — those are later, individually-reviewable sub-projects.

## Background — the two layouts that collide

Both branches reuse brain slots 20+ incompatibly (verified against current code 2026-06-24):

**`main` @ 7a2e64a** — LINEAR brain, `BRAIN_GENES = 36`:
- 0–19 core/sight/wall/flow/hunger · 20–35 `PHERO_C0..C3` (16 scent synapses, 4 ch × {lat_turn,
  fwd_turn, lat_thrust, fwd_thrust}). No hidden layer, no eat-gate.
- Scent sense buffers: `store.scentSenseX/Y` indexed `[i*SCENT_CHANNELS + c]`, `SCENT_CHANNELS = 4`
  (`scent-field.ts`: ch0 PREY, ch1 PRED, ch2 SIG_COS, ch3 SIG_SIN). `brain.ts steer()` loops channels
  reading `scentSenseX[sb+c]` into 16 linear synapses (`Brain.PHERO_C0_LAT_TURN + c*4`).

**`feat/living-world` @ 0b2b68b** — skip-connection MLP, `BRAIN_GENES = 110`:
- 0–19 same · 20–23 `PHERO_*` (OLD single-channel, 4 synapses, fed by `pheroSenseX/Y`) · 24–28
  `EAT_GATE_*` · 29–30 `AGE_*` · 31–32 `READINESS_*` · `NAMED_BRAIN_GENES = 33`.
- 33… `HIDDEN_W1` (`HIDDEN_INPUTS=14 × HIDDEN_UNITS=4`) · 89… `HIDDEN_W2` (4 × `HIDDEN_OUTPUTS=3`:
  turn/thrust/eatGate) · 101 `GLOW_BIAS` · 102 `GLOW_HID`(4) · 106–109 `GLOW_SENSE_*`.
- `HiddenInput` (14): FOOD_FWD/LAT, SIGHT_FWD/LAT, WALL_FWD/LAT, FLOW_FWD/LAT, **PHERO_FWD/LAT
  (single!)**, HUNGER, AGE, READINESS, BIAS.
- Architecture (`brain.ts steer`): linear named synapses → `turnRaw`/`thrustRaw`, PLUS a tanh hidden
  layer adding a nonlinear correction (skip connection) reading the SAME sense values as `hidIn[]`.
  Every sense already appears in BOTH paths — that is the established pattern scent must join.

## Unified Brain layout (the target)

```
0–19    core / sight / wall / flow / hunger          (identical in both — no conflict)
20–35   PHERO_C0..C3   (16 scent synapses)           ← KEEP from main (linear skip path)
36–40   EAT_GATE_{BIAS, FWD, LAT, SIGHT_FWD, SIGHT_LAT}  ← living-world 24–28, relocated
41–42   AGE_TURN, AGE_THRUST                          ← living-world 29–30
43–44   READINESS_TURN, READINESS_THRUST             ← living-world 31–32
NAMED_BRAIN_GENES = 45
45…     HIDDEN_W1   (HIDDEN_INPUTS = 20 × HIDDEN_UNITS = 4 = 80 weights)
125…    HIDDEN_W2   (4 × HIDDEN_OUTPUTS = 3  → turn, thrust, eatGate)
137     GLOW_BIAS
138…    GLOW_HID    (HIDDEN_UNITS = 4)
142–145 GLOW_SENSE_{LAT_TURN, FWD_TURN, LAT_THRUST, FWD_THRUST}
BRAIN_GENES = 146
```

All offsets at/after `HIDDEN_W1` are DERIVED constants in `genome.ts` (living-world already defines
`HIDDEN_W2 = HIDDEN_W1 + HIDDEN_INPUTS*HIDDEN_UNITS`, `GLOW_BIAS = HIDDEN_W2 + …`, etc.). So the only
hand-edits are: the `Brain` enum named slots, `NAMED_BRAIN_GENES = 45`, `HIDDEN_INPUTS = 20`, and the
`HiddenInput` enum. The rest recomputes.

### The reconciliation that matters (mandate 1)

Replace the single `HiddenInput.PHERO_FWD/LAT` (2 inputs) with **8 scent inputs** — 4 channels ×
{fwd, lat}:

```
HiddenInput (20):
  FOOD_FWD, FOOD_LAT, SIGHT_FWD, SIGHT_LAT, WALL_FWD, WALL_LAT, FLOW_FWD, FLOW_LAT,
  SCENT_C0_FWD, SCENT_C0_LAT, SCENT_C1_FWD, SCENT_C1_LAT,
  SCENT_C2_FWD, SCENT_C2_LAT, SCENT_C3_FWD, SCENT_C3_LAT,
  HUNGER, AGE, READINESS, BIAS
```

In `brain.ts steer()`, the per-channel scent gradient (heading frame `cFwd`/`cLat`, already computed
on main for the linear synapses) is written into `hidIn[SCENT_C{c}_FWD/LAT]` inside the channel loop.
Scent thereby feeds BOTH the 16 linear synapses (20–35) and the hidden layer — the same dual path
food/sight/wall/flow already use. NOT a vestigial linear path.

### Scope boundaries (explicit — these are later sub-projects)

- `HIDDEN_OUTPUTS` stays **3** (turn, thrust, eatGate). Brain-gated bite/breed/scent-deposit outputs →
  phase 5.
- No own-size / own-diet / crowding / fertility-under-foot hidden inputs → phase 4.
- `glow-sense` (slice F3) stays a LINEAR-only input — matches the handoff's explicit hidden-input list;
  promoting it to the hidden layer is deferred.
- `hungerSense` stays at its current default (`false`) — flipping it ON is a phase-4 item. The HUNGER
  hidden input is therefore 0 until then (consistent with living-world).
- No `crossoverBrain` / `brainDistance` work → phase 6.

## Default state (owner decision: ALL ON)

`feat/living-world` already defaults `hiddenLayer`, `brainGatedEating`, `ageSense`, `readinessSense`,
`moodGlow`, `glowSense` to **true**. The merge preserves those ON. No flag flips needed for this
sub-project beyond keeping them on. (`hungerSense` remains false — phase 4.)

## Merge strategy (owner decision: real 3-way merge, hand-resolve enum)

1. `git checkout -b feat/brain-consolidation main` (re-verify `git log -1 main` first — main moves).
2. `git merge feat/living-world`. Expect conflicts in: `genome.ts`, `brain.ts`, `economy.ts`,
   `config.ts`, `world.ts`, `store.ts`, `sense.ts`, `health.ts`, `renderer.ts`, and the test files.
3. Resolve to preserve the ADDITIVE machinery from living-world (hidden-layer math, eat-gate, age/
   readiness, glow, bioluminescence render, reverse-thrust) AND main's 4-channel scent system
   (`scent-field.ts`, `scentSenseX/Y`, the 16 linear synapses, identity deposit). Hand-rewrite the
   `Brain` enum + `HiddenInput` enum + constants to the target layout.
4. In `steer()`: keep main's channel loop for the 16 linear scent synapses; inside that loop also
   populate the 8 scent `hidIn[]` slots. Delete the dead single-channel `pheroSenseX/Y` path
   (superseded by `scentSenseX/Y`); confirm no other consumer remains.
5. `BrainView` (`brain-view.ts`): render the hidden layer (W1/W2) + all named synapses incl. the 16
   scent + eat-gate/age/readiness + glow. (Living-world already renders the hidden layer for its
   layout; update it for the unified offsets and the 4-channel scent block.)
6. `world.ts stateHash`: scent + seeking are already hashed on main; confirm no NEW hashed state is
   introduced by the merge that isn't folded in.

## Determinism & invariants

- **Per-config determinism is the ONLY invariant**: same (config, seed) → byte-identical run-to-run
  (`world.test.ts`, first test). The frozen golden-hash baseline is RETIRED — do NOT add a
  byte-identical-when-off test or a hardcoded stateHash constant.
- RNG consumed ONLY at reproduction, ascending live-slot order; the hot loop stays RNG-free.
- The hidden block (W1/W2/glow) stays gated on `hiddenLayer`/`moodGlow` in `seedGenome`/`mutateGenome`
  with the no-RNG-when-off gated-draw pattern, so ablation streams stay stable. Growing HIDDEN_INPUTS
  14→20 enlarges the gated block; that is fine (per-config determinism, not cross-config byte-identity).
- Hidden block seeds to 0 (founder noise via mutation), as on living-world.

## Acceptance criteria

1. Clean 3-way merge resolved to the unified layout; `BRAIN_GENES = 146`, `NAMED_BRAIN_GENES = 45`,
   `HIDDEN_INPUTS = 20`, `SCENT_CHANNELS = 4` all consistent.
2. Full suite green (`NODE_OPTIONS=--expose-gc npx vitest run`, 347+ tests). Merged-in tests from both
   branches pass; tests asserting old constants/offsets updated to the unified layout.
3. `npx tsc --noEmit` clean · `npx eslint src` clean.
4. Determinism: a same-(config, seed) → same-hash test passes with the unified brain (extend/keep the
   existing world.test.ts determinism test; no golden constant).
5. **Liveness guardrail** (load-bearing — interconnection can crash the population): a headless run
   (`src/headless/life-history.ts`, demo config, multi-seed) shows population survives N ticks > 0 and
   does not go extinct with all brain features ON. Record actual numbers.
6. `BrainView` renders the unified brain (hidden layer + 16 scent synapses + eat-gate/age/readiness +
   glow) without crashing; verified in the live demo on a FRESH port.

## Test plan (TDD, bite-sized increments)

Each increment = a failing test → implementation → independent review. Candidate slices:

- **S1 — constants & enums:** unified `Brain` / `HiddenInput` enums + derived constants. Test: offsets
  non-overlapping, `BRAIN_GENES=146`, `HIDDEN_INPUTS=20`, scent block at 20–35.
- **S2 — seed/mutate determinism:** `seedGenome`/`mutateGenome` produce same genome for same (config,
  seed); gated draws skip RNG when `hiddenLayer`/`moodGlow` off. Test: two seeds identical; toggling an
  unrelated flag doesn't shift the scent draw stream.
- **S3 — steer() scent→hidden wiring:** the 8 scent `hidIn[]` slots receive the per-channel gradients;
  hidden layer output changes when a scent channel is non-zero. Test: inject a scent gradient, assert
  the hidden activation (and turn/thrust) responds; with scent zero, hidden contribution unchanged.
- **S4 — full-suite reconcile:** all merged tests green; update any asserting old offsets.
- **S5 — BrainView render:** renders unified layout; snapshot/structure test for the hidden + scent rows.
- **S6 — liveness + determinism guardrail:** headless multi-seed survival + same-hash run.

## Risks

- **Hidden test breakage from offset shifts.** Many tests hardcode brain offsets/`BRAIN_GENES`. Budget
  for sweeping these; they are the signal the layout changed correctly.
- **`pheroSenseX/Y` vs `scentSenseX/Y` double-path.** living-world's single-channel buffers must be
  fully removed, not left feeding a dead synapse. Grep all consumers.
- **main moving under the merge.** Re-check `git log -1 main` immediately before merging; a planned
  resolution can shift.
```
