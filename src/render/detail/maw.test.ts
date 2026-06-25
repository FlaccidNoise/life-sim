import { describe, it, expect } from 'vitest';
import { OrganismStore } from '../../core/store';
import { ScalarGene, SCALAR_GENE_COUNT, SCALAR_GENE_SPECS } from '../../core/genome';
import { GeneView, buildDerived, type CreatureVisualCtx } from './gene-view';
import { maw } from './maw';
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

describe('maw module', () => {
  it('no fangs when damage ~0', () => {
    const c = ctxFor(2, { [ScalarGene.DAMAGE]: 0 });
    maw.draw(c);
    // mouth is one ellipse; fang triangles use moveTo/lineTo — none expected
    expect(rec(c).counts.moveTo ?? 0).toBe(0);
  });
  it('more damage → more fang triangles (more closePath calls)', () => {
    const lo = ctxFor(2, { [ScalarGene.DAMAGE]: 2 });
    const hi = ctxFor(2, { [ScalarGene.DAMAGE]: 20 });
    maw.draw(lo);
    maw.draw(hi);
    expect(rec(hi).counts.closePath ?? 0).toBeGreaterThan(rec(lo).counts.closePath ?? 0);
  });
  it('fangs suppressed at tier 1 even with high damage', () => {
    const c = ctxFor(1, { [ScalarGene.DAMAGE]: 20 });
    maw.draw(c);
    expect(rec(c).counts.closePath ?? 0).toBe(0);
  });
});
