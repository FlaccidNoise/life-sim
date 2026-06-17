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

describe('sampleLineages', () => {
  it('buckets live organisms by founderId, ranks by liveCount, tracks peak + firstTick', () => {
    const cfg = defaultConfig({
      seed: 1,
      maxCells: 4000,
      worldWidth: 256,
      worldHeight: 256,
      initialPhotoFraction: 1,
      initialMotileFraction: 0,
    });
    const w = new World(cfg, false);
    w.seedLife(400);
    spawnFounder(w, 60, 60); // founderId 0
    spawnFounder(w, 180, 60); // founderId 1
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
    const cfg = defaultConfig({
      seed: 1,
      maxCells: 4000,
      worldWidth: 256,
      worldHeight: 256,
      initialPhotoFraction: 1,
      initialMotileFraction: 0,
    });
    const w = new World(cfg, false);
    w.seedLife(400);
    spawnFounder(w, 60, 60); // founderId 0
    w.tick();

    // Share ONE stats Map across two samples at ticks 10 then 20.
    const stats = new Map<number, LineageStat>();
    const first = sampleLineages(w.organisms, w.genomes, stats, 10, 8);
    const a0 = first.find((s) => s.founderId === 0)!;
    expect(a0.firstTick).toBe(10);
    expect(a0.peakCount).toBe(1);

    // A second, DISTINCT founder lineage appears before the next sample.
    spawnFounder(w, 180, 180); // founderId 1
    w.tick();

    const second = sampleLineages(w.organisms, w.genomes, stats, 20, 8);
    const b0 = second.find((s) => s.founderId === 0)!;
    // firstTick is pinned to the earliest sample that saw founder 0, not the later one.
    expect(b0.firstTick).toBe(10);
    // peakCount never decreases across samples.
    expect(b0.peakCount).toBeGreaterThanOrEqual(a0.peakCount);
    expect(b0.peakCount).toBeGreaterThanOrEqual(1);
  });

  it('returns at most k entries', () => {
    const cfg = defaultConfig({
      seed: 1,
      maxCells: 4000,
      worldWidth: 256,
      worldHeight: 256,
      initialPhotoFraction: 1,
      initialMotileFraction: 0,
    });
    const w = new World(cfg, false);
    w.seedLife(400);
    for (let i = 0; i < 5; i++) spawnFounder(w, 40 + i * 30, 60);
    w.tick();
    const board = sampleLineages(w.organisms, w.genomes, new Map(), 1, 3);
    expect(board.length).toBe(3);
  });
});
