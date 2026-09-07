# HANDOFF — 2026-09-07 (audit + spin + plants kickoff)

Branch `main`, 30+ commits since `3513d5d`, **unpushed**. 466 tests / 37 files green, tsc + eslint clean.
Session detail (reports, tables, raw runs): `/private/tmp/claude-501/-Users-joshtaylor-CodingProjects-life-sim/c896c42b-a3ec-453f-9a6f-790ee37819bc/scratchpad/` (core-audit.md, spin-rca.md, spin-fix.md, food-map.md, plan-review.md, plants-inc1.md, eco-bisect.md, eco-retune.md).

## Owner decisions (final)
- Target = the 2D sim (`index.html`). lenia3d untouched.
- Plants = evolving entities (small genome, no brain, no movement). FoodField demoted to soil fertility.
- Contact-bite grazing (throttled by plant state), shading competition, scale by measurement.
- Later arcs: corpses as entities, day/night, plant toxin vs grazer tolerance, perf/world-size.
- Plan: `plans/2026-09-plants-as-entities.md` (3 review rounds, §14 review response).

## Landed
| area | commits | result |
|---|---|---|
| WIP committed | b4a508f | owner's biome presets + parasite host-slot fixes |
| Housekeeping | 86f024d | 3 dead root reports removed, stray worktree pruned, le0o closed |
| Audit fixes | 66c18f2..5493d30 (12) | 6 bugs, 7 likely, 5 smells; measured before/after in audit-fix.md |
| Audit-fix bug | 4e1e2d5 | rider move-cost exemption had granted perfect photosynthesis |
| Render | b0e2058 | dead `a_spd` attr in glow shader → 257 WebGL warnings/run → 0 |
| Motor knobs | 2817190, c6964a3 | `minTurnRadius`/`turnFloor`/`turnGainRatio` + threat/hunger gates; **inert in demo** (41927dc) |
| Health gate | b906916 | streams per-seed rows (killed runs used to leave only a header) |
| Plants inc 0+1 | 8341e93..a5aa1a5 | plant SoA pool + plant scent + wiring/hash/render + probe + tests; ON in demo, nothing eats them yet |
| Ecology | d5169df, f17c20b | `morphSatiationCap` ON — only arm passing the 12k gate 3/3 |

## Spin (the owner's complaint)
Root cause: turn rate independent of speed → radius ~3u inside a 6u body; instinct turn drive ~3× the ceiling. Spinners = fed adults on food. NOT learning (off → worse).
Fix works (spinners 19.9→6.4%, saturation 31-47→5-10%) but **turn-limited prey can't flee → seed 1 pop 40 at 12k** → held back. Exemptions (threat via PRED scent gradient, hunger) built; **12k×3 measurement was running at handoff** (`motor-gate` agent; result in scratchpad/motor-gate-12k.txt; if it passed, a `tune(demo): enable turn bound…` commit exists).

## Ecology (found by the audit, bigger than the spin)
- Demo regressed **2026-07-15 at de39c09** (morphs): seed 1 pop 26. July-healthy = 183b20c (pop ~4k, pred 21-31%, σDIET .27-.33).
- Root cause there: uniform PARASITISM founder seeding + energy-minting morph incomes. BUT morphs OFF at HEAD still gives grazer monoculture on seeds 2-3 at 12k → **other commits since 183b20c also shifted it (OPEN, filed)**.
- Rules learned: gate at **12k minimum, ≥3 seeds**; 6k is misleading in both directions; never run two 12k sims concurrently (silent OOM death).
- `parasiteFounderUniform`: keep true (gaussian → 171× seed spread).

## Plan errors found by building increment 1
1. Crowding can't bound plant COUNT (seed bar ∝ K) → shipped `plantCellCap 2`; real fix = absolute seed bar → **increment 2**.
2. Pockets with peak fertility < `plantGermFertility` 2.0 are structurally plant-free (1-3/20 per seed).
3. `defaultConfig()` clamps fertility at 1 → tests/probes must set `foodPatchRichness 3`, `foodMaxFertility 5`.
4. Render: SPECIES→full hue wheel reads as confetti; invisible at world zoom under the field. Fix in increment 5 (vegetation palette).

## Next
1. Read motor-gate result; commit or leave inert.
2. Increment 2 (grazing cutover) — entry criterion: ecology passes 12k gate (it does at f17c20b). Tune against 12k×3, not 6k.
3. Ecology bisect 183b20c→HEAD with morphs off (filed).
4. 20k×4 check of the shipped demo (filed).
5. Push (`/ship`) when the owner says.

Beads: follow-ups filed by the `beads-file` agent (see `bd ready`).
