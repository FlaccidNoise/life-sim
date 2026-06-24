# Overnight build report — 2026-06-24 → morning

**The sim is running and evolving in your browser tab** (`http://localhost:5223/`, playing at 4×, forage
color-mode). It will keep evolving all night. Everything below is merged to `main` (FF, all 371 tests green,
deterministic, liveness-verified). I made every call myself per your instruction — recommendations + gut.

## What's running right now
- A persistent `vite preview` server on port **5223** (built from `main`), wrapped in `caffeinate` so the
  machine won't sleep. Background task — stays up.
- The tab is **playing at 4×**, color-mode = **forage** (so you immediately see food specialisation: the
  legend reads "A/B/C specialist · grey generalist").
- **A background stepper is injected** (`window.__nightPump`) that drives `world.step()` via `setInterval`,
  so the sim keeps evolving **even if Chrome backgrounds the tab** (rAF freezes on hidden tabs; setInterval
  doesn't). Measured ~30 ticks/sec even while backgrounded. To return to pure play/pause control, run
  `clearInterval(window.__nightPump)` in the console or just reload. NOTE: while the pump runs, the
  **pause button won't fully stop the sim** (the pump keeps stepping) — reload or clear the interval to halt.

## What I shipped to main tonight (in order)
1. **Glow-sense inspector parity fix** + the **refreshed orphaned-code audit** — `docs/neural-network-
   interconnection-map.md` now tables every gene/field/action vs *decision-wired?* + *visible?* (4 parallel
   audit passes, cross-verified). Found+fixed a 2nd inspector bug: BrainView omitted the glow-sense synapses
   from its turn/thrust readout (same class as the scent one).
2. **Food specialization economy** — your "everything is gray" fix. Added `forageGeneralistFloor` (0.85):
   conversion `spec` now ramps from a *generalist penalty* up to the specialist bonus, so an indifferent
   forager earns less per grazed unit than a committed one. FORAGE_PREF now seeds **uniform [0,1]** so the
   founding pool has real specialists who carry the population while it sorts into niches.
   **MEASURED (seed 1):** FORAGE_PREF mean 0.5 → **0.06** (specialised), population recovers to **2107 at
   20k ticks** (net-positive births, stable+growing). It specialises toward **one channel (A)**, not two
   niches — see gaps below.
3. **Eat-gate tuned for liveness** — `eatMovePenalty` 0.4 → 0.25 (gate stays ON as you asked; ~3× healthier
   population: seed-1 end-pop 24 → ~200 mid-transient, 2107 long-run).
4. **hungerSense ON in the demo** — it was dead in both default config AND the demo (audit finding); now the
   brain senses its own energy deficit. (Kept off in the neutral default config to avoid churning unit tests.)
5. **UI reorg** — knobs split into **CREATURE · genes, costs & behaviour** (top) vs **WORLD · environment &
   ecology** (bottom), with section headers. Time controls (play/speed/seed) stay top-left; stats panel
   right is untouched, as you wanted.

## The early-transient dip (don't be alarmed)
Right after start the population dips (founders sorting into specialists eat the penalty) — it troughs around
tick ~4000 then **recovers and grows to ~2100** (proven by the 20k-tick headless probe at the exact live
config). By the time you read this it should be well past the trough.

## Honest gaps — what I deliberately did NOT do (mapped in the audit, deferred)
- **Two-niche coexistence:** it specialises to a single channel (A), not A+B side-by-side. True coexistence
  needs balanced/blobby independent channels — i.e. **your queued food-field retune** (sparser, drifting,
  overlapping patches). I did not touch food density (you wanted it *sparser*, so I got liveness purely from
  the eat-gate tune, not more food).
- **Interoceptive INPUTS** (own-size, own-diet, local-crowding) and **brain-gated OUTPUTS** (bite/breed/
  scent-deposit) — fully scoped in the audit with exact hooks, but I left them out: seeded-0 inputs wouldn't
  express overnight, and the output gates are economy changes I didn't want to risk unattended before the
  sim was proven stable. These are the next "wiring" sub-projects.
- **Food-field retune** — not started.

## Where to look when you wake
- Watch the **forage colors** sort from grey toward a specialist hue over generations.
- Press **`c`** to cycle color modes (lineage / diet / energy / forage); **`t`** = family tree; click a dot
  to inspect its brain (the inspector now correctly includes scent + glow-sense in the motor readout).
- The new **WORLD vs CREATURE** knob split is in the left panel.

Beads: food-specialization `life-sim-gw4g` (done tonight), food-retune `life-sim-4bxw` + the interconnection
wiring phases remain open. Full session detail in memory `brain-consolidation` / `food-specialization`.
