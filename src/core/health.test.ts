import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { scanHealth } from './health';
import { SCALAR_GENE_COUNT, ScalarGene, BRAIN_GENES } from './genome';

/** A small, fast world that still births/dies so the scan runs over real evolved state. */
function smallWorld(): World {
  return new World(
    defaultConfig({ seed: 1, worldWidth: 512, worldHeight: 512, initialPopulation: 60 }),
  );
}

describe('scanHealth', () => {
  it('reports a clean bill of health for a freshly seeded world', () => {
    const w = smallWorld();
    const r = scanHealth(w);
    expect(r.ok).toBe(true);
    expect(r.violationCount).toBe(0);
    expect(r.population).toBe(w.population);
    expect(r.population).toBeGreaterThan(0);
  });

  it('stays clean while the world evolves (no NaN/oob/bad-gene leaks over a run)', () => {
    const w = smallWorld();
    for (let t = 0; t < 800; t++) {
      w.step();
      if (t % 100 === 0) {
        const r = scanHealth(w);
        expect(r.ok, `violation at tick ${w.tick}: ${JSON.stringify(r.violations[0])}`).toBe(true);
      }
    }
  });

  it('summary stats are finite and ordered (min ≤ mean ≤ max) over a live population', () => {
    const w = smallWorld();
    for (let t = 0; t < 50; t++) w.step();
    const r = scanHealth(w);
    expect(Number.isFinite(r.energy.mean)).toBe(true);
    expect(r.energy.min).toBeLessThanOrEqual(r.energy.mean);
    expect(r.energy.mean).toBeLessThanOrEqual(r.energy.max);
    expect(r.speed.min).toBeLessThanOrEqual(r.speed.mean);
    expect(r.speed.mean).toBeLessThanOrEqual(r.speed.max);
    expect(r.energy.total).toBeCloseTo(r.energy.mean * r.population, 4);
  });

  it('catches a non-finite kinematic field', () => {
    const w = smallWorld();
    const i = w.store.liveIndices[0]!;
    w.store.vx[i] = NaN;
    const r = scanHealth(w);
    expect(r.ok).toBe(false);
    expect(r.byKind.nonfinite).toBeGreaterThanOrEqual(1);
    expect(r.violations.some((v) => v.slot === i && v.field === 'vx')).toBe(true);
  });

  it('catches an out-of-bounds position', () => {
    const w = smallWorld();
    const i = w.store.liveIndices[0]!;
    w.store.x[i] = w.config.worldWidth + 10;
    const r = scanHealth(w);
    expect(r.byKind.oob).toBe(1);
    expect(r.violations.some((v) => v.kind === 'oob' && v.slot === i)).toBe(true);
  });

  it('catches non-positive energy on a live creature', () => {
    const w = smallWorld();
    const i = w.store.liveIndices[0]!;
    w.store.energy[i] = 0;
    const r = scanHealth(w);
    expect(r.byKind.energy).toBe(1);
  });

  it('catches a scalar gene outside its hard clamp range', () => {
    const w = smallWorld();
    const i = w.store.liveIndices[0]!;
    w.store.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET] = 5; // diet max is 1
    const r = scanHealth(w);
    expect(r.byKind.gene).toBe(1);
    expect(r.violations.some((v) => v.kind === 'gene' && v.field.includes('diet'))).toBe(true);
  });

  it('catches a non-finite brain weight', () => {
    const w = smallWorld();
    const i = w.store.liveIndices[0]!;
    w.store.brain[i * BRAIN_GENES] = Infinity;
    const r = scanHealth(w);
    expect(r.byKind.nonfinite).toBeGreaterThanOrEqual(1);
    expect(r.violations.some((v) => v.field === 'brain[0]')).toBe(true);
  });

  it('caps the returned violation list but still counts them all', () => {
    const w = smallWorld();
    for (let k = 0; k < w.store.liveCount; k++) w.store.energy[w.store.liveIndices[k]!] = -1;
    const r = scanHealth(w, 5);
    expect(r.violations.length).toBe(5);
    expect(r.violationCount).toBe(w.population);
    expect(r.byKind.energy).toBe(w.population);
  });
});
