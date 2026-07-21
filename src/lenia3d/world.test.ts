/**
 * Lenia 3D core tests. The deterministic-core contract: a world is a pure function of (config,
 * seed), so two worlds with the same seed must reach identical state. Plus liveness (the world
 * doesn't extinct immediately) and numerical sanity (no NaN blow-ups from the Lenia dynamics).
 */
import { describe, it, expect } from 'vitest';
import { World, defaultLeniaConfig } from './world';
import { G, GENE_COUNT } from './genome';

/** A compact digest of world state — used to prove two runs match tick-for-tick. */
function digest(w: World): string {
  let h = `${w.tick}:${w.creatures.length}:${w.totalBirths}:${w.totalDeaths}`;
  for (const c of w.creatures) {
    h += `|${c.id}:${c.gen}:${c.energy.toFixed(3)}`;
    for (let i = 0; i < c.n; i++) {
      h += `,${c.px[i]!.toFixed(2)}:${c.py[i]!.toFixed(2)}:${c.pz[i]!.toFixed(2)}`;
    }
    for (let g = 0; g < GENE_COUNT; g++) h += `;${c.genes[g]!.toFixed(3)}`;
  }
  return h;
}

const cfg = defaultLeniaConfig({ seed: 42 });

describe('Lenia 3D world', () => {
  it('is deterministic: same seed → identical state after N ticks', () => {
    const a = new World(defaultLeniaConfig({ seed: 42 }));
    const b = new World(defaultLeniaConfig({ seed: 42 }));
    for (let i = 0; i < 200; i++) {
      a.step();
      b.step();
    }
    expect(digest(a)).toBe(digest(b));
  });

  it('stays alive and reproduces over 600 ticks', () => {
    const w = new World(cfg);
    for (let i = 0; i < 600; i++) w.step();
    expect(w.creatures.length).toBeGreaterThan(0);
    expect(w.totalBirths).toBeGreaterThan(0);
  });

  it('never produces non-finite positions (no Lenia blow-up)', () => {
    const w = new World(cfg);
    for (let i = 0; i < 400; i++) w.step();
    for (const c of w.creatures) {
      expect(Number.isFinite(c.cx)).toBe(true);
      for (let i = 0; i < c.n; i++) {
        expect(Number.isFinite(c.px[i]!)).toBe(true);
        expect(Number.isFinite(c.py[i]!)).toBe(true);
        expect(Number.isFinite(c.pz[i]!)).toBe(true);
      }
      expect(Number.isFinite(c.energy)).toBe(true);
    }
  });

  it('respects the max-creatures ceiling', () => {
    const w = new World(cfg);
    for (let i = 0; i < 1000; i++) w.step();
    expect(w.creatures.length).toBeLessThanOrEqual(cfg.maxCreatures);
  });

  it('seeds creatures with valid, in-range genomes', () => {
    const w = new World(cfg);
    expect(w.creatures.length).toBe(cfg.initialCreatures);
    for (const c of w.creatures) {
      expect(c.n).toBeGreaterThanOrEqual(6);
      expect(c.n).toBeLessThanOrEqual(28);
      expect(c.genes[G.HUE]!).toBeGreaterThanOrEqual(0);
      expect(c.genes[G.HUE]!).toBeLessThan(1);
      expect(c.genes[G.MU_K]!).toBeGreaterThan(0);
    }
  });
});
