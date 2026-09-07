# life-sim

An interactive **evolution playground**: neural-net swimmers evolve across
generations, learn within their own lifetimes (Baldwin / reward-modulated
Hebbian), and adapt under purely-economic selection (no fitness function) in a
2D toroidal ocean of fertility pockets. Feel-first — you can reach in live to
tune any knob, drop food, and follow one creature while watching its brain fire.

## Status
**Rebuilt (2026-06-20 pivot) as the feel-first Evolution Playground**, and **all feature branches
consolidated to `main` (2026-06-22)**: environmental **walls + divergence-free flow field** with neural
env-sensing, **heterogeneous food pockets** (per-pocket richness + isolation), **two-channel
foraging** + the A–E diversity levers, graded (tanh) steering, and god-tools (live knobs, inspect/follow,
color-by-diet by default). **Biogeographic-demes redesign (2026-06-26/27)**: the demo is now a live
**grazer/predator world** — population concentrated into deep, small, isolated food pockets so local
density makes predation geometrically possible (the root fix), an **ON predator bundle** + founding,
**diet-axis disruptive selection** (`dietGeneralistFloor`) so a bimodal grazer/predator split persists
past 20k, and a **meaningful-diet-gap** predation rule (`huntDietGap`) instead of near-peer cannibalism.
**Arc A legibility (2026-07-03)**: population-level evolution is now readable without opening a panel —
DIET is the default dot color (vivid green-grazer→red-predator ramp), the population graph carries a
stacked grazer/omnivore/predator band + a diet-σ diversity line, the world panel reports turnover +
hoarding (median age, % founders, generations, % satiated, and a turnover-stalled flag), bodies
auto-appear on zoom, and runtime invariant breaks surface a non-fatal banner.
New features ship **ON by default** (2026-06-23 convention; the only invariant is determinism for a given
`(config, seed)`) — older mechanisms that predate that convention may still default off, individually
toggleable. The demo's overrides live in `src/app/living-world-config.ts`. WebGL2 viewer; `defaultConfig()`
is the single source of truth for the demo, headless harness, and tests. Decision log in
`docs/decisions/INDEX.md`; the prior M0–M7.5 engine is archived/superseded.

**In progress (2026-09):** plants are being rebuilt as evolving entities in their own pool (`src/core/plants.ts`)
— germinate, grow, seed, die — with `FoodField` demoted to soil fertility. Increment 0+1 (the plant pool,
scent, and rendering) has landed and is on in the demo; nothing eats plants yet, so live grazing still runs
on the old food-field channels. See `plans/2026-09-plants-as-entities.md` for the design and
`HANDOFF.md` for the current session state.

## Docs
- Design spec: `docs/superpowers/specs/2026-06-15-life-sim-design.md`
- Decisions: `docs/decisions/INDEX.md`
- Session handoff: `HANDOFF.md`

## Commands
Run `make help`. Common: `make dev`, `make test`, `make check`, `make headless`.

## License

MIT — see [LICENSE](LICENSE).
