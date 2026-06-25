# Lineage / family-tree inspector — design

**Date:** 2026-06-23
**Status:** approved-pending-review
**Scope:** UI-only (observability shell). Zero sim-core changes. No determinism risk.

## Goal

Click a creature → open a closeable **modal overlay** showing its **family tree**: the ancestor
chain up to the founder (selected node highlighted), its direct children, and dynasty/descendant
counts, with per-node metadata (generation depth, birth tick, age, diet glyph, lineage-hue swatch).
The point is to *learn and follow* the family trees of creatures you inspect.

## Decisions (locked)

- **Layout:** *Ancestor spine + direct children* (linear column). Full chain founder→selected
  (selected highlighted), then ONLY direct children listed, plus a transitive **dynasty** total.
  Naturally bounded and legible — no deep/wide descendant tree to scroll.
- **Open trigger:** keyboard `t` (when a creature is selected) **and** a `🌳 family tree` button in
  the inspector panel. Closeable like the Legend (✕ → reopen pill, or just ✕ → closed).
- **Interactivity:** tree nodes are **clickable to re-inspect** — clicking a *live* node re-selects
  that creature (re-roots inspector/brain/radar + the tree onto it). Dead nodes render but are inert.

## Architecture

Two new units; everything else is wiring in `main.ts` + markup/CSS in `index.html`.

### 1. `src/app/observability/lineage.ts` — the recorder (data layer)

A pure-JS forest of every individual that has lived, fed by the `config.onBirth` hook. **No sim
feedback** — observation only, so determinism holds (`world.test.ts:7`).

**Identity / node.** Key = `` `${slot}:${genId}` `` (a recycled slot is a different individual).

```ts
interface LineageNode {
  key: string;
  slot: number;
  genId: number;
  generation: number;        // founders = 0; child = parent.generation + 1
  parentKey: string | null;  // null for founders
  birthTick: number;         // 0 for founders
  hue: number;               // snapshot at birth (dead slot may be recycled → can't read live)
  diet: number;              // ScalarGene.DIET snapshot at birth
  childKeys: string[];       // direct children (may be pruned on long runs; see Bounded memory)
  directChildren: number;    // authoritative count, incremented at birth, never decremented
  descendants: number;       // transitive count, incremented up the chain at each birth
}
```

**Contract-safe recording (mirrors `life-history.ts`).** The `onBirth` hook fires *inside*
`reproduce()` and must not touch the store. So:

- `onBirth(pSlot, pGen, cSlot, cGen)` → push `{pKey, cSlot, cGen}` to a `pendingBirths` buffer.
  Nothing else. (Read-only-by-contract respected: ints only, no store/RNG/iteration.)
- `commit(store, tick)` — called from the frame loop **right after every `world.step()`** (next to
  the existing `followTick()`), while the child slot is alive and its genes are valid. Drains
  `pendingBirths`: for each, build the child `LineageNode` (snapshot `hue` from `store.hue`, `diet`
  from `store.scalarGenes[slot*SCALAR_GENE_COUNT + ScalarGene.DIET]`, `birthTick = tick`), look up
  the parent node, set `generation = parent.generation + 1`, push to `parent.childKeys`, increment
  `parent.directChildren`, and walk up `parentKey` incrementing `descendants` on every ancestor.
  Parent-missing is a guarded no-op counter (should never fire — founders are snapshotted first).

**Founder snapshot.** `reset(store)` — called once at startup after `new World(config)` and again in
`rebuild()`. Clears the forest, then snapshots the current live population (`store.liveIndices`) as
gen-0 founders (`birthTick = 0`, `parentKey = null`, hue/diet from the store). Founders never appear
as an `onBirth` child, so this is the only place they enter the forest.

**Query.** `query(key): LineageView | null`:

```ts
interface LineageRow { key; slot; genId; generation; birthTick; hue; diet; alive; }
interface LineageView {
  ancestors: LineageRow[];   // founder → … → selected (selected last)
  children:  LineageRow[];   // direct children of selected (from childKeys)
  selectedKey: string;
  dynasty: number;           // descendants of the selected node
  directChildren: number;    // authoritative count (≥ children.length if some were pruned)
  founderKey: string;        // ancestors[0].key
}
```

`alive` is resolved lazily at query time via `store.isAlive(slot, genId)` — no death hook needed; a
node not alive renders with a `✝`. The selected creature can be **dead** and its tree still renders
(the forest persists past death — a feature: inspect a lineage after the creature is gone).

**Bounded memory (no silent truncation — Josh's rule).** Cap the forest at `MAX_NODES` (~50 000).
When `commit` pushes over the cap, sweep once for **dead-and-childless leaves** (`!alive &&
childKeys.length === 0`), oldest `birthTick` first, removing them from the map and their parent's
`childKeys` until back under cap. Because `descendants`/`directChildren` are incremented at birth and
never decremented, **dynasty + direct-children counts stay exact after pruning** — only the ability
to *list* a pruned dead child's row is lost (and the count still shows it). A module-level
`prunedLeaves` counter is exposed and surfaced in the modal footer so the cap is visible, never
silent. The sweep needs the store (for `isAlive`); it runs inside `commit(store, …)`, never in
`onBirth`. Cleared on `reset()`.

### 2. `src/app/observability/lineage-modal.ts` — the view

Mirrors `legend.ts`'s floating/closeable idiom (a `#lineage-panel` + `#lineage-pill` pair in
`index.html`, styled like `#legend-panel`). Wider/taller than the legend, centered, scrollable body.

- `constructor(panel, pill, { onPick })` — builds the chrome; `onPick(slot, gen)` is the re-inspect
  callback into `main.ts`.
- `select(slot, gen)` — sets the current key and re-renders if open.
- `render(store, cfg)` — queries the recorder, draws the spine: each ancestor as a row (hue swatch
  ▢, diet glyph via `dietShape` ●/◆/▲, `#slot`, `gen N`, `tBirth`, `age`/`✝`), connector `│` between
  rows, the **selected** row highlighted (arrow + accent border). Below: `CHILDREN (n) · dynasty d`,
  then the direct-children rows. Footer shows founder id and, if `prunedLeaves > 0`, a
  `… N old leaves pruned` note. Empty state: "no lineage yet — click a creature".
- `setOpen(open)` / `close()` — panel ↔ pill toggle (legend pattern).
- Live rows: each clickable row carries its `key`; click → if the node is alive, call `onPick`.

### Wiring in `main.ts`

- Instantiate `const lineage = new Lineage()` and set `config.onBirth = lineage.onBirth` **before**
  the loop. The spread in `onReset`/Knobs preserves the function reference; `economy.ts:402` reads
  `cfg.onBirth` live, so it survives `rebuild()`.
- After the initial `new World(config)` and inside `rebuild()`: `lineage.reset(world.store)`.
- In `frame()`, next to each `followTick()` (every stepped tick, both speed branches + the manual
  `onStep`): `lineage.commit(world.store, world.tick)`.
- In `selectAt()`: `lineageModal.select(best, selected.gen)`.
- `keydown`: `t`/`T` → if `selected`, `lineageModal.toggle()` (or open). Document it in the HUD hint.
- Modal `onPick(slot, gen)` → set `selected`, call `inspector/brainView/radar.select` + re-render —
  identical to `selectAt`'s tail. Do **not** clear the modal in the recycle-death block (it persists).
- `index.html`: add `#lineage-panel`/`#lineage-pill`, a `🌳 family tree` button as a **static sibling
  of `#inspector`** (a `#lineage-open` button next to the `inspector` `<h2>`), and CSS reusing the
  legend tokens (`.lg-*` analogues → `.ln-*`). The button must NOT live inside `#inspector` —
  `inspector.render()` rewrites that element's `innerHTML` every frame and would wipe the listener.
  Wire its click in `main.ts` (open the modal for the current `selected`), not in `inspector.ts`.

## Error / empty states (build first — Josh's rule)

- **No selection:** modal body = "no lineage yet — click a creature".
- **Selected key not in forest** (e.g. pre-reset stale key): same empty state.
- **Founder selected:** ancestors = `[founder]` only; CHILDREN may be 0 → "no children yet".
- **Dead creature:** tree still renders from the forest; rows that fail `isAlive` show `✝` and are
  not clickable.

## Testing / verification

- **Determinism (sacred):** `NODE_OPTIONS=--expose-gc npx vitest run` — all 313 green, same-seed →
  same-hash unchanged (the recorder is pure observation; `defaultConfig.onBirth` stays undefined).
- **Unit test** `src/app/observability/lineage.test.ts`: drive a recorder with a scripted founder
  snapshot + synthetic `onBirth`+`commit` sequence (fake minimal store) and assert: founder
  detection, ancestor chain order founder→selected, `directChildren`/`dynasty` counts, and that
  pruning a dead-childless leaf preserves counts while dropping the row.
- **Manual (fresh Vite port — stale-module gotcha):** `npm run build` then
  `npx vite preview --port 5191 --strictPort`; click creatures, press `t`; confirm the tree renders
  for a founder, a mid-lineage creature, and a deep descendant; click a live ancestor → re-inspects;
  let a 10k-tick run play and confirm the forest stays bounded (watch `prunedLeaves` / heap).
- `npx tsc --noEmit` clean; `npx eslint .` clean.

## Out of scope (YAGNI)

Full descendant subtree, node-link canvas graph, lineage search/filter, cross-session persistence,
hover tooltips beyond the row metadata, dynasty leaderboards (the headless `life-history.ts` already
covers offline analysis).
