# Tidepool M4 retune 2 — Parts with one job, and a thinner middle

Status: **Written 2026-10-16. Waits for the owner's go.**

The owner, 2026-10-16, after the diet retune (`../findings/m4-diet.md` "Exit"): thin the omnivore
group and grow the plant eaters and the meat eaters, maybe with a bonus for specialists or a damper
on the middle; separate the jaw from the lunge, so that a lunge needs a limb; "we need to have
benefits and costs for everything and all these parts and systems need to be isolated but
co-working in interesting ways", balanced for variety. The principle is logged in
`../decisions/INDEX.md` (2026-10-16).

## Choices for the owner

### P1. Where the lunge comes from

Today a lunge is declared by a Jaw (`brain.rs` `TRIGGERS`): a forward push and `lunge_bite` times
the bite while it lasts. A herbivore's jaw bites nothing but still gives the push, a free second
dash: the likely reason herbivores keep jaws (`m4-diet.md`, not measured).

| Option | What it buys | What it costs |
|---|---|---|
| **A. The lunge is folded into the dash. The Flagellum gives the dash (as now). A body with a Jaw bites `lunge_bite` times harder during its dash. One trigger fewer.** Recommended | One part, one job: the Flagellum moves, the Jaw bites. They work together: a strike needs both. A jaw on a herbivore is pure mass, so selection can remove it. A simpler brain (one output fewer) | The F key and the Lunge button go. The founder hunter's hand-wired lunge becomes a dash. `lunge_cost`, `lunge_ticks`, `lunge_impulse`, `starter_lunge` are deleted or merged into the dash's |
| B. The lunge is declared by a Flagellum, beside the dash | Keeps two buttons | A Flagellum gives two bursts, the same free second dash moved to another part |
| C. A new part, a muscle, declares the lunge | A new body plan to evolve | A new kind (genome, drawing, guide, gates), one more cost to tune |

### P2. How to thin the middle

Measured: a steeper `diet_k` (2.0, 1.75) thins the middle and stops the climb from plants, because
the first steps from `diet` 0 gain almost no meat (T6, T9). Whatever thins the middle must leave the
ends free.

| Option | What it buys | What it costs |
|---|---|---|
| **A. Two guts cost upkeep. A body pays `gut_upkeep` times a bump of its `diet` each tick: 0 under `gut_band` and over `1 − gut_band`, rising to its top at 0.5. Start `gut_band` 0.2.** Recommended | Real: digestive capacity is kept at a cost and matched to the diet eaten (Karasov et al. 2011). The ends pay nothing, so the climb from plants is untouched up to 0.2, and the larger mutation step (0.1) crosses the band. One cost, one number to tune | A new upkeep term in `energy::life`. The band is a shape we choose, not one measured in nature |
| B. A specialist bonus: a body under `diet` 0.1 or over 0.9 eats `specialist_bonus` more | Rewards the ends directly | A herbivore stepping off 0 loses the bonus at once: the same wall that stopped the climb at `diet_k` 2.0 |
| C. Steeper `diet_k` | No new rule | Measured: kills the climb |

### P3. The audit of parts (the owner's principle)

Before any trial, a table of every part kind: what it gives, what it costs (mass, upkeep, an input,
an output), what it works with. A part that gives a benefit at no cost, or does two jobs, is listed
for the owner with a fix. Built by the orchestrator from the code, checked by an `auditor`.

### P4. The shape that counts

| Option | Target at tick 144,000, on 5 seeds |
|---|---|
| **A. Omnivores at most 0.50 of the living, plant eaters and meat eaters each 0.10 or more, at the end of the run, on 4 of 5 seeds.** Recommended | "Thin out a bit", read at the end, with one seed allowed to wander, as the draft found worlds do |
| B. The diet retune's target 1: each end 0.10 or more through the whole second half, 5 of 5 | The bar no trial met |

## Tasks (with the recommended options)

1. **The audit of parts (P3).** `../findings/parts-audit.md`. No code.
2. **The lunge folds into the dash (P1 A)** (`coder`). `brain.rs` `TRIGGERS` loses `OUT_LUNGE`; the
   dash of a body with a Jaw sets the bite boost for `lunge_ticks` (renamed `strike_ticks` if the
   name misleads); the lunge's parameters merge or go; the page loses the Lunge button and F; the
   guide says it. Tests: a jawless dash bites nothing, a jawed dash bites `lunge_bite` times harder,
   a jaw alone gives no burst. Snapshot format and ABI bump.
3. **Two guts cost upkeep (P2 A)** (`coder-std`). `gut_upkeep` (Off 0), `gut_band`. Tests: 0 at both
   ends and under the band, highest at 0.5, in the hash through the energy it charges.
4. **Trials** (the orchestrator), hypothesis committed before each, one run at a time, at most 8:
   baseline with Task 2 and `gut_upkeep` 0, then `gut_upkeep` up from a start that charges a body at
   0.5 a tenth of its basal cost, then `gut_band`. Read by `probe-diet` at 12,000 and 144,000, and
   the long gate's diet bands.
5. **Exit:** rebake, the gates, the bench as an interleaved A/B on a quiet machine, a fresh-context
   audit, the browser (a strike: a jawed body dashing into prey), owner checks.

## What this plan does not do

- No bigger world (M6).
- No change to the food chain (D2) or `diet_k` (1.5), unless the trials show the band needs it: the
  plan would stop and ask.
