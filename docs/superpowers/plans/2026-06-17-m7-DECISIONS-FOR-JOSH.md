# M7 (Evolution) — Decisions & Uncertainties for Review

**Status:** complete, reviewed clean, **NOT merged** — awaiting your call. Branch `m7-evolution` (HEAD `7c8c06c`), `make check` green (297 tests). I did not merge; that's yours.

This is the end-of-work review list you asked me to collect while you were away. Read the four ⚑ items — they're the decisions I made or deviations I took that you might want to overrule.

---

## What M7 actually delivers

Heritable mutation is **on** (rates > 0, riding the existing `rng.split(2)` substream). Foragers now **adapt under pure economic selection** — "ate enough → reproduced; energy too low → died." There is **no fitness function, score, or ranking anywhere in the sim.** That was the cardinal rule for the whole milestone and it held end-to-end (the final review traced every board/lineage/species reference and confirmed none are ever read back into a survival decision).

On top of the mutation engine, M7 adds **observation-only** instrumentation to watch evolution happen:
- **Trait & diversity telemetry** — `genomeTraits`, `genomeSignature`, `genotypicDiversity` (Simpson index over morphology buckets).
- **Hall of Fame** (key **J**) — largest live founding lineages, via `sampleLineages` → `lineageBoard`.
- **Phylogeny tree** (key **Y**) — live lineage descent, via `LineageLog` / `serializeLineageLog`.
- **Menagerie / species board** (key **K**) — greedy speciation via `sampleSpecies` → `speciesBoard`.

All four are sampled at the existing `metricsEvolutionInterval` cadence (default 16) and **never read back by the sim**. `founderId` and the `LineageLog` *are* on the byte-identical determinism contract (written in canonical ascending order, no new RNG); the boards/telemetry are derived summaries and are not hashed.

---

## The adaptation is real, and verified at HEAD

I re-ran `pnpm exec tsx src/headless/evolution-probe.ts` on the final commit. It is a controlled 4-run experiment isolating selection from drift:

```
A ADAPT-scarce    meanTurn=1.603 (lateMin 1.307, orgs~71, gen 30) from start 0.60
B ADAPT-abundant  meanTurn=0.621 (lateMin 0.618, orgs~57, gen 2)  ← CONTROL
C DRIFT-scarce    meanTurn=1.242 (fit allele out-reproduces)
D DRIFT-abundant  meanTurn=0.813 (no selection, holds baseline)

→ ADAPTATION: under scarce food, mutation+economic-selection ADAPTS the steering
  trait 0.60 → 1.60 (sustained — late trough 1.31 > start), while the
  mutation-IDENTICAL abundant control stays at 0.62. No fitness function.
```

The measured trait is the population-mean `sensorLat→turn` weight (steering toward off-axis food). Run **A** climbs; control **B** (same mutation engine, abundant food) stays pinned at the start — so the climb is **economic selection, not a mutational random walk.** That contrast is the proof.

**⚑ Uncertainty (c) — live demo vs. headless proof.** The browser demo *shows* emergence, diversity, lineage turnover, and speciation, and it's compelling to watch — but a single uncontrolled run is **not** a proof of directional adaptation by itself. The proof lives in the headless probe (the A-vs-B control). When you want to *demonstrate* adaptation rather than *watch* the ecosystem, run the probe. Also, per the probe's own caveat: the climb has **no fixed point** (unbounded Gaussian mutation + a gradient that stays positive past the hand-tuned 1.5), so the *magnitude* (~1.6) is run-length/founder-sensitive — **the direction and sustained-ness are robust; the exact endpoint is not.**

---

## ⚑ Decisions you may want to overrule

### ⚑ (b) Species distance is composition-based, NOT NEAT innovation-id matching
The M7 design spec said "match genes by `Gene.innovation`." **That is degenerate in this codebase** — every founder gene built by `buildForagerGenome` / `buildAutotrophGenome` / `buildCritterGenome` carries `innovation: 0` (critter-genome.ts:30, 108, 155), so innovation ids are not unique within a genome and cannot key a gene alignment. I replaced it (Task B7) with a distance over **per-cell-type gene counts + |Δconnection-count| + |Δmotor-count|, normalized by max gene count, plus an index-aligned connection-weight term** over the shared rule prefix. `SPECIES_THRESHOLD = 1.0`, greedy first-match clustering. This keys exactly the morphology axes `genomeSignature`/`genotypicDiversity` already bucket. The final reviewer independently verified it's symmetric, zero on identical clones, and sensitive to `changeType` morphs. **If you intended true NEAT speciation, the fix is upstream: give founder genes real innovation ids at construction — then revisit this.** Until then composition distance is the correct substitute.

### ⚑ (d) Panel layout — two intentional artifacts, not bugs
- **J and Y render under the always-on opaque `#legend` panel** (the beginner-orientation overlay, top-left). They're occluded until you press **H** to hide the legend. This is the intended layered design — the legend is the first thing a newcomer sees; the explorer panels are for when you're already oriented. With the legend hidden, J / Y / K all render cleanly and non-overlapping (verified in-browser, screenshots captured).
- **The phylogeny panel extends ~77px below a 718px *headless test* viewport.** It has internal `overflow:auto` and fits on a normal-height display — this is a test-viewport artifact, not a layout bug. I lifted Hall of Fame (top 256→100) and relocated the menagerie to the free top-center band to clear two real overlaps I found in the consolidated browser check (commit `2a8d5e9`).

### ⚑ (a) The M7 economic-selection framing (context, not a deviation)
Stated explicitly because it shaped every design choice: **selection is never imposed.** When directional selection looked weak during tuning, I deepened it only through *economy* knobs (food scarcity via `lightRegen`, mutation supply via rate/σ, founding population size) — never a fitness term. If you ever want stronger/faster adaptation, that's the lever set; adding a score is off the table by design.

---

## Final review outcome

A whole-branch review (opus, the full `aefe90c..` range) returned **Ready to merge: Yes** — zero Critical, zero Important. It confirmed: cardinal rule airtight under cross-file tracing; zero new RNG; determinism guard non-vacuous and extended to cover `founderId` + lineage log; hot loop still alloc-free under cadence-gated sampling; `genomeDistance` sound. Two minors were triaged **acceptable as-is** (a phylogeny truncation-count label that's arguably the more useful number; a deliberate `pointer-events` omission so scrollable panels capture the wheel). One recommendation — a dead `GenomeStore.nextFounderId()` method — **I removed** (commit `7c8c06c`); `register()` stamps the id inline and nothing called it.

**One open recommendation I did NOT action** (your call): add a unit test asserting `sampleSpecies`/`sampleLineages` return identical boards for identical world state, to lock the telemetry's determinism-as-function-of-state against future Map-iteration regressions. The reviewer (and I) are confident it holds today — the scans are index-ordered with fully-disambiguated total-order sorts — so this is belt-and-suspenders, not a gap. Say the word and I'll add it.

---

## To drive it yourself
- **Watch evolution:** `pnpm dev` → keys **J** (hall of fame) · **Y** (phylogeny) · **K** (menagerie) · **G** (genome) · **H** (toggle legend so J/Y are visible).
- **Prove adaptation:** `pnpm exec tsx src/headless/evolution-probe.ts` (the A-vs-B control above).
- **Gate:** `make check` (297 tests).
