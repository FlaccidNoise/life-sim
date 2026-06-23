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
  it('higher vision acuity → sharper (smaller) pupil', () => {
    const dull = ctxFor({ [ScalarGene.DIET]: 0, [ScalarGene.VISION_ACUITY]: 0 });
    const sharp = ctxFor({ [ScalarGene.DIET]: 0, [ScalarGene.VISION_ACUITY]: 3 });
    eyes.draw(dull);
    eyes.draw(sharp);
    // eyeball radius (eyeR) is equal (VISION_RANGE held at min); only the pupil + catchlight
    // arcs shrink with acuity, so the smallest recorded arc radius drops.
    const minR = (c: CreatureVisualCtx) =>
      Math.min(...(c as unknown as { __rec: ReturnType<typeof recordingCtx> }).__rec.arcRadii);
    expect(minR(sharp)).toBeLessThan(minR(dull));
  });
  it('diet boundary: 0.39 stays cute (round eye, no slit); 0.40 turns fearsome (slit + brow)', () => {
    // fear = clamp(diet * 1.15) crosses 0.45 at diet ≈ 0.391. The cute branch strokes the eyeball
    // outline too, so `stroke` can't distinguish the branches — the slit-pupil `ellipse` does.
    const cute = ctxFor({ [ScalarGene.DIET]: 0.39 });
    eyes.draw(cute);
    const rc = (cute as unknown as { __rec: ReturnType<typeof recordingCtx> }).__rec;
    expect(rc.counts.arc).toBeGreaterThanOrEqual(2);
    expect(rc.counts.ellipse ?? 0).toBe(0);

    const mean = ctxFor({ [ScalarGene.DIET]: 0.4 });
    eyes.draw(mean);
    const rm = (mean as unknown as { __rec: ReturnType<typeof recordingCtx> }).__rec;
    expect(rm.counts.ellipse).toBeGreaterThanOrEqual(2);
    expect(rm.counts.stroke).toBeGreaterThanOrEqual(2);
  });
});
