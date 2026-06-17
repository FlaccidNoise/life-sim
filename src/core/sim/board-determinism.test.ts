import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { develop } from '../genome/develop';
import { buildForagerGenome } from '../genome/critter-genome';
import { instantiateBody } from '../organism/instantiate';
import { sampleLineages, type LineageStat } from './lineage-board';
import { sampleSpecies } from './species-board';

// The M7 telemetry boards (J hall-of-fame, K menagerie) must be a PURE function of world state:
// identical world state → identical board, and the ordering must come from total-order sorts, not
// from Map-iteration/traversal accident. This guards the boards against a future refactor (e.g.
// swapping a Map for another container) silently introducing non-deterministic row ordering.

function spawnFounder(w: World, x: number, y: number): void {
  const cfg = w.config;
  const g = buildForagerGenome(cfg.cellRadius, 100);
  const ref = w.genomes.register(g);
  const body = develop(g, cfg.maxCellsPerOrganism, cfg.maxRecursionDepth);
  instantiateBody(
    body,
    w.cells,
    w.net,
    w.bonds,
    w.organisms,
    ref,
    x,
    y,
    0,
    cfg.worldWidth,
    cfg.worldHeight,
    w.instantiateScratch,
  );
}

function runWorld(seed: number): World {
  const w = new World(
    defaultConfig({
      seed,
      maxCells: 4000,
      worldWidth: 512,
      worldHeight: 512,
      initialPhotoFraction: 1,
      initialMotileFraction: 0,
      reproThreshold: 700,
      reproParentFloor: 120,
      organismDeathFloor: 0,
      mutationWeightRate: 0.5,
      mutationWeightSigma: 0.15,
      mutationParamRate: 0.2,
      mutationParamSigma: 0.1,
      mutationChangeTypeRate: 0.05, // exercise speciation: changeType diverges body plans
    }),
    false,
  );
  w.seedLife(1500);
  for (let k = 0; k < 12; k++) spawnFounder(w, 40 + k * 35, 256);
  for (let t = 0; t < 300; t++) w.tick();
  return w;
}

describe('board determinism — sampleLineages / sampleSpecies are a pure function of world state', () => {
  it('two byte-identical worlds yield deep-equal lineage AND species boards', () => {
    const a = runWorld(5);
    const b = runWorld(5);
    // Non-vacuity: the run actually produced a populated, multi-row board (else the equality is trivial).
    const la = sampleLineages(a.organisms, a.genomes, new Map<number, LineageStat>(), 300, 16);
    const lb = sampleLineages(b.organisms, b.genomes, new Map<number, LineageStat>(), 300, 16);
    expect(la.length).toBeGreaterThan(1);
    expect(la).toEqual(lb);

    const sa = sampleSpecies(a.organisms, a.genomes);
    const sb = sampleSpecies(b.organisms, b.genomes);
    expect(sa.length).toBeGreaterThan(0);
    expect(sa).toEqual(sb);
  }, 20000);

  it('lineage board rows are totally ordered (count desc, then founderId asc) — no Map-order ties', () => {
    const w = runWorld(5);
    const board = sampleLineages(w.organisms, w.genomes, new Map<number, LineageStat>(), 300, 16);
    for (let i = 1; i < board.length; i++) {
      const prev = board[i - 1]!;
      const cur = board[i]!;
      const ordered =
        prev.liveCount > cur.liveCount ||
        (prev.liveCount === cur.liveCount && prev.founderId < cur.founderId);
      expect(ordered).toBe(true);
    }
  }, 20000);

  it('species board rows are totally ordered (count desc, then representativeRef asc)', () => {
    const w = runWorld(5);
    const board = sampleSpecies(w.organisms, w.genomes);
    for (let i = 1; i < board.length; i++) {
      const prev = board[i - 1]!;
      const cur = board[i]!;
      const ordered =
        prev.liveCount > cur.liveCount ||
        (prev.liveCount === cur.liveCount && prev.representativeRef < cur.representativeRef);
      expect(ordered).toBe(true);
    }
  }, 20000);
});
