# M1 — Particle Core Implementation Plan

> **For agentic workers:** implement task-by-task with TDD for the engine; the renderer/app is verified by build + screenshot. Steps use checkbox syntax.

**Goal:** Turn the inert M0 World into a real particle simulation — 100k soft cells repelling into an even spread in a viscous toroidal medium — and render it live in the browser with pan/zoom and time controls. The first watchable prototype.

**Architecture:** Add a uniform spatial hash (counting sort) for O(n) neighbours, a gather-formulation soft-repulsion force, and a near-overdamped semi-implicit integrator with toroidal wrap. The World maintains a compact `liveIndices` array (canonical ascending order) that the hash/forces/integrator iterate — this is also the deterministic iteration order from the spec. Hot loops use no closures and no per-tick allocation (the M0 zero-alloc test stays green). A WebGL2 instanced point renderer draws positions (Float32 downcast) in one draw call; the app runs a requestAnimationFrame loop with camera + time controls.

**Tech Stack:** TypeScript, WebGL2, Vite, Vitest.

**Spec:** §4.2, §4.4, §8 (M1), §11 (M1 control deliverables).

---

## File Structure
- Modify: `src/core/sim/config.ts` — add `cellRadius`, `repulsion`, `damping`
- Create: `src/core/spatial/spatial-hash.ts` (+ test) — uniform grid, counting sort, toroidal 3×3 neighbour buckets (exposes `cols/rows/cellSize/bucketStart/sorted` for closure-free iteration)
- Create: `src/core/physics/forces.ts` (+ test) — `computeRepulsion` (inline neighbour loop)
- Create: `src/core/physics/integrator.ts` (+ test) — `integrate` (drag + toroidal wrap, Float64 positions)
- Modify: `src/core/sim/world.ts` (+ test) — `liveIndices`, real `tick()` pipeline
- Create: `src/render/webgl-renderer.ts` — WebGL2 instanced points, camera transform, speed→colour
- Modify: `src/app/main.ts`, `index.html` — canvas, RAF loop, pan/zoom, time controls, HUD

## Tasks (acceptance per task)
1. **Config physics params** — defaults present; existing tests pass.
2. **Spatial hash** — counting sort bins all live cells; `forEach`-free neighbour access returns exactly the cells in the toroidal 3×3 block; no per-build allocation after construction.
3. **Repulsion force** — two overlapping cells gain equal-and-opposite outward force; non-overlapping cells get none; a cell never self-repels.
4. **Integrator** — force accelerates a cell; damping bleeds velocity; positions wrap toroidally; **a slow cell at a large (1e5) coordinate still moves** (Float64 precision); forces reset to 0.
5. **World tick pipeline** — `tick()` = rebuild live → hash → repulsion → integrate → age; two overlapping cells separate over ticks; reproducibility + zero-alloc tests still pass.
6. **WebGL2 renderer** — compiles shaders, draws `liveCount` points in one call, camera transform (offset+scale), colour by speed.
7. **App** — full-window canvas, RAF loop running N ticks/frame, mouse pan + wheel zoom, space=pause / `.`=step / `[` `]`=speed, HUD (fps, cells, tick, speed, zoom).
8. **Acceptance** — `make check` green; `make build` OK; dev server renders 100k cells; screenshot captured.

## Physics defaults (tunable later via §11 knobs)
`cellRadius = 7`, `interactionCutoff = cellSize = 2·cellRadius = 14`, `repulsion = 2`,
`damping = 0.5`, `dt = 1`, `mass = 1`. World 4096×4096, 100k cells → cells overlap
mildly everywhere → relax to an even field. If unstable (NaN), lower `repulsion`
or `damping`; tune after first screenshot.
