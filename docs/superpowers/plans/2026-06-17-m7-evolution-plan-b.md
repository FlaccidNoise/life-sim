# M7 Evolution — Plan B (Rich Explorer: Champion, Phylogeny, Menagerie) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the three remaining M7 explorer features as pure read-only observability over the already-evolving forager population: a champion hall-of-fame (largest live lineages), a phylogeny tree (who-descended-from-whom, with extinct-subtree pruning), and a species menagerie (greedy clustering of live genomes by genetic distance).

**Architecture:** Plan A turned mutation ON and proved economic selection + open-ended emergence (genotypic diversity climbs under `changeType` 0.015). Plan B is *windows onto that process*, nothing more. Founder ids are stamped onto genomes (part of the determinism contract). A `LineageLog` records births/deaths as a canonical tree (part of the determinism contract; hashed by the reproducibility test). Champion and species summaries are sampled telemetry (derived, cadence-gated, like `Metrics` — NOT byte-identical-hashed). Three text UI panels mirror the existing genome-inspector pattern (toggle key → per-frame render of a pure formatter's output).

**Tech Stack:** TypeScript strict (`noUncheckedIndexedAccess` → `!` on indexed reads), Vite, Vitest 4, pnpm 11, Node 22. Per-task gate: `make check` (= `pnpm typecheck && pnpm lint && pnpm test`).

## Global Constraints

- **CARDINAL RULE (selection stays economic):** Nothing in `src/core/sim/**` or `src/core/organism/**` may branch on `founderId`, lineage, species, champion rank, or any panel/board state. These structures are observation-only. Survival/reproduction remain: aggregate energy ≥ `reproThreshold` → reproduce; ≤ `deathFloor` → die. NO fitness function, score, ranking, or trait-gated survival — ever. Ranking exists ONLY in display code (`src/app/**`) and in sampled boards that the sim never reads back.
- **Determinism — contract members:** `founderId` (a field on `Genome`, serialized into the genome library) and the `LineageLog` ARE part of the byte-identical contract. They are written in deterministic order (reproduction scans organisms ascending; death frees ascending) and depend on no RNG. The existing M7 reproducibility test (`src/core/sim/reproducibility.test.ts`, the `describe('reproducibility — M7 mutation>0 with births AND deaths')` block) string-compares `serializeGenomeLibrary(...)`, so `founderId` is covered automatically once added; Task B5 extends that block to also compare `serializeLineageLog(...)`.
- **Determinism — telemetry (NOT hashed):** champion board (`sampleLineages`) and species board (`sampleSpecies`) are derived summaries sampled at `config.metricsEvolutionInterval` cadence, exactly like `sampleEvolutionMetrics`. They write only into board fields/maps, draw no RNG, mutate no SoA. They must still be deterministic *functions of state* (they are), but they are NOT asserted byte-identical.
- **Sampling cadence:** reuse the existing `config.metricsEvolutionInterval` (default 16) for the new board/log sampling. Do NOT add a second cadence knob.
- **Free UI keys:** `J` (hall-of-fame), `Y` (phylogeny), `K` (menagerie) are all currently unbound — verified. Each panel mirrors the genome-inspector (`G`) pattern: a `<div class="panel hidden">`, a `show*` flag, a keydown toggle, and a per-frame gated render inside `drawScene`.
- **Empty states first (Josh's global rule):** every panel renders a clear empty-state message when there is no data (no live genome organisms / no lineages / no species), BEFORE the populated path.
- **Commits:** use `git commit --no-verify` (a beads hook rejects normal commits). NEVER add a `Co-Authored-By` trailer (a hook blocks it). One commit per task minimum; TDD sub-steps may commit more.
- **Species-distance correction (binding design decision — see Task B7):** the M7 design spec said "match genes by `Gene.innovation`". That is DEGENERATE in this codebase: every founder gene built by `buildForagerGenome`/`buildAutotrophGenome`/`buildCritterGenome` has `innovation: 0` (critter-genome.ts:30,108,155), so innovation ids are not unique within a genome and cannot key a NEAT alignment. Task B7 therefore defines genetic distance over per-cell-type gene counts + connection/motor counts (which IS sensitive to the `changeType` morphs that `genotypicDiversity` tracks) plus an index-aligned connection-weight term. This deviation is intentional and is flagged in the end-of-work uncertainties list for Josh.

---

## Phase 3 — Champion / Hall-of-Fame

### Task B1: Founder ids on the genome (determinism contract)

Stamp a stable, heritable `founderId` on every genome so live organisms can be bucketed by which founding lineage they descend from. Founders get a fresh monotonic id at registration; children inherit their parent's id automatically (it rides `cloneGenome`, which `mutateGenome` calls).

**Files:**
- Modify: `src/core/genome/genome.ts` (the `Genome` interface, `cloneGenome`, `GenomeStore`)
- Modify: `src/core/genome/critter-genome.ts` (3 builders: add `founderId: -1`)
- Test: `src/core/genome/founder-id.test.ts` (create)

**Interfaces:**
- Produces: `Genome.founderId: number` (-1 = unassigned sentinel, like `parentRef: -1`); `GenomeStore.nextFounderId(): number`; `register()` lazily assigns `founderId` when it is `< 0`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test** — `src/core/genome/founder-id.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GenomeStore, cloneGenome } from './genome';
import { buildForagerGenome } from './critter-genome';

describe('founderId', () => {
  it('assigns a fresh founder id to each founder at register, distinct and monotonic', () => {
    const store = new GenomeStore();
    const a = buildForagerGenome(6);
    const b = buildForagerGenome(6);
    expect(a.founderId).toBe(-1); // builders leave it unassigned
    store.register(a);
    store.register(b);
    expect(a.founderId).toBe(0);
    expect(b.founderId).toBe(1);
  });

  it('a clone inherits the parent founder id (so children stay in the lineage)', () => {
    const store = new GenomeStore();
    const parent = buildForagerGenome(6);
    store.register(parent); // parent.founderId = 0
    const child = cloneGenome(parent);
    expect(child.founderId).toBe(0); // inherited by the clone, BEFORE its own register
    store.register(child); // already >= 0 → register must NOT reassign
    expect(child.founderId).toBe(0);
  });

  it('does not reassign a genome that already carries a founder id', () => {
    const store = new GenomeStore();
    const g = buildForagerGenome(6);
    g.founderId = 7; // pretend it arrived pre-stamped
    store.register(g);
    expect(g.founderId).toBe(7);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** — `pnpm exec vitest run src/core/genome/founder-id.test.ts`. Expected: FAIL (`founderId` not on the type; builders don't set it; `register` doesn't assign).

- [ ] **Step 3: Add `founderId` to the `Genome` interface.** In `src/core/genome/genome.ts`, after the `generation` field (line 77) inside `interface Genome`:

```ts
  /** Lineage depth (0 for a founder). */
  generation: number;
  /** Founding-lineage id: a founder gets a fresh monotonic id at register; descendants inherit it
   * (rides cloneGenome). -1 until the founder is registered. Part of the determinism contract. */
  founderId: number;
```

- [ ] **Step 4: Copy `founderId` in `cloneGenome`.** In the `cloneGenome` return object (genome.ts:89-90), add the field alongside the other lineage fields:

```ts
    parentRef: g.parentRef,
    generation: g.generation,
    founderId: g.founderId,
```

- [ ] **Step 5: Add the founder counter + lazy assignment to `GenomeStore`.** Add a private field next to `innovation` (genome.ts:111), initialise it in the constructor, add the assignment inside `register`, and add the `nextFounderId` method:

```ts
  private innovation: number;
  private founder: number;
```
```ts
    this.innovation = 0;
    this.founder = 0;
```
```ts
  /** Register a genome, returning its fresh ref. A founder (founderId < 0) is lazily stamped with a
   * fresh founder id here — deterministic, since register order is canonical (init + ascending repro). */
  register(g: Genome): number {
    if (g.founderId < 0) g.founderId = this.founder++;
    const ref = this.nextRef++;
    this.genomes.set(ref, g);
    return ref;
  }
```
```ts
  /** Next founding-lineage id (monotonic). Used by register for founders; descendants inherit. */
  nextFounderId(): number {
    return this.founder++;
  }
```

- [ ] **Step 6: Set `founderId: -1` in the three builders.** In `src/core/genome/critter-genome.ts`, each builder returns a `Genome` literal ending `parentRef: -1, generation: 0,`. Add `founderId: -1,` after `generation: 0,` in all three (`buildCritterGenome` ~line 94, `buildAutotrophGenome` ~line 136, `buildForagerGenome` ~line 210):

```ts
    parentRef: -1,
    generation: 0,
    founderId: -1,
  };
```

- [ ] **Step 7: Run the new test + full check** — `pnpm exec vitest run src/core/genome/founder-id.test.ts` (expect PASS), then `make check`. If any existing test asserts an exact serialized-genome JSON string, update its expectation to include the new `founderId` field. The reproducibility test should stay green (both runs assign founder ids in identical order → identical library strings).

- [ ] **Step 8: Commit** — `git add -A && git commit --no-verify -m "feat(M7): heritable founderId on genome (lazy-assigned at register, rides clone)"`.

---

### Task B2: Sample live lineages into a champion board

A cadence-sampled board of the largest **live** lineages, ranked by current member count, with a persistent peak-count + first-seen-tick accumulator. Read by the hall-of-fame panel (B3) and `sim.champions()`.

**Files:**
- Create: `src/core/sim/lineage-board.ts`
- Modify: `src/core/sim/world.ts` (own the accumulator + board; sample at cadence)
- Modify: `src/app/main.ts` (`SimHandle.champions()` + `spawnChampion(k)`)
- Test: `src/core/sim/lineage-board.test.ts` (create)

**Interfaces:**
- Consumes: `Genome.founderId` (B1); `OrganismTable` (`maxOrganisms`, `isAlive`, `cellCount`, `genomeRef`); `GenomeStore.get`.
- Produces:
  - `interface LineageSummary { founderId: number; liveCount: number; peakCount: number; firstTick: number; representativeRef: number; }`
  - `interface LineageStat { firstTick: number; peakCount: number; }`
  - `function sampleLineages(organisms, genomes, stats: Map<number, LineageStat>, tick: number, k: number): LineageSummary[]`
  - `World.lineageBoard: readonly LineageSummary[]` (public, default `[]`)
  - `SimHandle.champions(): LineageSummary[]`, `SimHandle.spawnChampion(k?: number): number`

- [ ] **Step 1: Write the failing test** — `src/core/sim/lineage-board.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { develop } from '../genome/develop';
import { buildForagerGenome } from '../genome/critter-genome';
import { instantiateBody } from '../organism/instantiate';
import { sampleLineages, type LineageStat } from './lineage-board';

function spawnFounder(w: World, x: number, y: number): void {
  const cfg = w.config;
  const g = buildForagerGenome(cfg.cellRadius, 100);
  const ref = w.genomes.register(g);
  const body = develop(g, cfg.maxCellsPerOrganism, cfg.maxRecursionDepth);
  instantiateBody(body, w.cells, w.net, w.bonds, w.organisms, ref, x, y, 0,
    cfg.worldWidth, cfg.worldHeight, w.instantiateScratch);
}

describe('sampleLineages', () => {
  it('buckets live organisms by founderId, ranks by liveCount, tracks peak + firstTick', () => {
    const cfg = defaultConfig({ seed: 1, maxCells: 4000, worldWidth: 256, worldHeight: 256,
      initialPhotoFraction: 1, initialMotileFraction: 0 });
    const w = new World(cfg, false);
    w.seedLife(400);
    spawnFounder(w, 60, 60);   // founderId 0
    spawnFounder(w, 180, 60);  // founderId 1
    spawnFounder(w, 120, 180); // founderId 2
    w.tick(); // aggregate so cellCount > 0

    const stats = new Map<number, LineageStat>();
    const board = sampleLineages(w.organisms, w.genomes, stats, 5, 8);
    // three live lineages, each one organism
    expect(board.length).toBe(3);
    expect(board.every((s) => s.liveCount === 1)).toBe(true);
    expect(board.map((s) => s.founderId).sort((a, b) => a - b)).toEqual([0, 1, 2]);
    expect(board.every((s) => s.firstTick === 5)).toBe(true);
    expect(board.every((s) => s.peakCount === 1)).toBe(true);
    // representativeRef points at a real live genome
    expect(board.every((s) => w.genomes.get(s.representativeRef) !== undefined)).toBe(true);
  });

  it('peakCount is monotonic non-decreasing and firstTick is the earliest sample', () => {
    const cfg = defaultConfig({ seed: 1, maxCells: 4000, worldWidth: 256, worldHeight: 256,
      initialPhotoFraction: 1, initialMotileFraction: 0 });
    const w = new World(cfg, false);
    w.seedLife(400);
    spawnFounder(w, 60, 60);
    w.tick();
    const stats = new Map<number, LineageStat>();
    sampleLineages(w.organisms, w.genomes, stats, 10, 8);
    spawnFounder(w, 70, 70); // same founder? no — distinct founderId. Use same-lineage clone instead:
    // second founder is a DIFFERENT lineage; assert founder 0's peak/firstTick are preserved.
    const board = sampleLineages(w.organisms, w.genomes, stats, 20, 8);
    const s0 = board.find((s) => s.founderId === 0)!;
    expect(s0.firstTick).toBe(10);      // earliest sample that saw founder 0
    expect(s0.peakCount).toBeGreaterThanOrEqual(1);
  });

  it('returns at most k entries', () => {
    const cfg = defaultConfig({ seed: 1, maxCells: 4000, worldWidth: 256, worldHeight: 256,
      initialPhotoFraction: 1, initialMotileFraction: 0 });
    const w = new World(cfg, false);
    w.seedLife(400);
    for (let i = 0; i < 5; i++) spawnFounder(w, 40 + i * 30, 60);
    w.tick();
    const board = sampleLineages(w.organisms, w.genomes, new Map(), 1, 3);
    expect(board.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** — `pnpm exec vitest run src/core/sim/lineage-board.test.ts`. Expected: FAIL (`./lineage-board` has no exports).

- [ ] **Step 3: Implement `src/core/sim/lineage-board.ts`:**

```ts
import { type OrganismTable } from '../organism/organisms';
import { type GenomeStore } from '../genome/genome';

/** One row of the champion hall-of-fame: a currently-LIVE founding lineage. */
export interface LineageSummary {
  founderId: number;
  liveCount: number;
  peakCount: number;
  firstTick: number;
  representativeRef: number;
}

/** Persistent per-lineage accumulator (telemetry — survives across samples on the World). */
export interface LineageStat {
  firstTick: number;
  peakCount: number;
}

/**
 * Sample the live genome-organism population into a ranked board of founding lineages (M7 §5,
 * Plan B Phase 3). Read-only: scans organisms, buckets by `founderId`, updates the persistent
 * `stats` accumulator (peak + first-seen), returns the top-`k` LIVE lineages by member count.
 * Draws no RNG, mutates no SoA — sampled telemetry, NOT part of the byte-identical contract.
 * Allocates Maps, so callers run it at the reduced `metricsEvolutionInterval` cadence.
 */
export function sampleLineages(
  organisms: OrganismTable,
  genomes: GenomeStore,
  stats: Map<number, LineageStat>,
  tick: number,
  k: number,
): LineageSummary[] {
  const liveCounts = new Map<number, number>();
  const repRef = new Map<number, number>(); // founderId -> lowest live genome ref (deterministic)
  for (let org = 1; org < organisms.maxOrganisms; org++) {
    if (!organisms.isAlive(org) || organisms.cellCount[org]! === 0) continue;
    const ref = organisms.genomeRef[org]!;
    if (ref < 0) continue;
    const g = genomes.get(ref);
    if (g === undefined) continue;
    const fid = g.founderId;
    liveCounts.set(fid, (liveCounts.get(fid) ?? 0) + 1);
    const prev = repRef.get(fid);
    if (prev === undefined || ref < prev) repRef.set(fid, ref);
  }

  const out: LineageSummary[] = [];
  for (const [fid, liveCount] of liveCounts) {
    let st = stats.get(fid);
    if (st === undefined) {
      st = { firstTick: tick, peakCount: liveCount };
      stats.set(fid, st);
    } else if (liveCount > st.peakCount) {
      st.peakCount = liveCount;
    }
    out.push({
      founderId: fid,
      liveCount,
      peakCount: st.peakCount,
      firstTick: st.firstTick,
      representativeRef: repRef.get(fid)!,
    });
  }
  // Rank by current size desc, tie-break by founderId asc (deterministic).
  out.sort((a, b) => (b.liveCount - a.liveCount) || (a.founderId - b.founderId));
  return out.slice(0, k);
}
```

- [ ] **Step 4: Run the unit test** — `pnpm exec vitest run src/core/sim/lineage-board.test.ts`. Expected: PASS.

- [ ] **Step 5: Wire the board into `World`.** In `src/core/sim/world.ts`:
  - Add imports: `import { sampleLineages, type LineageSummary, type LineageStat } from './lineage-board';`
  - Add fields near the other public state (e.g. after `metrics`): `lineageBoard: readonly LineageSummary[] = [];` and a private accumulator `private readonly lineageStats = new Map<number, LineageStat>();`
  - In `tick()`, in the evolution-telemetry block right after the existing gated `sampleEvolutionMetrics(...)` call (world.ts ~526-528), add another statement INSIDE the same `if (this.tickCount % cfg.metricsEvolutionInterval === 0)` block:

```ts
    if (this.tickCount % cfg.metricsEvolutionInterval === 0) {
      sampleEvolutionMetrics(this.metrics, this.organisms, this.genomes);
      this.lineageBoard = sampleLineages(this.organisms, this.genomes, this.lineageStats, this.tickCount, 8);
    }
```

- [ ] **Step 6: Add `champions()` + `spawnChampion(k)` to the `SimHandle`.** In `src/app/main.ts`, add to the `SimHandle` interface (~lines 407-423) and the object literal (~458-515):

```ts
  champions(): LineageSummary[];
  spawnChampion(k?: number): number;
```
```ts
  champions: () => world.lineageBoard.slice(),
  spawnChampion: (k = 0) => {
    const board = world.lineageBoard;
    if (k < 0 || k >= board.length) return -1;
    const g = world.genomes.get(board[k]!.representativeRef);
    if (g === undefined) return -1;
    // Clone keeps founderId → the spawned champion joins its own dynasty (a member, not a new founder).
    return developInto(cloneGenome(g), cx0(), cy0(), 0);
  },
```
  Add the imports main.ts needs at the top: `cloneGenome` from `../core/genome/genome` (if not already imported) and `LineageSummary` from `../core/sim/lineage-board`. `developInto`, `cx0`, `cy0` already exist (main.ts:58, 424-425).

- [ ] **Step 7: Run full check** — `make check`. Expected: all green (273 + new tests).

- [ ] **Step 8: Commit** — `git add -A && git commit --no-verify -m "feat(M7): sampleLineages champion board + sim.champions()/spawnChampion()"`.

---

### Task B3: Hall-of-fame panel (key J)

A text panel listing the champion board: rank, founder id, live count, peak, age. Empty state when no live lineages. Mirrors the genome-inspector (`G`) panel exactly.

**Files:**
- Create: `src/app/hall-of-fame.ts` (pure formatter + thin render)
- Modify: `index.html` (panel `<div>`)
- Modify: `src/app/main.ts` (element grab, `showHallOfFame` flag, key `J` toggle, gated render in `drawScene`)
- Test: `src/app/hall-of-fame.test.ts` (create — tests the pure formatter)

**Interfaces:**
- Consumes: `LineageSummary[]` (B2), `World.tickCount`.
- Produces: `function formatHallOfFame(board: LineageSummary[], tick: number): string[]`; `function renderHallOfFame(world: World, panel: HTMLElement): void`.

- [ ] **Step 1: Write the failing test** — `src/app/hall-of-fame.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatHallOfFame } from './hall-of-fame';
import { type LineageSummary } from '../core/sim/lineage-board';

describe('formatHallOfFame', () => {
  it('shows an empty state when there are no live lineages', () => {
    const lines = formatHallOfFame([], 100);
    expect(lines.join('\n')).toMatch(/no live lineages/i);
  });

  it('lists lineages with rank, founder id, live count, peak and age', () => {
    const board: LineageSummary[] = [
      { founderId: 3, liveCount: 12, peakCount: 20, firstTick: 40, representativeRef: 7 },
      { founderId: 1, liveCount: 5, peakCount: 9, firstTick: 10, representativeRef: 2 },
    ];
    const lines = formatHallOfFame(board, 100);
    const text = lines.join('\n');
    expect(text).toMatch(/HALL OF FAME/i);
    expect(text).toContain('#3');   // founder id
    expect(text).toContain('12');   // live count
    expect(text).toContain('20');   // peak
    expect(text).toContain('60');   // age = 100 - 40
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** — `pnpm exec vitest run src/app/hall-of-fame.test.ts`. Expected: FAIL (no module).

- [ ] **Step 3: Implement `src/app/hall-of-fame.ts`:**

```ts
import { type World } from '../core/sim/world';
import { type LineageSummary } from '../core/sim/lineage-board';

/** Pure: format the champion board into display lines (empty state first). */
export function formatHallOfFame(board: LineageSummary[], tick: number): string[] {
  const lines: string[] = ['HALL OF FAME — largest live lineages (J)'];
  if (board.length === 0) {
    lines.push('  no live lineages yet');
    return lines;
  }
  lines.push('  rank  founder   live   peak    age');
  for (let i = 0; i < board.length; i++) {
    const s = board[i]!;
    const rank = String(i + 1).padStart(4);
    const fid = `#${s.founderId}`.padStart(7);
    const live = String(s.liveCount).padStart(6);
    const peak = String(s.peakCount).padStart(6);
    const age = String(Math.max(0, tick - s.firstTick)).padStart(7);
    lines.push(`  ${rank}  ${fid} ${live} ${peak} ${age}`);
  }
  return lines;
}

/** Render the live champion board into the panel element (read-only). */
export function renderHallOfFame(world: World, panel: HTMLElement): void {
  panel.textContent = formatHallOfFame(world.lineageBoard.slice(), world.tickCount).join('\n');
}
```

- [ ] **Step 4: Run the formatter test** — `pnpm exec vitest run src/app/hall-of-fame.test.ts`. Expected: PASS.

- [ ] **Step 5: Add the panel `<div>` to `index.html`.** Near the genome panel (`<div id="genome" class="panel hidden" ...>`, index.html ~247-252), add a sibling:

```html
    <div id="hall-of-fame" class="panel hidden" style="left: 12px; bottom: 12px;"></div>
```
  (Use a position that does not overlap existing panels; match the existing `.panel` styling — `white-space: pre`, monospace, the `.hidden` opacity/visibility rule already applies.)

- [ ] **Step 6: Wire the toggle + render in `src/app/main.ts`:**
  - Import: `import { renderHallOfFame } from './hall-of-fame';`
  - Near the other panel grabs (main.ts ~120-126): `const hallPanel = document.getElementById('hall-of-fame') as HTMLElement; let showHall = false;`
  - In the keydown handler (after the existing `h`/`H` branch ~line 345), add:

```ts
    } else if (e.key === 'j' || e.key === 'J') {
      showHall = !showHall;
      hallPanel.classList.toggle('hidden', !showHall);
```
  - In `drawScene`, after the genome-inspector render block (~line 232), add:

```ts
    if (showHall) renderHallOfFame(world, hallPanel);
```

- [ ] **Step 7: Run full check** — `make check`. Expected: green.

- [ ] **Step 8: Visual verify (Playwright).** `pnpm dev` (or the existing dev command), navigate to the app, press `J`, confirm the panel appears with the "HALL OF FAME" header and either the empty state (early) or ranked rows (after lineages diverge). Press `J` again to hide. Capture a screenshot to the SDD artifacts dir. (If a headless dev server isn't trivially available, the implementer reports that the formatter unit test + `make check` pass and notes the panel wiring mirrors the verified genome-inspector pattern; the controller does the live Playwright check.)

- [ ] **Step 9: Commit** — `git add -A && git commit --no-verify -m "feat(M7): hall-of-fame panel (J) — largest live lineages"`.

---

## Phase 4 — Phylogeny

### Task B4: LineageLog data structure (pure)

An append-only-with-pruning tree of genome births/deaths. Pure core/genome module, fully unit-tested in isolation (constructs a `GenomeStore`, records births/deaths, prunes). No World, no SoA.

**Files:**
- Create: `src/core/genome/lineage-log.ts`
- Test: `src/core/genome/lineage-log.test.ts` (create)

**Interfaces:**
- Consumes: `GenomeStore.get`, `genomeSignature` (from `./traits`), `Genome` fields `parentRef`/`generation`/`founderId`.
- Produces:
  - `interface LineageNode { ref: number; parentRef: number; generation: number; founderId: number; birthTick: number; deathTick: number; signature: string; }`
  - `class LineageLog { constructor(store: GenomeStore); recordBirth(ref, tick): void; recordDeath(ref, tick): void; prune(maxNodes): void; list(): LineageNode[]; get size(): number; }`
  - `function serializeLineageLog(log: LineageLog): string`

- [ ] **Step 1: Write the failing test** — `src/core/genome/lineage-log.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GenomeStore, cloneGenome } from './genome';
import { buildForagerGenome } from './critter-genome';
import { LineageLog, serializeLineageLog } from './lineage-log';

function child(store: GenomeStore, parentRef: number): number {
  const parent = store.get(parentRef)!;
  const c = cloneGenome(parent);
  c.parentRef = parentRef;
  c.generation = parent.generation + 1;
  return store.register(c);
}

describe('LineageLog', () => {
  it('lazily roots a founder when its first child is recorded, and links the child', () => {
    const store = new GenomeStore();
    const fRef = store.register(buildForagerGenome(6)); // founder, founderId 0
    const cRef = child(store, fRef);
    const log = new LineageLog(store);
    log.recordBirth(cRef, 50);
    const nodes = log.list();
    expect(nodes.length).toBe(2); // founder root (lazy) + child
    const root = nodes.find((n) => n.ref === fRef)!;
    const kid = nodes.find((n) => n.ref === cRef)!;
    expect(root.parentRef).toBe(-1);
    expect(root.generation).toBe(0);
    expect(kid.parentRef).toBe(fRef);
    expect(kid.generation).toBe(1);
    expect(kid.founderId).toBe(0);
  });

  it('records death by stamping deathTick on the node', () => {
    const store = new GenomeStore();
    const fRef = store.register(buildForagerGenome(6));
    const cRef = child(store, fRef);
    const log = new LineageLog(store);
    log.recordBirth(cRef, 50);
    log.recordDeath(cRef, 80);
    expect(log.list().find((n) => n.ref === cRef)!.deathTick).toBe(80);
  });

  it('recordDeath on an unknown ref is a no-op', () => {
    const store = new GenomeStore();
    const log = new LineageLog(store);
    expect(() => log.recordDeath(999, 10)).not.toThrow();
    expect(log.size).toBe(0);
  });

  it('prune removes dead subtrees (oldest first) but never a node with a live descendant', () => {
    const store = new GenomeStore();
    const fRef = store.register(buildForagerGenome(6));
    const c1 = child(store, fRef);
    const c2 = child(store, fRef);
    const g1 = child(store, c1); // grandchild under c1
    const log = new LineageLog(store);
    log.recordBirth(c1, 10);
    log.recordBirth(c2, 20);
    log.recordBirth(g1, 30);
    // c2 dies (dead leaf); c1 dies but has a LIVE grandchild g1; founder root never dies.
    log.recordDeath(c2, 40);
    log.recordDeath(c1, 50);
    log.prune(3); // over cap (4 nodes) → must drop the dead leaf c2 first
    const refs = log.list().map((n) => n.ref);
    expect(refs).not.toContain(c2);   // dead leaf pruned
    expect(refs).toContain(g1);       // live node kept
    expect(refs).toContain(c1);       // c1 kept: has a live descendant
    expect(refs).toContain(fRef);     // root kept: has live descendants
  });

  it('serializes deterministically in ref order', () => {
    const store = new GenomeStore();
    const fRef = store.register(buildForagerGenome(6));
    const c1 = child(store, fRef);
    const log = new LineageLog(store);
    log.recordBirth(c1, 10);
    const json = serializeLineageLog(log);
    expect(json).toBe(serializeLineageLog(log)); // stable
    const parsed = JSON.parse(json) as { ref: number }[];
    expect(parsed.map((n) => n.ref)).toEqual([...parsed.map((n) => n.ref)].sort((a, b) => a - b));
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** — `pnpm exec vitest run src/core/genome/lineage-log.test.ts`. Expected: FAIL (no module).

- [ ] **Step 3: Implement `src/core/genome/lineage-log.ts`:**

```ts
import { type GenomeStore } from './genome';
import { genomeSignature } from './traits';

/** One genome's node in the phylogeny tree. parentRef -1 = founder root. deathTick -1 = alive. */
export interface LineageNode {
  ref: number;
  parentRef: number;
  generation: number;
  founderId: number;
  birthTick: number;
  deathTick: number;
  signature: string;
}

/**
 * Append-only-with-pruning phylogeny of genome births/deaths (M7 §5, Plan B Phase 4). Nodes are
 * keyed by genome ref. recordBirth lazily roots a child's founder parent (founders are never
 * recorded directly — they appear the moment they first reproduce). recordDeath stamps deathTick.
 * prune drops fully-extinct subtrees from the leaves up, deterministically. Part of the
 * determinism contract: written in canonical (ascending-org reproduction / ascending free) order,
 * draws no RNG; the reproducibility test hashes serializeLineageLog(...).
 */
export class LineageLog {
  private readonly nodes = new Map<number, LineageNode>();
  constructor(private readonly store: GenomeStore) {}

  recordBirth(ref: number, tick: number): void {
    if (this.nodes.has(ref)) return;
    const g = this.store.get(ref);
    if (g === undefined) return;
    // Lazily root the parent (a founder) so the child has somewhere to attach.
    if (g.parentRef >= 0 && !this.nodes.has(g.parentRef)) {
      const pg = this.store.get(g.parentRef);
      this.nodes.set(g.parentRef, {
        ref: g.parentRef,
        parentRef: -1,
        generation: Math.max(0, g.generation - 1),
        founderId: g.founderId,
        birthTick: tick,
        deathTick: -1,
        signature: pg !== undefined ? genomeSignature(pg) : '?',
      });
    }
    this.nodes.set(ref, {
      ref,
      parentRef: g.parentRef,
      generation: g.generation,
      founderId: g.founderId,
      birthTick: tick,
      deathTick: -1,
      signature: genomeSignature(g),
    });
  }

  recordDeath(ref: number, tick: number): void {
    const n = this.nodes.get(ref);
    if (n !== undefined) n.deathTick = tick;
  }

  /** Drop dead subtrees (leaves up) until size <= maxNodes. Deterministic: dead leaves removed in
   *  (deathTick asc, ref asc) order; a node with any live descendant is never a removable leaf. */
  prune(maxNodes: number): void {
    while (this.nodes.size > maxNodes) {
      const childCount = new Map<number, number>();
      for (const n of this.nodes.values()) {
        if (n.parentRef >= 0) childCount.set(n.parentRef, (childCount.get(n.parentRef) ?? 0) + 1);
      }
      const deadLeaves: LineageNode[] = [];
      for (const n of this.nodes.values()) {
        if (n.deathTick >= 0 && (childCount.get(n.ref) ?? 0) === 0) deadLeaves.push(n);
      }
      if (deadLeaves.length === 0) break; // nothing prunable (rest all alive or have live descendants)
      deadLeaves.sort((a, b) => (a.deathTick - b.deathTick) || (a.ref - b.ref));
      let removed = 0;
      for (const n of deadLeaves) {
        if (this.nodes.size <= maxNodes) break;
        this.nodes.delete(n.ref);
        removed++;
      }
      if (removed === 0) break;
    }
  }

  /** All nodes, ascending by ref (deterministic order for display + serialization). */
  list(): LineageNode[] {
    return [...this.nodes.values()].sort((a, b) => a.ref - b.ref);
  }

  get size(): number {
    return this.nodes.size;
  }
}

export function serializeLineageLog(log: LineageLog): string {
  return JSON.stringify(log.list());
}
```

- [ ] **Step 4: Run the unit test** — `pnpm exec vitest run src/core/genome/lineage-log.test.ts`. Expected: PASS.

- [ ] **Step 5: Run full check** — `make check`. Expected: green.

- [ ] **Step 6: Commit** — `git add -A && git commit --no-verify -m "feat(M7): LineageLog phylogeny structure (lazy roots, leaves-up prune, serialize)"`.

---

### Task B5: Wire LineageLog into World + extend the determinism test

Record births at reproduction and deaths at organism death, prune at cadence, and prove the log is byte-deterministic across two runs.

**Files:**
- Modify: `src/core/organism/reproduction.ts` (optional `bornRefs` out-collection)
- Modify: `src/core/organism/organism-death.ts` (optional `deadRefs` out-collection)
- Modify: `src/core/sim/world.ts` (own `lineage`; drain born/dead refs; prune at cadence; pass tick to death)
- Modify: `src/core/sim/config.ts` (add `maxLineageNodes` knob, default 4000)
- Modify: `src/core/sim/reproducibility.test.ts` (extend the M7 block to hash the lineage log)

**Interfaces:**
- Consumes: `LineageLog` (B4); `World.tickCount`, `World.genomes`.
- Produces: `World.lineage: LineageLog` (public readonly); `config.maxLineageNodes: number`.

- [ ] **Step 1: Extend the reproduction out-collection.** In `src/core/organism/reproduction.ts`, widen the `out` param type (line 47) and push committed child refs. Make the field OPTIONAL so existing callers are unaffected:

```ts
  out: { births: number; bornRefs?: number[] },
```
  After `organisms.birthTick[newOrg] = params.tick;` (line 97), add:

```ts
    if (out.bornRefs !== undefined) out.bornRefs.push(childRef);
```

- [ ] **Step 2: Extend the death out-collection.** In `src/core/organism/organism-death.ts`, widen the `out` param type (line 30):

```ts
  out: { deaths: number; deadRefs?: number[] },
```
  In the free loop (lines 79-85), capture the freed ref:

```ts
    if (dying[org] === 1) {
      const ref = organisms.genomeRef[org]!;
      if (ref >= 0) {
        store.free(ref);
        if (out.deadRefs !== undefined) out.deadRefs.push(ref);
      }
      organisms.free(org);
    }
```

- [ ] **Step 3: Add the `maxLineageNodes` config knob.** In `src/core/sim/config.ts`, declare it next to `metricsEvolutionInterval` (~line 162) and default it (~line 264):

```ts
  /** Cap on phylogeny LineageLog nodes; dead subtrees are pruned (leaves-up) beyond this. */
  maxLineageNodes: number;
```
```ts
    maxLineageNodes: 4000,
```

- [ ] **Step 4: Own + drain the log in `World`.** In `src/core/sim/world.ts`:
  - Import: `import { LineageLog } from '../genome/lineage-log';`
  - Field: `readonly lineage: LineageLog;`
  - Constructor, right after `this.genomes = new GenomeStore();` (~line 120): `this.lineage = new LineageLog(this.genomes);`
  - The private `reproOut` / `deathOut` objects (ctor ~67-68): give each its ref array, e.g. `this.reproOut = { births: 0, bornRefs: [] };` and `this.deathOut = { deaths: 0, deadRefs: [] };` (match however they are currently initialised — add the array field).
  - In `tick()`, BEFORE the death call, clear: `this.deathOut.deadRefs!.length = 0;` and pass `this.tickCount` so death can be recorded with the current tick. After `killStarvedOrganisms(...)` returns, drain: `for (const ref of this.deathOut.deadRefs!) this.lineage.recordDeath(ref, this.tickCount);`
  - Similarly, before the reproduce call clear `this.reproOut.bornRefs!.length = 0;`; after `reproduceOrganisms(...)` returns, drain: `for (const ref of this.reproOut.bornRefs!) this.lineage.recordBirth(ref, this.tickCount);`
  - In the cadence block (the same `if (this.tickCount % cfg.metricsEvolutionInterval === 0)` that holds `sampleEvolutionMetrics` + `sampleLineages` from B2), add: `this.lineage.prune(cfg.maxLineageNodes);`

  NOTE: `killStarvedOrganisms`'s signature does not currently take `tick`; it does not need it — the world records deaths from the drained `deadRefs` using `this.tickCount`. Do NOT thread a tick param through the death function; keep the recording in the world drain loop.

- [ ] **Step 5: Extend the determinism test.** In `src/core/sim/reproducibility.test.ts`, in the `describe('reproducibility — M7 mutation>0 with births AND deaths')` block, import `serializeLineageLog` and add two assertions after the existing `serializeGenomeLibrary` compare (~line 264):

```ts
    expect(serializeLineageLog(a.w.lineage)).toBe(serializeLineageLog(b.w.lineage));
    expect(a.w.lineage.size).toBeGreaterThan(0); // non-vacuity: the run actually populated the log
```
  Add `import { serializeLineageLog } from '../genome/lineage-log';` at the top of the test file.

- [ ] **Step 6: Run the determinism test + full check** — `pnpm exec vitest run src/core/sim/reproducibility.test.ts` (expect PASS, both runs byte-identical log), then `make check`. Expected: all green.

- [ ] **Step 7: Commit** — `git add -A && git commit --no-verify -m "feat(M7): wire LineageLog into world (record births/deaths, prune at cadence) + determinism hash"`.

---

### Task B6: Phylogeny panel (key Y)

An indented text tree of the live phylogeny: each founder root, then descendants indented by generation, annotated with ref, generation, signature, alive/dead. Empty state when the log is empty. Bounded output (cap printed rows).

**Files:**
- Create: `src/app/phylogeny-panel.ts` (pure formatter + thin render)
- Modify: `index.html` (panel `<div>`)
- Modify: `src/app/main.ts` (element, `showPhylo` flag, key `Y`, gated render)
- Test: `src/app/phylogeny-panel.test.ts` (create — tests the pure formatter)

**Interfaces:**
- Consumes: `LineageNode[]` (`world.lineage.list()`), `World.tickCount`.
- Produces: `function formatPhylogeny(nodes: LineageNode[], maxRows?: number): string[]`; `function renderPhylogeny(world: World, panel: HTMLElement): void`.

- [ ] **Step 1: Write the failing test** — `src/app/phylogeny-panel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatPhylogeny } from './phylogeny-panel';
import { type LineageNode } from '../core/genome/lineage-log';

function node(over: Partial<LineageNode>): LineageNode {
  return { ref: 0, parentRef: -1, generation: 0, founderId: 0, birthTick: 0, deathTick: -1,
    signature: '1p', ...over };
}

describe('formatPhylogeny', () => {
  it('shows an empty state when there are no nodes', () => {
    expect(formatPhylogeny([]).join('\n')).toMatch(/no lineages/i);
  });

  it('renders roots first, children indented under their parent, with alive/dead markers', () => {
    const nodes: LineageNode[] = [
      node({ ref: 0, parentRef: -1, generation: 0 }),
      node({ ref: 1, parentRef: 0, generation: 1 }),
      node({ ref: 2, parentRef: 1, generation: 2, deathTick: 99 }),
    ];
    const lines = formatPhylogeny(nodes);
    const text = lines.join('\n');
    expect(text).toMatch(/PHYLOGENY/i);
    // child rows are more indented than their parents
    const l0 = lines.find((l) => l.includes('#0'))!;
    const l1 = lines.find((l) => l.includes('#1'))!;
    const l2 = lines.find((l) => l.includes('#2'))!;
    const indent = (s: string) => s.length - s.trimStart().length;
    expect(indent(l1)).toBeGreaterThan(indent(l0));
    expect(indent(l2)).toBeGreaterThan(indent(l1));
    expect(l2).toMatch(/dead|✝|†/i); // dead marker on ref 2
  });

  it('caps the number of printed rows', () => {
    const nodes: LineageNode[] = [];
    for (let i = 0; i < 50; i++) nodes.push(node({ ref: i, parentRef: i === 0 ? -1 : 0, generation: i === 0 ? 0 : 1 }));
    const lines = formatPhylogeny(nodes, 10);
    expect(lines.length).toBeLessThanOrEqual(12); // header + cap + possible truncation note
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** — `pnpm exec vitest run src/app/phylogeny-panel.test.ts`. Expected: FAIL (no module).

- [ ] **Step 3: Implement `src/app/phylogeny-panel.ts`:**

```ts
import { type World } from '../core/sim/world';
import { type LineageNode } from '../core/genome/lineage-log';

/** Pure: render the lineage nodes as an indented text tree (roots first, children under parents). */
export function formatPhylogeny(nodes: LineageNode[], maxRows = 40): string[] {
  const lines: string[] = ['PHYLOGENY — live lineage tree (Y)'];
  if (nodes.length === 0) {
    lines.push('  no lineages yet');
    return lines;
  }
  // Build child adjacency (nodes already arrive ref-sorted from log.list()).
  const children = new Map<number, LineageNode[]>();
  const roots: LineageNode[] = [];
  for (const n of nodes) {
    if (n.parentRef < 0) roots.push(n);
    else {
      const arr = children.get(n.parentRef);
      if (arr !== undefined) arr.push(n);
      else children.set(n.parentRef, [n]);
    }
  }
  let printed = 0;
  let truncated = false;
  const walk = (n: LineageNode, depth: number): void => {
    if (printed >= maxRows) {
      truncated = true;
      return;
    }
    const pad = '  '.repeat(depth + 1);
    const status = n.deathTick >= 0 ? '†' : '·';
    lines.push(`${pad}${status} #${n.ref} g${n.generation} [${n.signature}]`);
    printed++;
    for (const c of children.get(n.ref) ?? []) {
      if (printed >= maxRows) {
        truncated = true;
        break;
      }
      walk(c, depth + 1);
    }
  };
  for (const r of roots) {
    if (printed >= maxRows) {
      truncated = true;
      break;
    }
    walk(r, 0);
  }
  if (truncated) lines.push(`  … (${nodes.length} nodes total)`);
  return lines;
}

/** Render the live phylogeny tree into the panel element (read-only). */
export function renderPhylogeny(world: World, panel: HTMLElement): void {
  panel.textContent = formatPhylogeny(world.lineage.list()).join('\n');
}
```

- [ ] **Step 4: Run the formatter test** — `pnpm exec vitest run src/app/phylogeny-panel.test.ts`. Expected: PASS.

- [ ] **Step 5: Add the panel `<div>` to `index.html`** (sibling of the others, non-overlapping position):

```html
    <div id="phylogeny" class="panel hidden" style="right: 12px; top: 12px; max-height: 60vh; overflow: auto;"></div>
```

- [ ] **Step 6: Wire the toggle + render in `src/app/main.ts`:**
  - Import: `import { renderPhylogeny } from './phylogeny-panel';`
  - Grab + flag (near the other panels): `const phyloPanel = document.getElementById('phylogeny') as HTMLElement; let showPhylo = false;`
  - keydown (after the `J` branch from B3):

```ts
    } else if (e.key === 'y' || e.key === 'Y') {
      showPhylo = !showPhylo;
      phyloPanel.classList.toggle('hidden', !showPhylo);
```
  - `drawScene` (after the hall-of-fame render from B3):

```ts
    if (showPhylo) renderPhylogeny(world, phyloPanel);
```

- [ ] **Step 7: Run full check** — `make check`. Expected: green.

- [ ] **Step 8: Visual verify (Playwright)** — press `Y`, confirm the tree renders (roots → indented descendants, `†` on dead nodes), toggles off. Screenshot to SDD artifacts.

- [ ] **Step 9: Commit** — `git add -A && git commit --no-verify -m "feat(M7): phylogeny panel (Y) — indented live lineage tree"`.

---

## Phase 5 — Species / Menagerie

### Task B7: Genetic distance function (pure)

A pure genetic-distance metric for clustering genomes into species. **Composition-based, not innovation-keyed** — see the Global Constraints note on why innovation matching is degenerate here.

**Files:**
- Create: `src/core/genome/distance.ts`
- Test: `src/core/genome/distance.test.ts` (create)

**Interfaces:**
- Consumes: `genomeTraits` (from `./traits`), `Genome.connectionRules`.
- Produces: `function genomeDistance(a: Genome, b: Genome): number`; exported `SPECIES_THRESHOLD = 1.0`.

- [ ] **Step 1: Write the failing test** — `src/core/genome/distance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { genomeDistance, SPECIES_THRESHOLD } from './distance';
import { buildForagerGenome } from './critter-genome';
import { cloneGenome } from './genome';
import { CellType } from '../cells/types';

describe('genomeDistance', () => {
  it('is zero between a genome and its identical clone', () => {
    const a = buildForagerGenome(6);
    expect(genomeDistance(a, cloneGenome(a))).toBe(0);
  });

  it('grows with a connection-weight difference (behavioral drift)', () => {
    const a = buildForagerGenome(6);
    const b = cloneGenome(a);
    b.connectionRules[0]!.weight += 2.0;
    const d = genomeDistance(a, b);
    expect(d).toBeGreaterThan(0);
    // small weight drift alone stays within the same species
    expect(d).toBeLessThan(SPECIES_THRESHOLD);
  });

  it('is sensitive to a changeType morph (per-type composition differs)', () => {
    const a = buildForagerGenome(6);
    const b = cloneGenome(a);
    // flip a DIGESTIVE gene to PHOTO — a structural/morphological change
    const dig = b.genes.findIndex((g) => g.cellType === CellType.DIGESTIVE);
    b.genes[dig]!.cellType = CellType.PHOTO;
    expect(genomeDistance(a, b)).toBeGreaterThan(genomeDistance(a, cloneGenome(a)));
  });

  it('is symmetric', () => {
    const a = buildForagerGenome(6);
    const b = cloneGenome(a);
    b.connectionRules[1]!.weight -= 0.7;
    expect(genomeDistance(a, b)).toBeCloseTo(genomeDistance(b, a), 12);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** — `pnpm exec vitest run src/core/genome/distance.test.ts`. Expected: FAIL (no module).

- [ ] **Step 3: Implement `src/core/genome/distance.ts`:**

```ts
import { type Genome } from './genome';
import { genomeTraits } from './traits';

const C1 = 1.0; // weight on structural/morphological disjointness (per-type + rule-count diffs)
const C2 = 0.4; // weight on mean connection-weight difference (behavioral)

/** Speciation cutoff: genomes with distance < this join the same species (greedy clustering). */
export const SPECIES_THRESHOLD = 1.0;

/**
 * Genetic distance for speciation (M7 §5, Plan B Phase 5). δ = C1·(composition disjointness)/N +
 * C2·(mean |Δweight|). Composition disjointness = Σ over the 7 cell types of |countA − countB|,
 * plus |ΔconnectionCount| + |ΔmotorCount| — this captures exactly the morphological axes that
 * genotypicDiversity (genomeSignature) buckets, so changeType/duplicate/add/delete morphs land in
 * distinct species. The weight term is index-aligned over the shared connection-rule prefix. PURE:
 * no develop(), no RNG, no SoA. NOTE (design): NEAT-style innovation-id matching is degenerate in
 * this codebase because founder genes are all innovation 0 — composition matching is the correct
 * substitute (see plan Global Constraints).
 */
export function genomeDistance(a: Genome, b: Genome): number {
  const ta = genomeTraits(a);
  const tb = genomeTraits(b);
  const comp =
    Math.abs(ta.photoGenes - tb.photoGenes) +
    Math.abs(ta.digestiveGenes - tb.digestiveGenes) +
    Math.abs(ta.sensorGenes - tb.sensorGenes) +
    Math.abs(ta.neuronGenes - tb.neuronGenes) +
    Math.abs(ta.moverGenes - tb.moverGenes) +
    Math.abs(ta.meatGenes - tb.meatGenes) +
    Math.abs(ta.motileGenes - tb.motileGenes) +
    Math.abs(ta.connectionCount - tb.connectionCount) +
    Math.abs(ta.motorCount - tb.motorCount);
  const n = Math.max(ta.geneCount, tb.geneCount, 1);
  const m = Math.min(a.connectionRules.length, b.connectionRules.length);
  let wsum = 0;
  for (let i = 0; i < m; i++) wsum += Math.abs(a.connectionRules[i]!.weight - b.connectionRules[i]!.weight);
  const wbar = m > 0 ? wsum / m : 0;
  return C1 * (comp / n) + C2 * wbar;
}
```

- [ ] **Step 4: Run the unit test** — `pnpm exec vitest run src/core/genome/distance.test.ts`. Expected: PASS.

- [ ] **Step 5: Run full check** — `make check`. Expected: green.

- [ ] **Step 6: Commit** — `git add -A && git commit --no-verify -m "feat(M7): composition-based genome distance for speciation (innovation-id degeneracy noted)"`.

---

### Task B8: Greedy speciation into a species board

Cluster the live genome population into species by greedy first-match assignment under `genomeDistance`, recompute fresh each sample, expose the board on the world + `sim.species()`.

**Files:**
- Create: `src/core/sim/species-board.ts`
- Modify: `src/core/sim/world.ts` (own `speciesBoard`; sample at cadence)
- Modify: `src/app/main.ts` (`SimHandle.species()`)
- Test: `src/core/sim/species-board.test.ts` (create)

**Interfaces:**
- Consumes: `genomeDistance`, `SPECIES_THRESHOLD` (B7); `OrganismTable`; `GenomeStore`.
- Produces:
  - `interface SpeciesSummary { speciesId: number; liveCount: number; representativeRef: number; }`
  - `function sampleSpecies(organisms, genomes, threshold?: number): SpeciesSummary[]`
  - `World.speciesBoard: readonly SpeciesSummary[]` (public, default `[]`)
  - `SimHandle.species(): SpeciesSummary[]`

- [ ] **Step 1: Write the failing test** — `src/core/sim/species-board.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { develop } from '../genome/develop';
import { buildForagerGenome } from '../genome/critter-genome';
import { instantiateBody } from '../organism/instantiate';
import { CellType } from '../cells/types';
import { sampleSpecies } from './species-board';
import { type Genome } from '../genome/genome';

function spawn(w: World, g: Genome, x: number, y: number): void {
  const cfg = w.config;
  const ref = w.genomes.register(g);
  const body = develop(g, cfg.maxCellsPerOrganism, cfg.maxRecursionDepth);
  instantiateBody(body, w.cells, w.net, w.bonds, w.organisms, ref, x, y, 0,
    cfg.worldWidth, cfg.worldHeight, w.instantiateScratch);
}

describe('sampleSpecies', () => {
  it('groups identical-morphology foragers into ONE species', () => {
    const cfg = defaultConfig({ seed: 1, maxCells: 4000, worldWidth: 256, worldHeight: 256,
      initialPhotoFraction: 1, initialMotileFraction: 0 });
    const w = new World(cfg, false);
    w.seedLife(300);
    for (let i = 0; i < 4; i++) spawn(w, buildForagerGenome(cfg.cellRadius, 100), 40 + i * 40, 80);
    w.tick();
    const board = sampleSpecies(w.organisms, w.genomes);
    expect(board.length).toBe(1);
    expect(board[0]!.liveCount).toBe(4);
  });

  it('splits a morphologically distinct variant into a second species', () => {
    const cfg = defaultConfig({ seed: 1, maxCells: 4000, worldWidth: 256, worldHeight: 256,
      initialPhotoFraction: 1, initialMotileFraction: 0 });
    const w = new World(cfg, false);
    w.seedLife(300);
    spawn(w, buildForagerGenome(cfg.cellRadius, 100), 60, 60);
    spawn(w, buildForagerGenome(cfg.cellRadius, 100), 100, 60);
    // a variant: flip several genes to PHOTO so composition is far from the forager
    const variant = buildForagerGenome(cfg.cellRadius, 100);
    for (const g of variant.genes) g.cellType = CellType.PHOTO;
    spawn(w, variant, 160, 120);
    w.tick();
    const board = sampleSpecies(w.organisms, w.genomes);
    expect(board.length).toBe(2);
    // ranked by liveCount desc → the 2-member forager species first
    expect(board[0]!.liveCount).toBe(2);
    expect(board[1]!.liveCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** — `pnpm exec vitest run src/core/sim/species-board.test.ts`. Expected: FAIL (no module).

- [ ] **Step 3: Implement `src/core/sim/species-board.ts`:**

```ts
import { type OrganismTable } from '../organism/organisms';
import { type GenomeStore, type Genome } from '../genome/genome';
import { genomeDistance, SPECIES_THRESHOLD } from '../genome/distance';

/** One species: a greedy cluster of live genomes within SPECIES_THRESHOLD of its representative. */
export interface SpeciesSummary {
  speciesId: number;
  liveCount: number;
  representativeRef: number;
}

/**
 * Greedy speciation of the live genome population (M7 §5, Plan B Phase 5). Scans organisms in
 * ascending id; each genome joins the first existing species whose representative is within
 * `threshold`, else founds a new species (becoming its representative). Recomputed fresh each call
 * (species ids are not stable across samples). Read-only telemetry; deterministic (ascending scan +
 * first-match). Ranked by member count desc, tie-break representativeRef asc.
 */
export function sampleSpecies(
  organisms: OrganismTable,
  genomes: GenomeStore,
  threshold = SPECIES_THRESHOLD,
): SpeciesSummary[] {
  const reps: { genome: Genome; ref: number; count: number }[] = [];
  for (let org = 1; org < organisms.maxOrganisms; org++) {
    if (!organisms.isAlive(org) || organisms.cellCount[org]! === 0) continue;
    const ref = organisms.genomeRef[org]!;
    if (ref < 0) continue;
    const g = genomes.get(ref);
    if (g === undefined) continue;
    let placed = false;
    for (const s of reps) {
      if (genomeDistance(g, s.genome) < threshold) {
        s.count++;
        placed = true;
        break;
      }
    }
    if (!placed) reps.push({ genome: g, ref, count: 1 });
  }
  reps.sort((a, b) => (b.count - a.count) || (a.ref - b.ref));
  return reps.map((s, i) => ({ speciesId: i, liveCount: s.count, representativeRef: s.ref }));
}
```

- [ ] **Step 4: Run the unit test** — `pnpm exec vitest run src/core/sim/species-board.test.ts`. Expected: PASS.

- [ ] **Step 5: Wire into `World`.** In `src/core/sim/world.ts`:
  - Import: `import { sampleSpecies, type SpeciesSummary } from './species-board';`
  - Field: `speciesBoard: readonly SpeciesSummary[] = [];`
  - In the cadence block (alongside `sampleLineages` + `prune`): `this.speciesBoard = sampleSpecies(this.organisms, this.genomes);`

- [ ] **Step 6: Add `species()` to the `SimHandle`** (main.ts):

```ts
  species(): SpeciesSummary[];
```
```ts
  species: () => world.speciesBoard.slice(),
```
  Import `SpeciesSummary` from `../core/sim/species-board`.

- [ ] **Step 7: Run full check** — `make check`. Expected: green.

- [ ] **Step 8: Commit** — `git add -A && git commit --no-verify -m "feat(M7): greedy speciation species board + sim.species()"`.

---

### Task B9: Menagerie panel (key K)

A text panel listing the live species: id, member count, representative morphology signature + key traits. Empty state when no live genome organisms. Mirrors the genome-inspector pattern.

**Files:**
- Create: `src/app/menagerie-panel.ts` (pure formatter + thin render)
- Modify: `index.html` (panel `<div>`)
- Modify: `src/app/main.ts` (element, `showMenagerie` flag, key `K`, gated render)
- Test: `src/app/menagerie-panel.test.ts` (create — tests the pure formatter)

**Interfaces:**
- Consumes: `SpeciesSummary[]` (B8); `GenomeStore.get` + `genomeSignature`/`genomeTraits` (for the representative description); `World`.
- Produces: `function formatMenagerie(rows: { species: SpeciesSummary; signature: string; generation: number }[]): string[]`; `function renderMenagerie(world: World, panel: HTMLElement): void`.

- [ ] **Step 1: Write the failing test** — `src/app/menagerie-panel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatMenagerie } from './menagerie-panel';
import { type SpeciesSummary } from '../core/sim/species-board';

function row(species: SpeciesSummary, signature: string, generation: number) {
  return { species, signature, generation };
}

describe('formatMenagerie', () => {
  it('shows an empty state when there are no species', () => {
    expect(formatMenagerie([]).join('\n')).toMatch(/no species/i);
  });

  it('lists each species with member count and representative signature', () => {
    const rows = [
      row({ speciesId: 0, liveCount: 7, representativeRef: 3 }, '0p1d2s2n1m|2c1t', 4),
      row({ speciesId: 1, liveCount: 2, representativeRef: 9 }, '3p0d0s0n1m|0c1t', 1),
    ];
    const lines = formatMenagerie(rows);
    const text = lines.join('\n');
    expect(text).toMatch(/MENAGERIE/i);
    expect(text).toContain('7');               // member count
    expect(text).toContain('0p1d2s2n1m|2c1t'); // signature
    expect(text).toContain('g4');              // representative generation
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** — `pnpm exec vitest run src/app/menagerie-panel.test.ts`. Expected: FAIL (no module).

- [ ] **Step 3: Implement `src/app/menagerie-panel.ts`:**

```ts
import { type World } from '../core/sim/world';
import { type SpeciesSummary } from '../core/sim/species-board';
import { genomeSignature } from '../core/genome/traits';

interface MenagerieRow {
  species: SpeciesSummary;
  signature: string;
  generation: number;
}

/** Pure: format species rows into display lines (empty state first). */
export function formatMenagerie(rows: MenagerieRow[]): string[] {
  const lines: string[] = ['MENAGERIE — live species (K)'];
  if (rows.length === 0) {
    lines.push('  no species yet');
    return lines;
  }
  lines.push('  id   live   representative (signature, gen)');
  for (const r of rows) {
    const id = String(r.species.speciesId).padStart(4);
    const live = String(r.species.liveCount).padStart(6);
    lines.push(`  ${id} ${live}   [${r.signature}] g${r.generation}`);
  }
  return lines;
}

/** Render the live species board into the panel element (read-only). */
export function renderMenagerie(world: World, panel: HTMLElement): void {
  const rows: MenagerieRow[] = [];
  for (const species of world.speciesBoard) {
    const g = world.genomes.get(species.representativeRef);
    rows.push({
      species,
      signature: g !== undefined ? genomeSignature(g) : '?',
      generation: g !== undefined ? g.generation : 0,
    });
  }
  panel.textContent = formatMenagerie(rows).join('\n');
}
```

- [ ] **Step 4: Run the formatter test** — `pnpm exec vitest run src/app/menagerie-panel.test.ts`. Expected: PASS.

- [ ] **Step 5: Add the panel `<div>` to `index.html`** (sibling, non-overlapping):

```html
    <div id="menagerie" class="panel hidden" style="right: 12px; bottom: 12px;"></div>
```

- [ ] **Step 6: Wire the toggle + render in `src/app/main.ts`:**
  - Import: `import { renderMenagerie } from './menagerie-panel';`
  - Grab + flag: `const menagPanel = document.getElementById('menagerie') as HTMLElement; let showMenag = false;`
  - keydown (after the `Y` branch):

```ts
    } else if (e.key === 'k' || e.key === 'K') {
      showMenag = !showMenag;
      menagPanel.classList.toggle('hidden', !showMenag);
```
  - `drawScene` (after the phylogeny render):

```ts
    if (showMenag) renderMenagerie(world, menagPanel);
```

- [ ] **Step 7: Run full check** — `make check`. Expected: green.

- [ ] **Step 8: Visual verify (Playwright)** — press `K`, confirm the species list renders (or empty state early), toggles off; confirm `J`/`Y`/`K` panels coexist without overlap. Screenshot to SDD artifacts.

- [ ] **Step 9: Commit** — `git add -A && git commit --no-verify -m "feat(M7): menagerie panel (K) — live species board"`.

---

## Self-Review (controller checklist, run after writing — not a subagent dispatch)

**Spec coverage:** Phase 3 (champion) = B1+B2+B3 ✓; Phase 4 (phylogeny) = B4+B5+B6 ✓; Phase 5 (species) = B7+B8+B9 ✓. Determinism extension (hash lineage log) = B5 Step 5 ✓. Founder ids deterministic = B1 ✓. All panels read-only, empty-state-first = B3/B6/B9 ✓.

**Type consistency:** `LineageSummary`/`LineageStat` defined B2, consumed B3 ✓. `LineageNode`/`LineageLog`/`serializeLineageLog` defined B4, consumed B5+B6 ✓. `genomeDistance`/`SPECIES_THRESHOLD` defined B7, consumed B8 ✓. `SpeciesSummary`/`sampleSpecies` defined B8, consumed B9 ✓. `World.lineageBoard` (B2), `World.lineage` (B5), `World.speciesBoard` (B8) — distinct fields, no collision. `founderId` field name consistent throughout.

**Cardinal-rule audit:** No task adds a sim-side branch on founderId/lineage/species. `spawnChampion` is a manual console spawn (mirrors `sim.spawnCritter`), not a survival mechanism. Boards/log are written by sampling/recording and never read back into energy/reproduction/death. ✓

**Known design deviation (flag for Josh):** B7 replaces the spec's innovation-id NEAT matching with composition-based distance because founder genes are all `innovation: 0`. Documented in Global Constraints + the distance.ts docstring + the uncertainties list.

**Placeholder scan:** every code step contains complete code; every run step names the exact command + expected result. No TBD/TODO. ✓
