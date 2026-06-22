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
foraging** + the A–E diversity levers, an OFF-by-default **predator bundle** (founding-protection),
graded (tanh) steering, and god-tools (live knobs, inspect/follow, color-by-lineage). The live demo
ships the three guardrail-verified pillars — **walls+flow + motorSquash + two food channels** — with a
manual **mobile/desktop UI toggle**. Every other feature is an **OFF-by-default knob** that keeps the
seeded baseline byte-identical. WebGL2 viewer; `defaultConfig()` is the single source of truth for the
demo, headless harness, and tests. Decision log in `docs/decisions/INDEX.md` (read the 2026-06-20
rebuild pivot + 2026-06-22 entries); the prior M0–M7.5 engine is archived/superseded.

## Docs
- Design spec: `docs/superpowers/specs/2026-06-15-life-sim-design.md`
- Decisions: `docs/decisions/INDEX.md`

## Commands
Run `make help`. Common: `make dev`, `make test`, `make check`, `make headless`.
