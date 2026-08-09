# One-shot: consolidate all life-sim work into `main`, run the full package, fix lint

You are picking up a project called **life-sim** with no prior conversation context. Your job
is to **tidy up and merge all outstanding worktree/feature-branch work into `main`**, get the
**live demo running and showing the full package**, and **fix the lint**. You have full
authority to make the changes needed to realize the owner's vision (below) — the owner wants
this *done*, not a plan to rubber-stamp. The only hard rule before you touch anything:

> **Ground yourself in the actual code and the live git state first.** As of **2026-06-22 the
> owner confirmed all branches are wrapped up / frozen**, and the tips below were re-verified at
> that point — so you should see *no* drift now. Still treat every SHA and count as a *hint to
> verify*: re-run the §3 commands once before you act. If anything has moved, the branches are no
> longer frozen — stop and reconcile before merging.

Work from the **main checkout** `~/CodingProjects/life-sim` (NOT a `.claude/worktrees/*`
worktree — those have a `pnpm`/`node_modules` gotcha, see §10). The main checkout is currently
on branch `feat/env-walls-flow`; switch it to `main` as your first real step (`main` is not
checked out in any worktree, so this is safe).

---

## 1. The owner's vision (the "why" — every decision serves this)

life-sim is being rebuilt as an **"Evolution Playground"**: an interactive 2-D world where
neural-net critters swim, eat, breed, mutate, **learn within their own lifetimes** (Baldwin /
reward-modulated Hebbian), and **evolve across generations** — and you can reach in *live* (drop
food, spawn/cull, tune any knob, follow one creature and watch its brain fire).

The pivot is **feel-first over research rigor**. Success is *felt*, not measured:

- **Legible behavior is the soul** — you must be able to read a creature's intent from its motion
  and watch it visibly get better, both within one life and across generations.
- **Baldwin within-life learning** is core (the only thing that delivers "watch it get better in
  its lifetime").
- **Appearance genes (hue/size/shape) + fading motion trails** make evolution watchable with the
  naked eye; the aesthetic is **bioluminescent deep-sea** (near-black bg, glowing creatures/food,
  parts colored by function).
- **"The full package" = god-tools + live-knob tuning + inspect-and-follow** as first-class v1
  features, on **a world that breathes and stays alive**.

Spec: `docs/superpowers/specs/2026-06-20-evolution-playground-design.md`. Decision log:
`docs/decisions/INDEX.md` (read the **2026-06-20 REBUILD PIVOT** and **2026-06-22** entries).

---

## 2. Definition of done

1. `main` contains all the *live* outstanding work (see §3 for what's live vs. drop), reached via
   two clean fast-forwards plus **two** hand-resolved merges (env cluster `world.ts`, then diversity-core).
2. `npx tsc --noEmit` clean, `NODE_OPTIONS=--expose-gc npx vitest run` green, and the headless
   alive-guardrail passes **on the merged tree** (§7).
3. **Lint is green** — real issues fixed, the one flaky rule handled at config level (§9).
4. The **live demo runs** (fresh `vite` port) and shows the full package, verified to **stay alive**
   (births firing, guardrail passes) — see §8. Ship the largest stable subset and report exactly
   what's on/off and why.
5. Stale worktrees/branches pruned, a pre-merge safety tag left behind (§4, final step).

---

## 3. Ground-truth topology — verify, then act

The history is **linear at the spine** and **fans out into feature lines**. `main` has NOT moved
since the rebuild — it is a strict *ancestor* of everything, so promoting the rebuild is a pure
fast-forward, never a conflict.

**Verify the whole picture yourself before trusting it:**

```bash
git worktree list
git branch -a
for b in rebuild/ecosim feat/diversity-core env/walls-flow feat/env-walls-flow \
         feat/diversity-levers worktree-nifty-plotting-yao backup/pre-onbirth-split \
         worktree-enumerated-dancing-crystal; do
  echo "== $b =="; git rev-list --left-right --count main...$b   # left=main-only right=branch-only
done
```

**Verified tips @ 2026-06-22 (left=main-only / right=branch-only):**

| Branch | Tip | main…branch | Note |
|---|---|---|---|
| `main` | `15718e8` | — | unchanged since rebuild; strict ancestor of all below |
| `rebuild/ecosim` | `c6cbc87` | 0 / 46 | the spine |
| `env/walls-flow` | `f92efea` | 0 / 89 | walls/flow physics stack |
| `feat/env-walls-flow` | `5f0bc7c` | 0 / 70 | SP1 + predator bundle + UI |
| `feat/diversity-core` | `b1d00c5` | 0 / 63 | A→E levers |
| `feat/diversity-levers` | `01ec289` | 0 / 59 | absorbed by env branches |
| `worktree-nifty-plotting-yao` | `8976506` | 0 / 59 | tree-identical to levers (`d2452840`) |
| `backup/pre-onbirth-split` | `24cd6d7` | 0 / 42 | drop |
| `worktree-enumerated-dancing-crystal` | `15f179f` | 17 / 0 | old engine, behind |

| Branch | Verdict | What it is |
|---|---|---|
| **`rebuild/ecosim`** | **SPINE — FF `main` to this first** | The from-zero "Evolution Playground" rebuild. `main` is a strict ancestor (`main…rebuild = 0 / 46`). FF is zero-conflict. |
| **`env/walls-flow`** | **MERGE (1st of cluster — FF)** | The env physics build: Voronoi biome **walls** (`walls.ts`, `wall-gen/{ca,noise,rooms}.ts`) + divergence-free **flow** field (`flow-field.ts`) + conservative food **advection** + walls **dam** food + walls **occlude** vision + swept collision + wall/flow **brain senses + learning** + an env alive-guardrail probe. **The ONLY branch with the walls/flow CODE.** Contains all of `feat/diversity-levers` (UI + levers). Ships `wallRegionCount=5`, `wallDensity=0.43`, `flowStrength=0.15`, `cohesionHueBlind=true` **ON by default** — see §5. |
| **`feat/env-walls-flow`** | **MERGE (2nd of cluster — real merge)** | **Misleadingly named — has NO walls/flow code.** Real payload: **SP1 "sticky pockets"** (`foodPatchRichness` deep-predator-haven vs shallow-grazer-refuge + `deadWaterCost` isolation tax), **predator founding-protection** (cluster-seed predators into the deepest pockets), **aquarium UI knobs** (pocket richness/variation/isolation + predator bundle), and an **OFF-state golden-hash regression test** (the *kept* seeded-local contract — see §6, do not delete it). Also contains `feat/diversity-levers`. Diverged from `env/walls-flow` at the env-plan doc (`b5dbd4e`); the two **now CONFLICT in `src/core/world.ts`** (see §4 — both edit the world step). |
| **`feat/diversity-core`** | **MERGE LAST** | The A→E diversity sweep — 6 OFF-by-default sim levers (motorSquash, two food channels + FORAGE_PREF, per-pocket K variance, crowding mortality, counter-bite, hunger sense). **Mostly core but NOT UI-free** — its E2 hunger work also touches `src/app/observability/brain-view.ts` + `knobs.ts`. **The biggest conflict generator** (~11 files, see §4). |
| `feat/diversity-levers` | **NO-OP / drop** | Strict *ancestor* of both env branches — absorbed when they merge. `git merge` will say "Already up to date." |
| `worktree-nifty-plotting-yao` | **NO-OP / drop** | **Byte-identical tree** to `feat/diversity-levers` (same tree OID `d2452840`, despite a different merge-commit SHA). Pure duplicate. |
| `backup/pre-onbirth-split` | **DROP — do not merge** | Throwaway snapshot; its SIZE-couplings work already lives on `rebuild/ecosim` in a *superset*. **Verified** merging would **regress the food economy** (`foodCap 40→20`, `foodRegen 0.06→0.04`) and drop diagnostics. Nothing to gain. |
| `worktree-enumerated-dancing-crystal` | **LEAVE — old engine** | 17 commits *behind* the spine, 0 ahead; pre-rebuild Senses milestone + golden tests (the research machinery the pivot **deleted**). Zero unmerged work. Do **not** merge it (it would resurrect the dropped golden-hash machinery). |

So the live set collapses to **3 units**: the spine (`rebuild/ecosim`), the **env cluster**
(`env/walls-flow` then `feat/env-walls-flow` — **one `world.ts` conflict between them**, together
carrying walls+flow+SP1+predator-bundle+UI+levers), and **`feat/diversity-core`** (the core levers).

---

## 4. Merge plan

**Before you start:** `git checkout main` and tag a safety point: `git tag premerge/main-$(date +%Y%m%d) main`
(or a plain `git branch premerge-backup main`). Commit nothing dirty into the merge — confirm
`git status` is clean.

**Re-run `git merge-tree` to re-confirm the conflict surface before each step** (branches moved
since this was written):

```bash
git merge-tree --write-tree <branchA> <branchB>   # exit 0 = clean; nonzero / "CONFLICT" markers = real
```

**Order (each step is a rewind target — verify green before the next). There are TWO
hand-resolved merges, not one: the env cluster's `world.ts`, then diversity-core.**

1. **`git checkout main && git merge --ff-only rebuild/ecosim`** — pure fast-forward, zero conflicts.
2. **`git merge --ff-only env/walls-flow`** — also a pure fast-forward (it has `rebuild` as ancestor
   and `main` is now at `rebuild`). `main` becomes the walls/flow/env-sensing world (+ UI + levers).
   Zero conflicts.
3. **`git merge feat/env-walls-flow` — hand-merge #1 (ONE file: `src/core/world.ts`).** Real merge
   commit. Adds SP1 pockets + predator founding-protection + aquarium UI + the OFF-state golden test.
   `config.ts`/`economy.ts`/`food-field.ts`/`*.test.ts` auto-merge cleanly; **only `world.ts`
   conflicts** — both sides edit the per-tick world step / seeding: `env/walls-flow` added
   wall-collision + flow + wall-spawned-offspring relocation; `feat/env-walls-flow` added
   pocket-founding (cluster-seed predators into deepest pockets). **Keep BOTH** — walls/flow physics
   *and* the founding/relocation logic must coexist; read the hunk, don't pick a side.
4. `feat/diversity-levers` and `worktree-nifty-plotting-yao` — run for completeness; expect
   **"Already up to date."**
5. **`git merge feat/diversity-core` — hand-merge #2, THE big one (~11 files).** Verified conflict
   set (worst-first):
   - **`src/core/genome.ts`** + `genome.test.ts` — **the #1 danger.** BOTH the env stack (wall/flow
     sense genes) **and** diversity-core (E2 HUNGER input gene + FORAGE_PREF) add **RNG-gated gene
     draws** here. The merge must keep **every** gated draw from both sides in a consistent order
     (see §6) or it silently corrupts every seeded run.
   - **`src/core/brain.ts`** + `brain.test.ts` — same dual-input problem: env wires wall/flow inputs
     into `steer()`/eligibility; diversity-core wires the interoceptive hunger input. Both must route.
   - **`src/core/food-field.ts`** + `food-field.test.ts` — per-cell Kcell + channel-B2 (diversity)
     vs. wall-damming + advection (env). Both rewrote it.
   - **`src/core/config.ts`** — **union of all three OFF/legacy knob blocks** (diversity A–E + walls/flow
     + SP1/predator). Additive; resolve `cohesionHueBlind` per §5.
   - **`src/core/world.ts`** — conflicts AGAIN (it's the cross-cutting hotspot — both merges touch it).
   - **`src/core/economy.ts`** — counter-bite (E1) vs. dead-water/predation economy.
   - **`src/app/observability/brain-view.ts`** + `knobs.ts` — hunger-sense brain-view labels +
     knob rows vs. wall/flow labels + aquarium knob rows. Keep both label/knob sets.
   - `.beads/issues.jsonl` — append-only tracker; resolve by **concatenate + dedupe** (mechanical noise).

   **`genome.ts`, `brain.ts`, and `food-field.ts` need a human read, not a blind union.** See §6.

**Note:** steps 1–2 are free fast-forwards; the real work is the two hand-merges (3 and 5).
Landing diversity-core *last* means you resolve its overlap exactly **once**, against the fully
settled env cluster — don't reorder it earlier.

**Final — tidy up (after §7 is green):** prune the now-merged worktrees and delete merged
branches, keeping `main`, the safety tag, and `worktree-enumerated-dancing-crystal` (or archive it
deliberately). Check each worktree is clean first.

```bash
git worktree remove <path>            # for diversity-core, nifty-plotting-yao, env worktrees once merged
git branch -d feat/diversity-core env/walls-flow feat/env-walls-flow feat/diversity-levers ...
```

---

## 5. Three decisions that are genuinely the owner's — recommend, proceed, report

You have authority to proceed. For each, I give the evidence-backed recommendation; **apply it,
then state clearly what you chose** so the owner can veto. Don't block unless the owner is present
to answer.

1. **`cohesionHueBlind` default** (diverges: `false` on diversity-core, `true` on the env cluster —
   *last merge wins*, so set it deliberately). **Recommend `true` (hue-blind).** Evidence (decision
   log + memory `diversity-levers`, commit `12423d7`): hue-blind schooling gave **~3× sustained
   predators, 0 extinctions, ~4.5× predator encounters** — predation became viable/visible, which
   is exactly the breathing, legible world the vision wants. (Cardinal-rule note: cohesion reading
   hue is a *cohesion target*, the sanctioned exception — it is **not** a fitness/survival read.)

2. **Walls + flow ON by default** (verified env defaults: `wallRegionCount=5`, `wallDensity=0.43`
   (~31% realized), occlude vision, dam food, `flowStrength=0.15`, `flowScale=18`). **Recommend ON**
   — spatial structure / navigable pockets is core to
   the vision and is the env feature's intended shipping state — **but only if the alive-guardrail
   stays green** on the full merged tree. Walls dam food and the ecology is historically
   collapse-prone (§8). If walls-on collapses the world, keep walls ON but reduce `wallDensity` /
   tune `flowStrength`, and document it. Verify, don't assume.

3. **Ship SP1 sticky-pockets** (`foodPatchRichness` + `deadWaterCost`, only on `feat/env-walls-flow`).
   **Recommend yes** — it's additive (OFF/legacy defaults) and is the "heterogeneous pockets =
   diversity foundation" direction in the decision log. Merging `feat/env-walls-flow` (step 2)
   brings the code in; enabling its knobs is a §8 full-package choice gated on the guardrail.

---

## 6. Invariants you must not break

- **Determinism = seeded-reproducible on one machine** (same seed → same local run, for replay/
  debug). The pivot **deliberately dropped** byte-identical *cross-platform* reproducibility and the
  *cross-platform* golden-hash CI — **do not re-add that machinery**, and do **not** pull in
  `worktree-enumerated-dancing-crystal`'s old golden tests (they'd resurrect it). **BUT** the
  OFF-state golden-hash test on `feat/env-walls-flow` (`5f0bc7c`) is the *kept, narrowed* contract —
  it pins the seeded-local OFF-state byte-identity invariant (env-off ⇒ env genes never drawn).
  **Keep it.** Don't confuse the two and delete the wrong one.
- **RNG draw-order integrity (the merge's #1 risk — and it's now DOUBLE).** Every gene/sense is
  **RNG-gated so its OFF path preserves the seed's draw order** and is byte-identical to base. The
  killer: BOTH clusters add gated brain-input genes to the **same** `genome.ts`/`brain.ts` — the env
  stack adds **wall + flow sense genes**, diversity-core adds the **HUNGER input gene + FORAGE_PREF**.
  When you hand-merge, **every** gated draw from **both** sides must survive in a **consistent,
  agreed order** — a naive union that double-draws, drops one side's gate, or reorders RNG compiles
  fine and passes `tsc` but **silently breaks every seeded run**. After resolving, run the
  determinism gate (`src/headless/gate-check.ts` — `foodChannels 1` vs `2` stateHash @200/@400 must
  stay byte-identical) **and** the env ablation byte-identity test (env-OFF ⇒ env-sense genes never
  drawn, from `env/walls-flow`).
- **Cardinal rule: no fitness/score/lineage/founderId/species read into any survival, reproduction,
  death, or movement decision.** Selection is purely emergent (fed past repro bar → reproduce;
  energy ≤ death floor → die). Ranking/telemetry/color-by-lineage live **only** in `src/app/**`,
  never on the sim hot path.
- **OFF-by-default = true no-op.** Every diversity-core lever (`motorSquash` false, `foodChannels`
  1, `counterBiteFraction` 0, `crowdingMortality` 0, `pocketCapVariance` 0, `hungerSense` false)
  stays byte-identical at default post-merge.
- **Single config / one scale.** `defaultConfig()` in `src/core/config.ts` is the ONE source of
  truth shared by the demo, the headless harness, **and every test**. Don't fork a demo-scale
  config; any default you change (hue-blind, walls-on) changes all three consumers at once.

---

## 7. Verify the merge — mandatory gate (run from the main checkout, via `npx`, NOT `make`)

```bash
npx tsc --noEmit
NODE_OPTIONS=--expose-gc npx vitest run
npx tsx src/headless/gate-check.ts                 # determinism gate (byte-identity at OFF defaults)
npx tsx src/headless/run.ts 5000 1 --report        # alive-guardrail smoke
npx eslint .                                        # then §9
```

The guardrail (`run.ts --report`) FAILS LOUDLY on extinction, zero-births, pop pegged at
`maxOrganisms` (runaway), or a flatlined population. **5000/1 is a smoke test** — for the final
merged full-package demo, run a longer, multi-seed pass (e.g. several seeds, ~50–100k ticks) to
honor the real alive-contract.

**Verified pre-merge baseline (on `feat/diversity-core`, this session):** `tsc` **clean**;
vitest **165 pass / 16 files**; eslint **10 errors** = 6 `no-unnecessary-type-assertion` on
`Float32Array[i]!` (`brain.test.ts:248,267,339`, `economy.ts:120,217`, `food-field.ts:135`) +
4 `no-unsafe-argument`/`no-unsafe-assignment` (`harness.test.ts:8,20,21`). Re-baseline each branch
and the merged tree yourself; this tells you which lint is pre-existing vs. merge-introduced.

---

## 8. Run the demo + assemble the full package

```bash
npx vite --port 5199        # fresh port dodges the stale-module gotcha (§10); open http://localhost:5199/
```

Entry: `src/app/main.ts` (+ `index.html`). Live config = `defaultConfig()`; the browser **Knobs**
panel (`src/app/observability/knobs.ts`) mutates `config[key]` live; `globalThis.sim`
(`{world, config, health(), ...}`) is on the console. Scale is **8192²**, `maxOrganisms 32768`,
14 food pockets.

**"Full package all at once" — but the autonomous ecology has historically COLLAPSED** (memory
`live-demo-ecology-broken`: drift strands plants, foragers stop breeding, births → 0). Stacking
behavior-changing knobs that were never co-validated can kill the world. So:

> **Flip knobs ONE AT A TIME, and after each, confirm the `births` line is non-zero and the
> headless guardrail still passes. Ship the largest stable subset. A living partial demo beats a
> dead complete one — aliveness is the acceptance gate.**

Knob guidance (which to turn on, and the honest caveat for each):

| Knob | Default→full | Notes |
|---|---|---|
| `motorSquash` | false→**true** | **Lead with this — the one safe, recommended flip.** Graded tanh steering, kills the spin/vibrate pathology, learning unchanged, **live-mutate** (no rebuild). This *is* the legibility win. |
| `foodChannels` | 1→**2** (keep `foodChannelRatio 0.5`, `forageSpecBonus 0.5`) | **THE structural diversity lever** (validated). A second resource axis → specialists beat generalists → breaks the single-peak monoculture. **Seed-time** → rebuild the world (it gates the FORAGE_PREF RNG draw). This is what actually *shows* diversity. |
| UI visual-polish | always-on | Role-glyph **shapes**, color-by modes (`c` cycles lineage/diet/energy), floating legend, 18-gene picker, trait radar. Comes free with the env-cluster merge — part of the package automatically. |
| walls / flow | per §5 | `wallRegionCount=5` etc. + `flowStrength=0.15`. Heavy behavior change, **seed-time**, **collapse risk** — guardrail-gate it. |
| `counterBiteFraction` | 0→**0.1–0.3** | Predator-side tax only. **Cap it modest** — a large value starves the (already fragile) predators. **Do NOT claim a prey "arms race"** — that's an unproven overclaim per the decision log. Live-tunable. |
| `hungerSense` | false→true | Mechanism fires + tested, byte-identical OFF. Seed-time. **Cosmetically safe to expose, but do NOT claim it improves foraging** — evolution has not been shown to recruit it (same seeded-but-unused risk as sight/hearing). |
| `pocketCapVariance` (C), `crowdingMortality` (D), `hungerSense` (E2) | leave OFF or expect no effect | **INERT at 8192²** — the density wall (nearest-neighbor ≫ interaction radius) means these have nothing to couple to. Flipping them at demo scale shows **no visible effect**; that's expected, **not a broken merge**. Don't chase the non-effect. To actually exercise them you'd have to shrink the world. (Lever D also can't show "boom-bust": it's a brake, not an oscillator — documented negative result.) |

---

## 9. Fix lint (the owner explicitly wants this green)

Two distinct categories — handle them differently:

- **`no-unnecessary-type-assertion` on `Float32Array[i]!` (6 errors).** This rule is **provably
  flaky** on typed arrays here — it flags `economy.ts:120` `energy[i]!` but **not** the *identical*
  `energy[i]!` on line 112. `noUncheckedIndexedAccess` doesn't apply to typed arrays, so `!` is
  technically redundant *everywhere*, and the codebase uses the idiom consistently. **Do not
  `--fix` per line** (it produces same-statement inconsistency and doesn't go green). The sanctioned
  fix is **config-level**: disable this rule for typed-array access (or project-wide) in the eslint
  config, since `tsc` is the real type-safety check and is clean. You have authority to edit the
  eslint config. (Memory: `eslint-typed-array-flaky`.)
- **`no-unsafe-argument` / `no-unsafe-assignment` in `harness.test.ts:8,20,21` (4 errors).** These
  are **real** — an `any[]` flowing into a `number[]` parameter. **Fix them properly** by typing
  the test helper.

Target: `npx eslint .` exits clean. Confirm `npx tsc --noEmit` still clean afterward.

---

## 10. Gotchas that will bite you

- **`make check` / `pnpm` fail inside `.claude/worktrees/*`** (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`).
  Work from the **main checkout** and call tools directly: `npx tsc --noEmit`,
  `NODE_OPTIONS=--expose-gc npx vitest run`, `npx eslint .`, `npx tsx src/headless/...`, `npx vite`.
- **Vite stale-module:** reloading the live UI on the **same port** can serve a STALE compiled
  `main.ts` — a UI/config edit looks like it "didn't take." Confirm changes on a **fresh port**.
- **`node_modules` is a symlink** in worktrees → **never `git add .`**. Stage files explicitly by path.
- **Beads, not TodoWrite, for issue tracking:** `bd ready` / `bd show` / `bd update --status` /
  `bd close`. At session close run **`bd sync --flush-only`** before you push. (Local-only — no git
  remote is configured, so "push" is N/A; just leave `main` updated locally.)
- **Commit trailers + the hook:** every commit ends with a `Co-Authored-By: Claude Opus 4.8 (1M
  context) <noreply@anthropic.com>` line and a `Claude-Session: <url>` line. A PreToolUse hook
  **blocks any bash command containing the literal `Co-Authored-By`**, so you **cannot** use
  `git commit -m` with the trailer inline — write the message to a file and `git commit -F <file>`.
- **Commit frequently** — each merge step is a rewind target.

---

## 11. Reference

- Spec: `docs/superpowers/specs/2026-06-20-evolution-playground-design.md`
- Decision log: `docs/decisions/INDEX.md` (2026-06-20 pivot, 2026-06-22 diversity + env + UI entries)
- Memory (`~/.claude/projects/-Users-joshtaylor-CodingProjects-life-sim/memory/`): `MEMORY.md` index,
  `consolidation-merge-plan` (this merge, summarized), `diversity-levers`, `env-features` (walls/flow),
  `pocket-richness-diversity` (SP1), `predation-engine-ceiling`, `live-demo-ecology-broken`,
  `eslint-typed-array-flaky`, `scaling-foundation`, `perception-scale-mismatch`,
  `rebuild-predation-dead`, `vite-stale-module-verify`.
- Headless tools: `run.ts` (alive-guardrail), `gate-check.ts` (determinism), `forage-probe.ts` (B),
  `biome-divergence.ts` (C), `crowding-probe.ts` (D).

**Start by:** reading the spec + decision log, running the §3 verification commands and the §7
baseline on `main`/`rebuild/ecosim`, *then* begin the §4 merge.
