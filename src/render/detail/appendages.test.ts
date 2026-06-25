import { describe, it, expect } from 'vitest';
import { OrganismStore } from '../../core/store';
import { ScalarGene, SCALAR_GENE_COUNT, SCALAR_GENE_SPECS } from '../../core/genome';
import { GeneView, buildDerived, type CreatureVisualCtx } from './gene-view';
import { tail } from './tail';
import { fins } from './fins';
import { antennae } from './antennae';
import { recordingCtx } from './mock-ctx';

function ctxFor(tier: 0 | 1 | 2, overrides: Record<number, number>): CreatureVisualCtx {
  const s = new OrganismStore(8);
  const i = s.alloc();
  s.heading[i] = 0;
  s.hue[i] = 0.33;
  const b = i * SCALAR_GENE_COUNT;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) s.scalarGenes[b + g] = SCALAR_GENE_SPECS[g]!.min;
  for (const [k, v] of Object.entries(overrides)) s.scalarGenes[b + Number(k)] = v;
  const genes = new GeneView(s, i);
  const rec = recordingCtx();
  return Object.assign(
    { ctx: rec.ctx, R: 30, tier, genes, derived: buildDerived(genes), opts: { showCone: false } },
    { __rec: rec },
  ) as unknown as CreatureVisualCtx;
}
const rec = (c: CreatureVisualCtx) =>
  (c as unknown as { __rec: ReturnType<typeof recordingCtx> }).__rec;

describe('appendages', () => {
  it('tail draws a filled shape', () => {
    const c = ctxFor(2, { [ScalarGene.MAX_SPEED]: 10 });
    tail.draw(c);
    expect(rec(c).counts.fill).toBeGreaterThanOrEqual(1);
  });
  it('more MAX_TURN → more fins (more triangles)', () => {
    const lo = ctxFor(2, { [ScalarGene.MAX_TURN]: 0.05 });
    const hi = ctxFor(2, { [ScalarGene.MAX_TURN]: 1.2 });
    fins.draw(lo);
    fins.draw(hi);
    expect(rec(hi).counts.closePath).toBeGreaterThan(rec(lo).counts.closePath ?? 0);
  });
  it('antennae are tier-2 only (suppressed at tier 1)', () => {
    const c1 = ctxFor(1, { [ScalarGene.SENSE_RANGE]: 256 });
    antennae.draw(c1);
    expect(rec(c1).counts.stroke ?? 0).toBe(0);
    const c2 = ctxFor(2, { [ScalarGene.SENSE_RANGE]: 256 });
    antennae.draw(c2);
    expect(rec(c2).counts.stroke).toBeGreaterThanOrEqual(2);
  });
});
