import { describe, it, expect } from 'vitest';
import { OrganismStore } from '../../core/store';
import { ScalarGene, SCALAR_GENE_COUNT, SCALAR_GENE_SPECS } from '../../core/genome';
import { GeneView, buildDerived, type CreatureVisualCtx } from './gene-view';
import { visionCone } from './vision-cone';
import { recordingCtx } from './mock-ctx';

function ctxFor(showCone: boolean, fov: number, range: number): CreatureVisualCtx {
  const s = new OrganismStore(8);
  const i = s.alloc();
  s.heading[i] = 0;
  s.hue[i] = 0.33;
  const b = i * SCALAR_GENE_COUNT;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) s.scalarGenes[b + g] = SCALAR_GENE_SPECS[g]!.min;
  s.scalarGenes[b + ScalarGene.VISION_FOV] = fov;
  s.scalarGenes[b + ScalarGene.VISION_RANGE] = range;
  const genes = new GeneView(s, i);
  const rec = recordingCtx();
  return Object.assign(
    {
      ctx: rec.ctx,
      R: 30,
      tier: 2 as const,
      genes,
      derived: buildDerived(genes),
      opts: { showCone },
    },
    { __rec: rec },
  ) as unknown as CreatureVisualCtx;
}

describe('vision-cone module', () => {
  it('draws nothing when the toggle is off', () => {
    const c = ctxFor(false, 1, 100);
    visionCone.draw(c);
    expect((c as unknown as { __rec: ReturnType<typeof recordingCtx> }).__rec.counts.arc ?? 0).toBe(
      0,
    );
  });
  it('arc half-angle equals FOV when on', () => {
    const fov = 0.8;
    const c = ctxFor(true, fov, 100);
    visionCone.draw(c);
    const ang = (c as unknown as { __rec: ReturnType<typeof recordingCtx> }).__rec.arcAngles[0]!;
    expect(ang.start).toBeCloseTo(-fov, 6);
    expect(ang.end).toBeCloseTo(fov, 6);
  });
});
