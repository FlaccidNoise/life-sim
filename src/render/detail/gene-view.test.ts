import { describe, it, expect } from 'vitest';
import { OrganismStore } from '../../core/store';
import { ScalarGene, SCALAR_GENE_COUNT, SCALAR_GENE_SPECS } from '../../core/genome';
import { GeneView, buildDerived } from './gene-view';

function view(overrides: Record<number, number> = {}, hue = 0.33, heading = 0): GeneView {
  const s = new OrganismStore(8);
  const i = s.alloc();
  s.heading[i] = heading;
  s.hue[i] = hue;
  const b = i * SCALAR_GENE_COUNT;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) s.scalarGenes[b + g] = SCALAR_GENE_SPECS[g]!.min;
  for (const [k, v] of Object.entries(overrides)) s.scalarGenes[b + Number(k)] = v;
  return new GeneView(s, i);
}

describe('GeneView', () => {
  it('raw reads the gene value', () => {
    const g = view({ [ScalarGene.DIET]: 0.7 });
    expect(g.raw(ScalarGene.DIET)).toBeCloseTo(0.7, 6);
    expect(g.diet).toBeCloseTo(0.7, 6);
  });
  it('norm maps min→0 and max→1, clamped', () => {
    const spec = SCALAR_GENE_SPECS[ScalarGene.VISION_RANGE]!;
    const g = view({ [ScalarGene.VISION_RANGE]: spec.max });
    expect(g.norm(ScalarGene.VISION_RANGE)).toBeCloseTo(1, 6);
    const lo = view({ [ScalarGene.VISION_RANGE]: spec.min });
    expect(lo.norm(ScalarGene.VISION_RANGE)).toBeCloseTo(0, 6);
  });
});

describe('buildDerived', () => {
  it('fear/cute track diet', () => {
    expect(buildDerived(view({ [ScalarGene.DIET]: 0 })).fear).toBeCloseTo(0, 6);
    expect(buildDerived(view({ [ScalarGene.DIET]: 1 })).fear).toBeCloseTo(1, 6);
    expect(buildDerived(view({ [ScalarGene.DIET]: 1 })).cute).toBeCloseTo(0, 6);
  });
  it('shadow is darker than base, lite is brighter', () => {
    const d = buildDerived(view({ [ScalarGene.DIET]: 0, [ScalarGene.METAB_EFF]: 1 }));
    const lum = (c: number[]) => c[0]! + c[1]! + c[2]!;
    expect(lum(d.shadow)).toBeLessThan(lum(d.base));
    expect(lum(d.lite)).toBeGreaterThanOrEqual(lum(d.base));
  });
  it('screenUp is the rotated screen-up vector', () => {
    const d = buildDerived(view({}, 0.33, 0));
    expect(d.screenUp[0]).toBeCloseTo(0, 6); // -sin(0)
    expect(d.screenUp[1]).toBeCloseTo(-1, 6); // -cos(0)
  });
});
