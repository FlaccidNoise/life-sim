import { describe, it, expect } from 'vitest';
import { OrganismStore } from '../core/store';
import { defaultConfig } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';
import { buildOverlaySegments } from './overlay';

const cfg = defaultConfig({ worldWidth: 512, worldHeight: 512 });

/** Allocate one live creature at (cx,cy) with sane genes; apply gene overrides keyed by ScalarGene. */
function oneCreature(
  cx: number,
  cy: number,
  overrides: Record<number, number> = {},
): OrganismStore {
  const s = new OrganismStore(64);
  const i = s.alloc();
  s.x[i] = cx;
  s.y[i] = cy;
  s.heading[i] = 0;
  s.energy[i] = 50;
  const base = i * SCALAR_GENE_COUNT;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) s.scalarGenes[base + g] = 1;
  s.scalarGenes[base + ScalarGene.DIET] = 0; // herbivore by default
  s.scalarGenes[base + ScalarGene.VISION_RANGE] = 20;
  s.scalarGenes[base + ScalarGene.VISION_FOV] = 0.6;
  s.scalarGenes[base + ScalarGene.VISION_ACUITY] = 1;
  for (const [k, v] of Object.entries(overrides)) s.scalarGenes[base + Number(k)] = v;
  s.rebuildLive();
  return s;
}

describe('buildOverlaySegments', () => {
  it('returns 0 for a dead slot', () => {
    const s = new OrganismStore(8);
    const out = new Float32Array(2048);
    expect(buildOverlaySegments(s, 0, cfg, out)).toBe(0);
  });

  it('emits an even, finite vertex stream for a live creature', () => {
    const s = oneCreature(256, 256);
    const out = new Float32Array(2048);
    const vc = buildOverlaySegments(s, 0, cfg, out);
    expect(vc).toBeGreaterThan(0);
    expect(vc % 2).toBe(0); // gl.LINES pairs vertices
    for (let i = 0; i < vc * 5; i++) expect(Number.isFinite(out[i]!)).toBe(true);
  });

  it('a blind creature (visionRange 0) draws fewer segments than a sighted one', () => {
    const out = new Float32Array(2048);
    const sighted = buildOverlaySegments(oneCreature(256, 256), 0, cfg, out);
    const blind = buildOverlaySegments(
      oneCreature(256, 256, { [ScalarGene.VISION_RANGE]: 0 }),
      0,
      cfg,
      out,
    );
    expect(blind).toBeLessThan(sighted);
  });

  it('a predator (diet > 0) draws MORE than a herbivore (adds the bite ring)', () => {
    const out = new Float32Array(2048);
    const herb = buildOverlaySegments(oneCreature(256, 256), 0, cfg, out);
    const pred = buildOverlaySegments(
      oneCreature(256, 256, { [ScalarGene.DIET]: 0.9 }),
      0,
      cfg,
      out,
    );
    expect(pred).toBeGreaterThan(herb);
  });

  it('a predator draws a line to a prey within bite range', () => {
    const s = oneCreature(256, 256, { [ScalarGene.DIET]: 0.9 });
    // Add a prey just inside biteRange.
    const j = s.alloc();
    s.x[j] = 256 + cfg.biteRange * 0.5;
    s.y[j] = 256;
    s.energy[j] = 50;
    for (let g = 0; g < SCALAR_GENE_COUNT; g++) s.scalarGenes[j * SCALAR_GENE_COUNT + g] = 1;
    s.scalarGenes[j * SCALAR_GENE_COUNT + ScalarGene.DIET] = 0;
    s.rebuildLive();
    const out = new Float32Array(2048);
    const withPrey = buildOverlaySegments(s, 0, cfg, out);
    // Same predator with the prey moved out of range → one fewer segment (the target line).
    s.x[j] = 256 + cfg.biteRange * 5;
    const noPrey = buildOverlaySegments(s, 0, cfg, out);
    expect(withPrey).toBe(noPrey + 2); // a segment = 2 vertices
  });

  it('respects the buffer cap without overflowing', () => {
    const s = oneCreature(256, 256, { [ScalarGene.DIET]: 0.9 });
    const tiny = new Float32Array(5 * 6); // room for 6 vertices only
    const vc = buildOverlaySegments(s, 0, cfg, tiny);
    expect(vc).toBeLessThanOrEqual(6);
  });
});
