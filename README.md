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
New mechanisms remain **OFF-default knobs** (byte-identical when off) — the demo opts in via
`src/app/living-world-config.ts`. WebGL2 viewer; `defaultConfig()` is the single source of truth for the
demo, headless harness, and tests. Decision log in `docs/decisions/INDEX.md`; the prior M0–M7.5 engine is
archived/superseded.

## Docs
- Design spec: `docs/superpowers/specs/2026-06-15-life-sim-design.md`
- Decisions: `docs/decisions/INDEX.md`

## Commands
Run `make help`. Common: `make dev`, `make test`, `make check`, `make headless`.

## License

MIT — see [LICENSE](LICENSE).
