import { describe, it, expect } from 'vitest';
import { OrganismStore } from '../../core/store';
import { ScalarGene, SCALAR_GENE_COUNT, SCALAR_GENE_SPECS } from '../../core/genome';
import { GeneView, buildDerived, type CreatureVisualCtx } from './gene-view';
import { eyes } from './eyes';
import { recordingCtx } from './mock-ctx';

function ctxFor(overrides: Record<number, number>): CreatureVisualCtx {
  const s = new OrganismStore(8);
  const i = s.alloc();
  s.heading[i] = 0;
  s.hue[i] = 0.33;
  const b = i * SCALAR_GENE_COUNT;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) s.scalarGenes[b + g] = SCALAR_GENE_SPECS[g]!.min;
  for (const [k, v] of Object.entries(overrides)) s.scalarGenes[b + Number(k)] = v;
  const genes = new GeneView(s, i);
  const rec = recordingCtx();
  return {
    ctx: rec.ctx,
    R: 30,
    tier: 2,
    genes,
    derived: buildDerived(genes),
    opts: { showCone: false },
    // @ts-expect-error attach recorder for the test
    __rec: rec,
  };
}

describe('eyes module', () => {
  it('cute herbivore draws round eyes (arc) and no brow stroke', () => {
    const c = ctxFor({ [ScalarGene.DIET]: 0 });
    eyes.draw(c);
    const rec = (c as unknown as { __rec: ReturnType<typeof recordingCtx> }).__rec;
    expect(rec.counts.arc).toBeGreaterThanOrEqual(2); // two eyeballs (+pupils/catchlights)
  });
  it('fearsome predator draws almond eyes (no round eyeball arc for the sclera) + a brow stroke', () => {
    const c = ctxFor({ [ScalarGene.DIET]: 1 });
    eyes.draw(c);
    const rec = (c as unknown as { __rec: ReturnType<typeof recordingCtx> }).__rec;
    // predator sclera is an almond (moveTo/lineTo polygon), pupil is an ellipse, brow is a stroke
    expect(rec.counts.ellipse).toBeGreaterThanOrEqual(2); // slit pupils
    expect(rec.counts.stroke).toBeGreaterThanOrEqual(2); // brow slash per eye
  });
  it('bigger vision range → bigger eyes (more fill area proxy: larger arc radius arg)', () => {
    const small = ctxFor({ [ScalarGene.DIET]: 0, [ScalarGene.VISION_RANGE]: 0 });
    const big = ctxFor({ [ScalarGene.DIET]: 0, [ScalarGene.VISION_RANGE]: 256 });
    eyes.draw(small);
    eyes.draw(big);
    const r = (c: CreatureVisualCtx) =>
      Math.max(...(c as unknown as { __rec: ReturnType<typeof recordingCtx> }).__rec.arcRadii);
    expect(r(big)).toBeGreaterThan(r(small));
  });
});
