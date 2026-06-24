# Lineage / Family-Tree Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Click a creature → open a closeable modal showing its family tree (ancestor spine to founder, selected highlighted, direct children + dynasty count, per-node hue/diet/gen/birth-tick/age).

**Architecture:** A pure-JS `Lineage` recorder, fed by the read-only `config.onBirth` hook, accumulates a child→parent forest (founders snapshotted at seed/reset). A `LineageModal` view mirrors the Legend's closeable-panel idiom and renders the recorder's query for the selected creature. Observation-only — never feeds the sim, so determinism is untouched.

**Tech Stack:** TypeScript (strict), Vitest, WebGL demo shell (DOM/CSS), Vite.

## Global Constraints

- **Determinism is sacred:** same `(config, seed)` → byte-identical hash (`src/core/world.test.ts:7`). The recorder is pure observation; `defaultConfig.onBirth` stays `undefined`. All 313 tests must stay green.
- **`onBirth` is read-only by contract** (`src/core/config.ts:464`): it fires inside `reproduce()` and must NOT touch the store, RNG, or iteration. It may only buffer ints. Store reads happen later in `commit(store, tick)`, outside `reproduce()`.
- **Identity = `` `${slot}:${genId}` ``** — a recycled slot is a different individual (`src/core/store.ts`).
- **No silent truncation:** the memory cap must surface a visible `prunedLeaves` count.
- **Worktree:** run all commands from the worktree cwd; never `cd` to the repo root. `make` fails in a worktree — run `npx` directly.
- **Commit messages:** the local guard hook blocks a `Co-Authored-By` trailer — omit it.
- **Run tests with:** `NODE_OPTIONS=--expose-gc npx vitest run`. Typecheck `npx tsc --noEmit`. Lint `npx eslint .`.
- **Existing facts:** `SCALAR_GENE_COUNT = 22`, `ScalarGene.DIET = 10` (`src/core/genome.ts`). Palette helpers `dietShape(diet): 0|1|2`, `lineageColor(hue): RGB`, `rgbCss(RGB): string` (`src/render/palette.ts`). Store fields used: `hue`, `scalarGenes`, `genId`, `liveIndices`, `liveCount`, `isAlive(slot, gen?)`.

## File Structure

- **Create** `src/app/observability/lineage.ts` — the recorder (data layer): `Lineage` class + `LineageStore`/`LineageRow`/`LineageView` types.
- **Create** `src/app/observability/lineage.test.ts` — headless unit tests for record/query/prune.
- **Create** `src/app/observability/lineage-modal.ts` — the view: `LineageModal` class.
- **Modify** `index.html` — add `#lineage-panel`, the `🌳 family tree` opener button (static sibling of `#inspector`), and `.ln-*` CSS.
- **Modify** `src/app/main.ts` — instantiate recorder + modal, set `config.onBirth`, `reset()` at seed/rebuild, `commit()` each tick, `select()` on click, `t` key, modal render in the frame loop.

---

### Task 1: Lineage recorder — record & query

**Files:**
- Create: `src/app/observability/lineage.ts`
- Test: `src/app/observability/lineage.test.ts`

**Interfaces:**
- Consumes: `ScalarGene`, `SCALAR_GENE_COUNT` from `../../core/genome`.
- Produces:
  - `interface LineageStore { readonly hue: ArrayLike<number>; readonly scalarGenes: ArrayLike<number>; readonly genId: ArrayLike<number>; readonly liveIndices: ArrayLike<number>; readonly liveCount: number; isAlive(slot: number, gen?: number): boolean }`
  - `interface LineageRow { key: string; slot: number; genId: number; generation: number; birthTick: number; hue: number; diet: number; alive: boolean }`
  - `interface LineageView { ancestors: LineageRow[]; children: LineageRow[]; selectedKey: string; dynasty: number; directChildren: number; founderKey: string; prunedLeaves: number }`
  - `class Lineage` with `readonly onBirth: (pSlot, pGen, cSlot, cGen) => void`, `reset(store: LineageStore): void`, `commit(store: LineageStore, tick: number): void`, `query(key: string, store: LineageStore): LineageView | null`, `queryBySlot(slot: number, gen: number, store: LineageStore): LineageView | null`, `get size(): number`. Constructor: `constructor(maxNodes?: number)`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/observability/lineage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Lineage, type LineageStore } from './lineage';
import { ScalarGene, SCALAR_GENE_COUNT } from '../../core/genome';

const MAXS = 16;

/** A minimal mutable fake store: set founders/births by slot, flip alive, snapshot hue/diet. */
function makeStore() {
  const hue = new Float32Array(MAXS);
  const scalarGenes = new Float32Array(MAXS * SCALAR_GENE_COUNT);
  const genId = new Uint32Array(MAXS);
  const liveIndices = new Uint32Array(MAXS);
  const aliveKeys = new Set<string>(); // `${slot}:${gen}`
  const store: LineageStore & { liveCount: number } = {
    hue,
    scalarGenes,
    genId,
    liveIndices,
    liveCount: 0,
    isAlive(slot: number, gen?: number): boolean {
      if (gen === undefined) return [...aliveKeys].some((k) => k.startsWith(`${slot}:`));
      return aliveKeys.has(`${slot}:${gen}`);
    },
  };
  /** Place a creature in a slot (alive) with a gen, hue, diet. */
  function put(slot: number, gen: number, h: number, diet: number): void {
    genId[slot] = gen;
    hue[slot] = h;
    scalarGenes[slot * SCALAR_GENE_COUNT + ScalarGene.DIET] = diet;
    aliveKeys.add(`${slot}:${gen}`);
  }
  /** Mark the (slot,gen) individual dead. */
  function kill(slot: number, gen: number): void {
    aliveKeys.delete(`${slot}:${gen}`);
  }
  /** Set the live set (slots) for reset()'s founder snapshot. */
  function setLive(slots: number[]): void {
    for (let i = 0; i < slots.length; i++) liveIndices[i] = slots[i]!;
    store.liveCount = slots.length;
  }
  return { store, put, kill, setLive };
}

describe('Lineage recorder', () => {
  it('snapshots the seeded population as gen-0 founders', () => {
    const { store, put, setLive } = makeStore();
    put(0, 1, 0.2, 0.1);
    put(1, 1, 0.7, 0.9);
    setLive([0, 1]);
    const lin = new Lineage();
    lin.reset(store);
    expect(lin.size).toBe(2);
    const v = lin.queryBySlot(0, 1, store)!;
    expect(v.ancestors).toHaveLength(1);
    expect(v.ancestors[0]!.generation).toBe(0);
    expect(v.ancestors[0]!.birthTick).toBe(0);
    expect(v.founderKey).toBe('0:1');
    expect(v.children).toHaveLength(0);
    expect(v.dynasty).toBe(0);
  });

  it('attributes births child→parent and builds the ancestor spine', () => {
    const { store, put, setLive } = makeStore();
    put(0, 1, 0.2, 0.1);
    put(1, 1, 0.7, 0.9);
    setLive([0, 1]);
    const lin = new Lineage();
    lin.reset(store);

    // Founder 0:1 begets 2:1 at t100; 2:1 begets 3:1 at t200.
    put(2, 1, 0.21, 0.12);
    lin.onBirth(0, 1, 2, 1);
    lin.commit(store, 100);
    put(3, 1, 0.22, 0.13);
    lin.onBirth(2, 1, 3, 1);
    lin.commit(store, 200);

    const deep = lin.queryBySlot(3, 1, store)!;
    expect(deep.ancestors.map((r) => r.key)).toEqual(['0:1', '2:1', '3:1']);
    expect(deep.ancestors[2]!.generation).toBe(2);
    expect(deep.ancestors[2]!.birthTick).toBe(200);
    expect(deep.selectedKey).toBe('3:1');
    expect(deep.founderKey).toBe('0:1');

    const founder = lin.queryBySlot(0, 1, store)!;
    expect(founder.children.map((r) => r.key)).toEqual(['2:1']);
    expect(founder.directChildren).toBe(1);
    expect(founder.dynasty).toBe(2); // 2:1 + 3:1
  });

  it('reports alive=false for a recycled/dead node but still renders its tree', () => {
    const { store, put, kill, setLive } = makeStore();
    put(0, 1, 0.2, 0.1);
    setLive([0]);
    const lin = new Lineage();
    lin.reset(store);
    put(2, 1, 0.3, 0.4);
    lin.onBirth(0, 1, 2, 1);
    lin.commit(store, 50);
    kill(2, 1);
    const v = lin.queryBySlot(0, 1, store)!;
    expect(v.children[0]!.alive).toBe(false);
    expect(v.children[0]!.diet).toBeCloseTo(0.4); // birth-snapshot survives the slot dying
  });

  it('returns null for an unknown key', () => {
    const { store, put, setLive } = makeStore();
    put(0, 1, 0.2, 0.1);
    setLive([0]);
    const lin = new Lineage();
    lin.reset(store);
    expect(lin.queryBySlot(9, 9, store)).toBeNull();
  });

  it('reset clears the forest before re-snapshotting', () => {
    const { store, put, setLive } = makeStore();
    put(0, 1, 0.2, 0.1);
    setLive([0]);
    const lin = new Lineage();
    lin.reset(store);
    put(2, 1, 0.3, 0.4);
    lin.onBirth(0, 1, 2, 1);
    lin.commit(store, 50);
    expect(lin.size).toBe(2);
    lin.reset(store); // rebuild: only slot 0 is live again
    expect(lin.size).toBe(1);
    expect(lin.queryBySlot(2, 1, store)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/app/observability/lineage.test.ts`
Expected: FAIL — `Cannot find module './lineage'` / `Lineage is not a constructor`.

- [ ] **Step 3: Write the recorder implementation**

Create `src/app/observability/lineage.ts`:

```ts
/**
 * Lineage recorder — UI-only family-tree bookkeeping fed by the read-only config.onBirth hook. The
 * sim core stores no ancestry, so the demo records it: founders snapshotted at seed/reset, every
 * birth attributed child→parent. Pure observation — never feeds the sim, so determinism (same
 * config+seed → same hash) is untouched.
 *
 * Identity = `${slot}:${genId}` (a recycled slot is a different individual). onBirth fires INSIDE
 * reproduce() and must not touch the store, so it only buffers ints; commit(store,tick) — called
 * right after each world.step() — drains the buffer and snapshots birth-time hue/diet (a dead
 * ancestor's recycled slot would read the wrong genes if read live).
 */
import { ScalarGene, SCALAR_GENE_COUNT } from '../../core/genome';

/** The narrow store surface the recorder reads. OrganismStore satisfies it structurally; tests pass
 *  a plain object. */
export interface LineageStore {
  readonly hue: ArrayLike<number>;
  readonly scalarGenes: ArrayLike<number>;
  readonly genId: ArrayLike<number>;
  readonly liveIndices: ArrayLike<number>;
  readonly liveCount: number;
  isAlive(slot: number, gen?: number): boolean;
}

interface LineageNode {
  key: string;
  slot: number;
  genId: number;
  generation: number;
  parentKey: string | null;
  birthTick: number;
  hue: number;
  diet: number;
  childKeys: string[];
  directChildren: number; // authoritative; never decremented (survives pruning)
  descendants: number; // transitive; incremented up the chain at birth (survives pruning)
}

export interface LineageRow {
  key: string;
  slot: number;
  genId: number;
  generation: number;
  birthTick: number;
  hue: number;
  diet: number;
  alive: boolean;
}

export interface LineageView {
  ancestors: LineageRow[]; // founder → … → selected (selected last)
  children: LineageRow[]; // direct children of the selected node
  selectedKey: string;
  dynasty: number; // transitive descendants ever born to the selected node
  directChildren: number; // authoritative (≥ children.length if some were pruned)
  founderKey: string;
  prunedLeaves: number; // total dead leaves pruned this run (cap visibility)
}

const DEFAULT_MAX_NODES = 50_000;

function keyOf(slot: number, gen: number): string {
  return `${slot}:${gen}`;
}

export class Lineage {
  private nodes = new Map<string, LineageNode>();
  private pending: Array<{ pKey: string; cSlot: number; cGen: number }> = [];
  private prunedLeaves = 0;

  constructor(private readonly maxNodes: number = DEFAULT_MAX_NODES) {}

  /** config.onBirth handler — pre-bound so it can be assigned directly. Buffers ints ONLY (contract:
   *  no store/RNG/iteration access inside reproduce()). */
  readonly onBirth = (pSlot: number, pGen: number, cSlot: number, cGen: number): void => {
    this.pending.push({ pKey: keyOf(pSlot, pGen), cSlot, cGen });
  };

  /** Clear the forest, then snapshot the current live population as gen-0 founders. Call at startup
   *  (after new World) and on every rebuild()/reset(). */
  reset(store: LineageStore): void {
    this.nodes.clear();
    this.pending.length = 0;
    this.prunedLeaves = 0;
    for (let k = 0; k < store.liveCount; k++) {
      const slot = store.liveIndices[k]!;
      const gen = store.genId[slot]!;
      const key = keyOf(slot, gen);
      this.nodes.set(key, {
        key,
        slot,
        genId: gen,
        generation: 0,
        parentKey: null,
        birthTick: 0,
        hue: store.hue[slot]!,
        diet: store.scalarGenes[slot * SCALAR_GENE_COUNT + ScalarGene.DIET]!,
        childKeys: [],
        directChildren: 0,
        descendants: 0,
      });
    }
  }

  /** Drain the births buffered since the last step. Reads the store for birth-time gene snapshots
   *  (the child slot is alive now). Safe outside reproduce() — never touches RNG/iteration. */
  commit(store: LineageStore, tick: number): void {
    if (this.pending.length === 0) return;
    for (const b of this.pending) {
      const cKey = keyOf(b.cSlot, b.cGen);
      // Parent should always be present (founders are snapshotted before any step); a missing parent
      // is the only orphan case → record the child as a gen-1 root rather than dropping the birth.
      const parent = this.nodes.get(b.pKey);
      this.nodes.set(cKey, {
        key: cKey,
        slot: b.cSlot,
        genId: b.cGen,
        generation: parent ? parent.generation + 1 : 1,
        parentKey: parent ? b.pKey : null,
        birthTick: tick,
        hue: store.hue[b.cSlot]!,
        diet: store.scalarGenes[b.cSlot * SCALAR_GENE_COUNT + ScalarGene.DIET]!,
        childKeys: [],
        directChildren: 0,
        descendants: 0,
      });
      if (parent) {
        parent.childKeys.push(cKey);
        parent.directChildren++;
        // Walk up the ancestor chain incrementing transitive descendant counts.
        let a: LineageNode | undefined = parent;
        while (a) {
          a.descendants++;
          a = a.parentKey ? this.nodes.get(a.parentKey) : undefined;
        }
      }
    }
    this.pending.length = 0;
    if (this.nodes.size > this.maxNodes) this.prune(store);
  }

  /** Prune oldest dead-and-childless leaves until back under cap. Counts are baked in at birth, so
   *  dynasty/directChildren totals stay exact — only the pruned row vanishes from listings. */
  private prune(store: LineageStore): void {
    const leaves: LineageNode[] = [];
    for (const n of this.nodes.values()) {
      if (n.childKeys.length === 0 && !store.isAlive(n.slot, n.genId)) leaves.push(n);
    }
    leaves.sort((a, b) => a.birthTick - b.birthTick);
    let i = 0;
    while (this.nodes.size > this.maxNodes && i < leaves.length) {
      const n = leaves[i++]!;
      this.nodes.delete(n.key);
      this.prunedLeaves++;
      if (n.parentKey) {
        const p = this.nodes.get(n.parentKey);
        if (p) {
          const idx = p.childKeys.indexOf(n.key);
          if (idx >= 0) p.childKeys.splice(idx, 1);
        }
      }
    }
  }

  /** Build the ancestor spine + direct children + dynasty stats for a key, or null if it's unknown
   *  (e.g. a stale pre-reset selection). */
  query(key: string, store: LineageStore): LineageView | null {
    const node = this.nodes.get(key);
    if (node === undefined) return null;
    const toRow = (n: LineageNode): LineageRow => ({
      key: n.key,
      slot: n.slot,
      genId: n.genId,
      generation: n.generation,
      birthTick: n.birthTick,
      hue: n.hue,
      diet: n.diet,
      alive: store.isAlive(n.slot, n.genId),
    });
    // Ancestor chain selected → founder, then reversed to founder → selected.
    const chain: LineageNode[] = [];
    const guard = new Set<string>(); // cycle guard (defensive; the forest is acyclic by construction)
    let cur: LineageNode | undefined = node;
    while (cur && !guard.has(cur.key)) {
      guard.add(cur.key);
      chain.push(cur);
      cur = cur.parentKey ? this.nodes.get(cur.parentKey) : undefined;
    }
    chain.reverse();
    const children = node.childKeys
      .map((k) => this.nodes.get(k))
      .filter((n): n is LineageNode => n !== undefined)
      .map(toRow);
    return {
      ancestors: chain.map(toRow),
      children,
      selectedKey: node.key,
      dynasty: node.descendants,
      directChildren: node.directChildren,
      founderKey: chain[0]!.key,
      prunedLeaves: this.prunedLeaves,
    };
  }

  /** Convenience: query by (slot, gen). */
  queryBySlot(slot: number, gen: number, store: LineageStore): LineageView | null {
    return this.query(keyOf(slot, gen), store);
  }

  get size(): number {
    return this.nodes.size;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/app/observability/lineage.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/app/observability/lineage.ts src/app/observability/lineage.test.ts`
Expected: clean (no output / exit 0).

- [ ] **Step 6: Commit**

```bash
git add src/app/observability/lineage.ts src/app/observability/lineage.test.ts
git commit -m "feat(observability): lineage recorder (onBirth forest + ancestor/dynasty query)"
```

---

### Task 2: Bounded memory — leaf pruning

**Files:**
- Modify: `src/app/observability/lineage.ts` (already has `prune()` from Task 1 — this task adds its test and verifies behavior)
- Test: `src/app/observability/lineage.test.ts:append`

**Interfaces:**
- Consumes: `Lineage` constructor's `maxNodes` param (Task 1).
- Produces: nothing new — verifies the pruning contract (counts exact, oldest dead-childless leaf removed, `prunedLeaves` surfaced).

- [ ] **Step 1: Write the failing pruning test**

Append to `src/app/observability/lineage.test.ts` (inside the existing `describe`):

```ts
  it('prunes oldest dead-childless leaves over cap, preserving dynasty/direct counts', () => {
    const { store, put, kill, setLive } = makeStore();
    // Two founders (always alive → never pruned).
    put(0, 1, 0.2, 0.1);
    put(1, 1, 0.7, 0.9);
    setLive([0, 1]);
    const lin = new Lineage(3); // tiny cap to force pruning

    lin.reset(store); // 2 founders
    put(2, 1, 0.3, 0.4); // founder 0 begets 2:1 at t10
    lin.onBirth(0, 1, 2, 1);
    lin.commit(store, 10); // size = 3 (at cap)
    kill(2, 1); // 2:1 dies → a dead, childless leaf

    put(3, 1, 0.5, 0.6); // founder 1 begets 3:1 at t20 → size 4 > cap → prune
    lin.onBirth(1, 1, 3, 1);
    lin.commit(store, 20);

    expect(lin.size).toBe(3); // back under cap: 2:1 pruned
    const f0 = lin.queryBySlot(0, 1, store)!;
    expect(f0.directChildren).toBe(1); // count survives the prune
    expect(f0.dynasty).toBe(1); // 2:1 still counted in the dynasty total
    expect(f0.children).toHaveLength(0); // …but its row is gone from the listing
    expect(f0.prunedLeaves).toBe(1); // surfaced, not silent
    expect(lin.queryBySlot(2, 1, store)).toBeNull(); // the pruned node is gone
  });
```

- [ ] **Step 2: Run to verify it passes (prune() already exists from Task 1)**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/app/observability/lineage.test.ts`
Expected: PASS — 6 tests. (If it FAILS, the bug is in Task 1's `prune()`/`commit()`; fix there, do not weaken the test.)

- [ ] **Step 3: Commit**

```bash
git add src/app/observability/lineage.test.ts
git commit -m "test(observability): lineage pruning preserves dynasty counts"
```

---

### Task 3: Lineage modal view + DOM/CSS

**Files:**
- Create: `src/app/observability/lineage-modal.ts`
- Modify: `index.html` (add `#lineage-panel`, the `🌳 family tree` opener button, `.ln-*` CSS)

**Interfaces:**
- Consumes: `Lineage`, `LineageRow`, `LineageView`, `LineageStore` from `./lineage`; `rgbCss`, `lineageColor`, `dietShape` from `../../render/palette`.
- Produces: `class LineageModal` with `constructor(panel: HTMLElement, lineage: Lineage, onPick: (slot: number, gen: number) => void)`, `select(slot: number, gen: number): void`, `toggle(): void`, `setOpen(open: boolean): void`, `isOpen(): boolean`, `render(store: LineageStore): void`.

No unit test — vitest runs in the node environment (no DOM; see `vitest.config.ts`). The render logic delegates to the already-tested `query()`; the view is verified manually in Task 4.

- [ ] **Step 1: Create the modal view**

Create `src/app/observability/lineage-modal.ts`:

```ts
/**
 * Family-tree modal — a closeable overlay (mirrors legend.ts's panel idiom) showing the selected
 * creature's ancestor spine to its founder (selected highlighted), its direct children, and dynasty
 * counts. Reads the Lineage recorder (which persists past a creature's death), so a dead creature's
 * tree still renders. Live rows are clickable to re-inspect (onPick re-roots the whole shell).
 */
import { rgbCss, lineageColor, dietShape } from '../../render/palette';
import { Lineage, type LineageRow, type LineageView, type LineageStore } from './lineage';

const GLYPH = ['●', '◆', '▲']; // herbivore / omnivore / predator — indexed by dietShape()

export class LineageModal {
  private slot = -1;
  private gen = 0;
  private open = false;

  constructor(
    private readonly panel: HTMLElement,
    private readonly lineage: Lineage,
    private readonly onPick: (slot: number, gen: number) => void,
  ) {
    this.setOpen(false);
    // One delegated click handler: ✕ closes; a live row re-inspects.
    panel.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.ln-x')) {
        this.setOpen(false);
        return;
      }
      const row = target.closest('.ln-row') as HTMLElement | null;
      if (row && row.dataset.alive === '1') {
        this.onPick(Number(row.dataset.slot), Number(row.dataset.gen));
      }
    });
  }

  select(slot: number, gen: number): void {
    this.slot = slot;
    this.gen = gen;
  }

  isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.panel.style.display = open ? 'block' : 'none';
  }

  /** Re-render from the recorder. Called each frame while open (cheap: a Map lookup + chain walk). */
  render(store: LineageStore): void {
    if (!this.open) return;
    if (this.slot < 0) {
      this.panel.innerHTML = this.shell(
        `<div class="muted">no lineage yet — click a creature, then press <b>t</b></div>`,
      );
      return;
    }
    const view = this.lineage.queryBySlot(this.slot, this.gen, store);
    if (view === null) {
      this.panel.innerHTML = this.shell(
        `<div class="muted">no lineage for this creature (try after a step)</div>`,
      );
      return;
    }
    this.panel.innerHTML = this.shell(this.body(view));
  }

  private shell(inner: string): string {
    return (
      `<div class="ln-head"><span>family tree</span>` +
      `<button class="ln-x" title="close">✕</button></div>${inner}`
    );
  }

  private rowHtml(r: LineageRow, selected: boolean): string {
    const swatch = rgbCss(lineageColor(r.hue));
    const glyph = GLYPH[dietShape(r.diet)];
    const dead = r.alive ? '' : ` <span class="ln-dead">✝</span>`;
    const cls = `ln-row${selected ? ' ln-sel' : ''}${r.alive ? ' ln-live' : ''}`;
    return (
      `<div class="${cls}" data-slot="${r.slot}" data-gen="${r.genId}" data-alive="${r.alive ? 1 : 0}">` +
      `<span class="ln-sw" style="background:${swatch}"></span>` +
      `<span class="ln-gl">${glyph}</span>` +
      `<span class="ln-id">#${r.slot}</span>` +
      `<span class="ln-gen">gen ${r.generation}</span>` +
      `<span class="ln-bt">t${r.birthTick}</span>${dead}</div>`
    );
  }

  private body(view: LineageView): string {
    const spine = view.ancestors
      .map((r, i) => {
        const connector = i < view.ancestors.length - 1 ? `<div class="ln-conn">│</div>` : '';
        return this.rowHtml(r, r.key === view.selectedKey) + connector;
      })
      .join('');
    const childRows =
      view.children.length > 0
        ? view.children.map((r) => this.rowHtml(r, false)).join('')
        : `<div class="muted">no children yet</div>`;
    const pruned =
      view.prunedLeaves > 0
        ? `<div class="ln-foot muted">… ${view.prunedLeaves} old dead leaves pruned (counts still exact)</div>`
        : '';
    return (
      `<div class="ln-sec muted">ANCESTRY · founder → selected</div>${spine}` +
      `<div class="ln-sec">CHILDREN (${view.directChildren}) · dynasty ${view.dynasty}</div>${childRows}` +
      `<div class="ln-foot muted">founder ${view.founderKey} · click a live node to inspect</div>${pruned}`
    );
  }
}
```

- [ ] **Step 2: Add the DOM elements to `index.html`**

In `index.html`, the inspector header currently reads `<h2>inspector</h2>` (near the `#inspector` div). Replace it with a header carrying the opener button (the button must be OUTSIDE `#inspector`, which is innerHTML-rewritten every frame):

Find:
```html
      <h2>inspector</h2>
      <div id="inspector"></div>
```
Replace with:
```html
      <h2 class="insp-head">inspector
        <button id="lineage-open" class="btn ln-btn" title="family tree (t)">🌳 tree</button>
      </h2>
      <div id="inspector"></div>
```

Then, immediately after the existing legend pill line:
```html
    <div id="legend-panel" class="panel"></div>
    <button id="legend-pill">legend</button>
```
add the lineage panel:
```html
    <div id="lineage-panel" class="panel"></div>
```

- [ ] **Step 3: Add the `.ln-*` CSS to `index.html`**

In the `<style>` block, after the legend's `.lg-valbar` rule (search for `.lg-valbar`), add:

```css
      /* Family-tree modal — centered floating overlay, opened from the inspector 🌳 button or 't'. */
      #lineage-panel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 300px;
        max-height: 72vh;
        overflow-y: auto;
        z-index: 20; /* above the side panels (z 10) and legend (z 5) */
        display: none;
        font-size: 11px;
        line-height: 1.5;
      }
      .insp-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .ln-btn {
        font-size: 10px;
        padding: 2px 7px;
        text-transform: none;
        letter-spacing: 0;
      }
      .ln-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: var(--muted);
        letter-spacing: 0.1em;
        text-transform: uppercase;
        margin-bottom: 8px;
      }
      .ln-x {
        background: none;
        border: none;
        color: var(--muted);
        cursor: pointer;
        font: inherit;
        padding: 0 2px;
        line-height: 1;
      }
      .ln-x:hover {
        color: var(--accent);
      }
      .ln-sec {
        color: var(--muted);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-size: 10px;
        margin: 10px 0 5px;
      }
      .ln-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 3px 5px;
        border-radius: 4px;
        border: 1px solid transparent;
      }
      .ln-live {
        cursor: pointer;
      }
      .ln-live:hover {
        border-color: var(--border);
        background: rgba(120, 170, 210, 0.08);
      }
      .ln-sel {
        border-color: var(--accent);
        background: rgba(120, 170, 210, 0.14);
      }
      .ln-sw {
        width: 11px;
        height: 11px;
        border-radius: 3px;
        flex: 0 0 auto;
      }
      .ln-gl {
        color: var(--text);
      }
      .ln-id {
        color: var(--text);
        min-width: 38px;
      }
      .ln-gen,
      .ln-bt {
        color: var(--muted);
      }
      .ln-dead {
        color: var(--danger, #e08a8a);
      }
      .ln-conn {
        color: var(--muted);
        padding-left: 9px;
        line-height: 1;
        height: 9px;
      }
      .ln-foot {
        margin-top: 9px;
        font-size: 10px;
        word-break: break-all;
      }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (The modal isn't wired into `main.ts` yet, so this only proves the new module type-checks.)

- [ ] **Step 5: Commit**

```bash
git add src/app/observability/lineage-modal.ts index.html
git commit -m "feat(observability): lineage modal view + DOM/CSS (unwired)"
```

---

### Task 4: Wire into the demo + full verification

**Files:**
- Modify: `src/app/main.ts`

**Interfaces:**
- Consumes: `Lineage` (`./observability/lineage`), `LineageModal` (`./observability/lineage-modal`). DOM ids `lineage-panel`, `lineage-open` (Task 3).
- Produces: the live feature. No new exports.

- [ ] **Step 1: Import the recorder + modal**

In `src/app/main.ts`, after the existing observability imports (the `FollowRecorder` import line), add:

```ts
import { Lineage } from './observability/lineage';
import { LineageModal } from './observability/lineage-modal';
```

- [ ] **Step 2: Instantiate the recorder, set `onBirth`, snapshot founders**

Immediately after `let world = new World(config);` (around line 77), add:

```ts
// Lineage recorder — fed by the read-only onBirth hook (pure observation, determinism-safe). The
// hook lives on the config object the world holds; the spreads in reset/Knobs preserve the function
// reference, and economy.ts reads cfg.onBirth live, so it survives rebuild().
const lineage = new Lineage();
config.onBirth = lineage.onBirth;
lineage.reset(world.store); // snapshot the seeded population as gen-0 founders
```

- [ ] **Step 3: Add a `selectCreature` helper and route the modal through it**

Replace the body of `selectAt` (around lines 333-339, the `if (best >= 0) { … }` block) so selection is centralized. Find:

```ts
  if (best >= 0) {
    selected = { slot: best, gen: s.genId[best]! };
    inspector.select(best, selected.gen);
    brainView.select(best, selected.gen);
    radar.select(best, selected.gen);
  }
}
```
Replace with:
```ts
  if (best >= 0) selectCreature(best, s.genId[best]!);
}

// Centralized selection: re-roots the whole inspector shell + the lineage modal onto one individual.
// Used by click-to-inspect AND by clicking a live node inside the family-tree modal.
function selectCreature(slot: number, gen: number): void {
  selected = { slot, gen };
  inspector.select(slot, gen);
  brainView.select(slot, gen);
  radar.select(slot, gen);
  lineageModal.select(slot, gen);
}
```

- [ ] **Step 4: Construct the modal + wire the opener button**

After the `selectCreature` function (and after `selected` is declared earlier at line 124, so it's in scope), add — place this near the other observability instantiations, e.g. right after `const recorder = new FollowRecorder();` (line 113). Because `selectCreature` references `lineageModal`, and `lineageModal`'s `onPick` references `selectCreature`, declare the modal before `selectCreature` is *called* (both are module-scope; hoisting of the `function` declaration is fine, but `const lineageModal` must be initialized before the first click). Put this right after `const recorder = new FollowRecorder();`:

```ts
const lineageModal = new LineageModal(el('lineage-panel'), lineage, (slot, gen) =>
  selectCreature(slot, gen),
);
el<HTMLButtonElement>('lineage-open').addEventListener('click', () => lineageModal.setOpen(true));
```

- [ ] **Step 5: Commit the lineage births each tick**

In `followTick()` (around line 189), add the commit call so it fires on every stepped tick (the function is already called at every step site: `onStep`, slow-mo, and the fast loop):

Find:
```ts
function followTick(): void {
  recorder.record(world.store, config, world.tick);
  if (recorder.isFollowedAlive(world.store))
    pushTrail(world.store.x[recorder.followedSlot]!, world.store.y[recorder.followedSlot]!);
}
```
Replace with:
```ts
function followTick(): void {
  recorder.record(world.store, config, world.tick);
  lineage.commit(world.store, world.tick); // drain this tick's births into the family-tree forest
  if (recorder.isFollowedAlive(world.store))
    pushTrail(world.store.x[recorder.followedSlot]!, world.store.y[recorder.followedSlot]!);
}
```

- [ ] **Step 6: Reset the forest on rebuild + render the modal each frame**

In `rebuild()` (around line 304), after `world = new World(config);` add the reseed, and clear the modal's key:

Find:
```ts
function rebuild(): void {
  world = new World(config);
  selected = null;
```
Replace with:
```ts
function rebuild(): void {
  world = new World(config);
  lineage.reset(world.store); // new world → re-snapshot founders, drop the old forest
  lineageModal.select(-1, 0); // clear the modal's target (it stays open if it was open)
  selected = null;
```

In `frame()`, after the existing `radar.render(world.store, config);` line (around line 585), add:
```ts
  lineageModal.render(world.store); // family-tree modal (no-op while closed)
```

- [ ] **Step 7: Add the `t` keyboard shortcut + HUD hint**

In the `keydown` handler (around line 385), after the `'l'` follow block's closing `}` (before the handler's final `}`), add:

```ts
  if (e.key === 't' || e.key === 'T') lineageModal.toggle(); // family tree of the selection
```

Then update the HUD hint text in `index.html` (the `#hud-body` block) — find:
```html
        <b>c</b> = color mode · <b>l</b> = follow + record.
```
Replace with:
```html
        <b>c</b> = color mode · <b>l</b> = follow + record · <b>t</b> = family tree.
```

- [ ] **Step 8: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: clean (exit 0).

- [ ] **Step 9: Determinism + full suite (sacred gate)**

Run: `NODE_OPTIONS=--expose-gc npx vitest run`
Expected: PASS — **313 tests** (now 319 with the 6 new lineage tests; the pre-existing 313 must all stay green, especially `src/core/world.test.ts` same-seed→same-hash). If any determinism test regressed, STOP — the recorder must be pure observation; re-check that nothing in `lineage.*`/`main.ts` mutates the store/RNG.

- [ ] **Step 10: Manual verification on a FRESH Vite port**

(Stale-module gotcha: a same-port reload can serve a stale compiled main.ts — always use a fresh port.)

```bash
npm run build
npx vite preview --port 5191 --strictPort
```
Open http://localhost:5191, press play, let it run, then:
1. Click a creature → press `t` (or the `🌳 tree` button). Confirm the modal opens centered with an ancestor spine, the selected row highlighted, CHILDREN count + dynasty number, hue swatches + diet glyphs.
2. Click a **founder**-era creature (early, low gen) → spine is short (gen 0 at top); click a **deep descendant** (high gen) → long spine to the founder.
3. Click a **live** ancestor/child row inside the modal → it re-inspects (inspector/brain/radar + the tree re-root onto it).
4. Let a creature you're viewing die → its tree still renders, dead rows show `✝` and are inert.
5. Press `t` again (or ✕) → modal closes.
6. Reset (new seed) → modal target clears; founders re-snapshot (a freshly clicked creature shows gen 0).
7. Let it run to ~10k ticks; in the console run `sim.world` is fine — confirm no runaway memory (the forest caps at 50k nodes; the modal footer shows a pruned-leaves note only if the cap is hit). Heap stays bounded.

- [ ] **Step 11: Commit**

```bash
git add src/app/main.ts index.html
git commit -m "feat(observability): wire lineage family-tree modal into the demo (t / 🌳)"
```

---

## Self-Review

**Spec coverage:**
- Recorder fed by `onBirth` + founder snapshot + `(slot:genId)` keying → Task 1. ✓
- Contract-safe (buffer in `onBirth`, snapshot in `commit`) → Task 1 Step 3. ✓
- Query: ancestor chain + descendant/dynasty + stats → Task 1. ✓
- Bounded memory + visible `prunedLeaves` → Tasks 1 (`prune`) + 2 (test). ✓
- Modal mirrors Legend, closeable, per-node hue/diet/gen/birthTick/age, selected highlighted, clickable re-inspect → Task 3. ✓
- Opens via `t` + inspector button → Task 4 Steps 4, 7. ✓
- `onBirth` set in `main.ts`, `commit` each tick, `reset` at seed/rebuild, render in loop → Task 4. ✓
- Empty/error states (no selection, unknown key, founder, dead) → Task 3 `render`/`body` + Task 1 null return. ✓
- Determinism unchanged (313 green) → Task 4 Step 9. ✓
- Manual founder/mid/deep + 10k-tick bounded run → Task 4 Step 10. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `LineageStore`/`LineageRow`/`LineageView` and method names (`onBirth`, `reset`, `commit`, `query`, `queryBySlot`, `select`, `toggle`, `setOpen`, `render`, `selectCreature`) are used identically across Tasks 1, 3, 4. `dietShape`/`lineageColor`/`rgbCss` match `src/render/palette.ts`. `ScalarGene.DIET`/`SCALAR_GENE_COUNT` match `src/core/genome.ts`.
