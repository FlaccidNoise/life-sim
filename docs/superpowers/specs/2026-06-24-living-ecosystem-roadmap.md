# Living-ecosystem roadmap — closing the last ~40% (2026-06-24)

**Where we are:** the brain consolidation + scent migration is done and verified (`main` @ `17ee941`,
`BRAIN_GENES=146`, one unified hidden-layer + 4-channel-scent brain, food specialization producing real
forage-niche diversity, scent/glow now drawn in the inspector). The world is **stable and diverse** —
live snapshot: pop ~5000, FORAGE_PREF spread std 0.44 (two-niche coexistence), body-size std 10, vision
maintained, 20+ lineages. **But it is a grazer near-monoculture: predation is essentially absent (≈9
predators / 5000), and the brain reflexively bites/breeds/signals rather than deciding to.**

**This roadmap closes the gap between "a correctly-wired grazer world with forage diversity" (≈60%) and
"a living ecosystem".** Three buckets, sequenced so each unlocks the next. Source of truth for every gap is
`docs/neural-network-interconnection-map.md` (the orphaned-code audit).

---

## Non-negotiable working agreement (read before any code)

- **Process per sub-project:** brainstorm (superpowers:brainstorming) → spec → writing-plans → execute
  subagent-driven (FRESH implementer + INDEPENDENT reviewer per task, never self-validate) → **measure
  honestly** → merge to `main` per slice. Slice into tiny, individually-reviewable increments (the owner's
  standing preference).
- **`main` MOVES under you** (parallel sessions). `git log -1 main` at start AND right before every merge.
  The literal checkout dir usually sits on a divergent branch — verify the ref. Work in a worktree off main
  (`git worktree add -b <name> ../<name> main`); `git reset --hard` is hook-blocked.
- **Determinism is the ONLY invariant:** same (config, seed) → byte-identical run-to-run (`world.test.ts`,
  first test). RNG consumed ONLY at reproduction, ascending live-slot order; hot loop RNG-free. The frozen
  golden hash is RETIRED — do NOT add a byte-identical-when-off test or a hardcoded stateHash. Per feature:
  ablation toggle + same-(config,seed)→same-hash test + a **headless liveness guardrail** (interconnection
  can crash the population to extinction).
- **Gated-synapse template** for any new brain input/output: enum slot in `Brain` (genome.ts) + a seed/mutate
  gate (the `isWall/isHunger/isPhero` pattern — gated weights draw NO RNG when off) + a sense-buffer write in
  sense.ts (or actuator read in economy/brain) + weights in `steer()` (brain.ts) + an eligibility trace for
  Baldwin learning. Reference: the 16 PHERO_C* scent synapses + the eat-gate output (a hidden-layer output).
- **Measure honestly — this is the highest-value output.** After each wiring, run a multi-seed
  `--demo` probe and SHOW whether behavior actually shifted (numbers, file:line evidence). If a wiring
  doesn't move behavior, SAY SO. "Built but inert" is a failure, not a win.
- **Commands:** tests `NODE_OPTIONS=--expose-gc npx vitest run` (~300s, 371 tests); `npx tsc --noEmit`;
  `npx eslint src`; build `npm run build`; demo `npm run dev -- --port <FRESH> --strictPort` (always a fresh
  port — same-port reload serves a STALE main.ts). `make` fails in a worktree — run npx directly. Commit hook
  BLOCKS the Co-Authored-By trailer — omit it. Track work in BEADS (`bd create/update/close`,
  `bd sync --flush-only`), not TodoWrite.
- **Probes (extend, don't reinvent):** `src/headless/liveness-probe.ts [ticks] [seeds] [k=v overrides]`
  (reports pop + FORAGE_PREF/DIET mean/std — the divergence signal); `src/headless/life-history.ts`;
  `src/headless/mate-encounter-probe.ts`; the predation probe (find it under `src/headless/`). Pass demo
  config via `DEMO_OVERRIDES` (exported from life-history.ts).

**Read these memories first** (life-sim memory dir): `brain-consolidation`, `food-specialization`,
`predation-engine-ceiling`, `sexual-reproduction-speciation`, `diversity-levers`, `perception-scale-mismatch`,
`feature-default-on-policy`. They contain the verified levers and the dead ends — don't re-discover them.

---

## The unified brain layout you're extending (genome.ts, `BRAIN_GENES=146`)

```
0–19   core/sight/wall/flow/hunger     20–35  PHERO_C0..C3 (16 scent synapses)
36–40  EAT_GATE_*    41–42 AGE_*   43–44 READINESS_*     NAMED_BRAIN_GENES = 45
45…    HIDDEN_W1 (HIDDEN_INPUTS=20 × HIDDEN_UNITS=4)      125… HIDDEN_W2 (4 × HIDDEN_OUTPUTS=3: turn,thrust,eatGate)
137 GLOW_BIAS · 138 GLOW_HID(4) · 142–145 GLOW_SENSE_*    BRAIN_GENES = 146
```
Every new INPUT grows `HIDDEN_INPUTS` + `NAMED_BRAIN_GENES`; every new OUTPUT grows `HIDDEN_OUTPUTS`. All
offsets after `HIDDEN_W1` are DERIVED — you change the enum + the two size constants, the rest recomputes.
`HIDDEN_UNITS=4` (owner: bump to 6 only if it bottlenecks). The eat-gate is the reference output; the scent
channels are the reference multi-synapse input. Note: the inspector (brain-view.ts) must render every new
node — the parity test (`computeBrainState` vs `steer`) is your guardrail; use NON-saturated weights or
saturation hides a missing term.

---

## BUCKET A — Wire the unbuilt brain I/O (decision, not reflex)

Makes creatures *perceive their own body* and *decide* their consequential actions. Sequenced first because
A2 (bite-gate) is the lever Bucket B needs, and A1 (own-size/diet) shapes divergent predator/prey strategy.

### A1 — Interoceptive INPUTS (safe, do first)
**Progress (2026-06-24):** sliced A1a/A1b/A1c (spec: `docs/superpowers/specs/2026-06-24-A1-interoceptive-inputs-design.md`).
✅ **A1a (own-SIZE + own-DIET) SHIPPED to main `a7421fe`** — both feed linear+hidden, evolve-only (no elig — constant-within-life bias-runaway avoided), behind `cfg.bodySense` (ON); `BRAIN_GENES 146→158`; review clean. Measured: mechanism live (ablation) but not cleanly recruited (size→motor sign-inconsistent; own-DIET grazer-pinned by the predation ceiling).
✅ **A1b (local-CROWDING) SHIPPED to main `d9e7ca3`** — `senseCrowding` fixed-radius neighbor count (start-of-tick hash, indep. of vision + dead lever-D); steer reads crowdN behind bodySense, CROWD LEARNS (has elig; SIZE/DIET stay evolve-only); `BRAIN_GENES 158→164`; 378 green, review clean. Measured HONEST: wired+live but largely INERT at 8192² (mean crowding ~0.5, ~35-40% feel ≥1 neighbor in 36u, far below norm=8; density wall NND≫36u) — NOT pure-zero (radius 36 > dead lever-D 12); activates if Bucket B concentrates prey.
✅ **A1c (fertility-under-foot) SHIPPED to main `223b7e5`** — `senseFertility` sums local biomass over active channels into `store.fertHere`; steer reads `fertN = min(fertHere/foodCap, 1)` behind bodySense, FERT LEARNS (elig; SIZE/DIET stay evolve-only); `BRAIN_GENES 164→170`; 381 green, review clean. NB normalized by `foodCap` (the spec's `foodMaxFertility` was a fertility clamp, not the biomass scale — controller correction). Measured: **GENUINELY LIVE — the first engaged A1 input** (nonzero 96-100%, normalized-input mean 0.17-0.30, max 31-38 vs cap 40); recruitment-into-behavior unproven.

**✅ A1 BUCKET COMPLETE (`BRAIN_GENES 146→170`, `bodySense` umbrella flag ON).** All four interoceptive inputs decision-wired (mandate 1 closed for own-body sensing). **Honest pattern: the inputs are correct machinery, but only fertility-under-foot is behaviorally LIVE at the 8192² demo scale — own-DIET is grazer-pinned (predation ceiling) and local-CROWDING is density-walled (NND ≫ sense radius). Recruitment into behavior is unproven for all four. The behavioral payoff for size/diet/crowd is gated by the density/predation fix in Bucket B.** Next per the roadmap order: A2 (brain-gated bite/breed/scent-deposit OUTPUTS — changes ACTIONS, the lever Bucket B needs).

Add as gated hidden+linear inputs (seeded 0 → additive, liveness-safe; they evolve in): **own-SIZE**
(normalize by ~2·cfg.cellRadius), **own-DIET** (the gene is already 0..1), **local-CROWDING** (the hash
neighbor-count scan already exists in `economy.metabolize` — plumb a sense-time count into a store buffer),
**fertility-under-foot** (sample the food field value at the body). Grow `HIDDEN_INPUTS` 20→24.
**Measure:** own-size → do small bodies flee more / large hold ground (divergent turn/thrust vs size)? own-diet
→ does chase-vs-flee become learnable? Report the behavior shift or its absence.

### A2 — Brain-gated OUTPUTS (unlocks predation-as-decision)
Promote reflexes to hidden-layer outputs (grow `HIDDEN_OUTPUTS` 3→6):
- **BITE_GATE** — predation becomes a decision. `hunt()` (economy.ts:~63–128) currently auto-bites the
  nearest edible target every tick using the DAMAGE gene. Gate the drain (economy.ts:~112) on a `biteGate[i]`
  sigmoid output behind `cfg.brainGatedBiting` (OFF-path ×1 → byte-identical).
- **SCENT-DEPOSIT gate** — `depositScent` (economy.ts:~151) is passive `gene×strength`. Multiply by a
  `scentGate[i]` output → a modulable comms channel (the brain chooses when to broadcast vs go silent). Glow
  already works this way — copy it.
- **BREED_GATE** — `reproduce()` is a pure energy-threshold reflex. Add a `breedGate[i]` output; gate it
  AFTER the viability/satiated checks but **BEFORE any `spawnChildSlot`/rng draw** (mirror the cooldown skip)
  so the determinism stream is preserved. Composes with the existing viability gate.
**Measure:** does brain-gated bite raise predEncounter / let predators *choose* not to bite armored prey?
Does breed-gate shift repro timing? Does scent-gate produce silence-when-fleeing?

### A3 — glow-sense → hidden layer
Glow-sense (slice F3) is the lone sense wired only to the linear path. Add a `HiddenInput.GLOW_*` slot so it
can participate in conditional logic ("approach glow only if hungry"). Small, finishes the symmetry.

### A4 — Finish the sexual-repro brain seams (against the unified layout)
Per `docs/superpowers/specs/2026-06-24-sexual-reproduction-speciation-results.md` + the `sexual-reproduction-
speciation` memory: **crossoverBrain** = real per-weight parental crossover over the full 146 genes incl. the
hidden layer (mirror crossoverScalarGenes); **CREATE brainDistance** (per-weight L2) and plug it into
`geneticDistance`'s comment-seam → behavioral (not just dietary) reproductive isolation; **PREFERENCE as an
NN input** (mate choice becomes a brain computation); route **mate-finding through the kin-scent channels**
(kin-cos/kin-sin already exist) to fix the 8192² sight-only-seeking bleed-out (re-run mate-encounter-probe).
**Measure:** do brainDistance + kin-scent produce behavioral mate choice / any speciation signal? (Expect it
to need diversity too — see Bucket B / the food retune.)

---

## BUCKET B — Crack predation (the encounter-geometry ceiling)

The hardest, and the one that converts a grazer world into a food web. **Read the `predation-engine-ceiling`
memory first** — it has the verified levers and the dead ends:
- Density is DEAD as a lever; economy AMPLIFIES but doesn't CREATE predation; **FOUNDING is the gate**
  (`predatorSeedClusters` rescues otherwise-dead predator seeds, commit 3cb1ba3). The intrinsic ceiling is
  LOW-CONTACT/HOLLOW-HUNTING: NND ~75u ≫ biteRange ~16u → predEncounter never >0.06.
- Verified fixes that keep predators alive at the big world: `foodCap40 + regen .06` (concentrates prey) or
  `shrink to 4096²`. Cannibalism toggle = small gain.

**B1 — Re-measure** predEncounter at the CURRENT config (post brain-consolidation + food-spec) with the
predation probe; the world changed, so the ceiling may have moved.
**B2 — Apply the verified founding + concentration levers** AND the NEW BITE_GATE (A2): with bite a decision
and prey concentrated by food blobs, predators may finally contact prey. This is also where the **food-field
retune** (bead `life-sim-4bxw`: sparser, blobby, independently-drifting, overlapping/merging two-channel
patches — the owner's explicit ask) belongs, because food concentration is a predation lever AND it deepens
the two-niche forage diversity.
**B3 — Tune for a stable predator-prey dynamic** — coexistence at minimum, boom-bust "breathing" ideally
(the open gap from the m7.5-ecology work). **Measure honestly:** predator fraction over time, predEncounter,
prey response. If the engine ceiling holds, SAY SO and surface the structural options (avoidance-driven
vision, relax the one-scale constraint) to the owner rather than tuning forever.

---

## BUCKET C — Close the visibility gaps (mandate 2: nothing wired-but-invisible)

Every heritable trait gets a radar axis (`LENSES` in radar-view.ts); body-relevant genes drive appearance
(renderer.ts dot attributes — note there is NO `src/render/detail/` trait-module registry on main; that's
the un-merged creature-visuals branch). Every synapse incl. the hidden layer shows in BrainView (scent + glow
now do — done).
- **C1 — DISPLAY** is an ornament invisible on all three surfaces AND weighted 0 in geneticDistance. Drive a
  visible appearance cue from it (so sexual selection can be *seen* moving it) + a radar axis.
- **C2 — PREFERENCE** → radar axis (and it becomes an NN input in A4).
- **C3 — The ~13 fully-invisible heritable genes** (MAX_SPEED, EAT_RATE, SENSE_RANGE, MAX_THRUST,
  SHELTER_DRIVE, COHESION_DRIVE, SENSE_RANGE_B/C, PHERO_DEPOSIT, MATURITY_AGE, SENESCENCE_AGE — full list in
  the audit §A): give each a radar axis and/or an appearance cue for the body-relevant ones.

---

## Suggested order & dependencies

1. **A1** (interoceptive inputs) — safe, foundational, shapes predator/prey strategy.
2. **A2** (brain-gated outputs incl. BITE_GATE) — unlocks B.
3. **B** (crack predation, with the food-field retune) — the emergence payoff.
4. **A3 + A4** (glow→hidden, sexual-repro seams + PREFERENCE input).
5. **C** (visibility sweep) — depends on A4 for PREFERENCE; finishes mandate 2.

Each is one brainstorm→spec→plan→subagent-build→review→measure→merge cycle. Update this file's checkboxes as
you land each. Definition of done for the whole roadmap: every audit gap closed, predator-prey coexistence
demonstrated (or the ceiling honestly documented as structural), and a multi-seed `--demo` run showing the
newly-wired systems actually SHIFT behavior — with numbers.
```
