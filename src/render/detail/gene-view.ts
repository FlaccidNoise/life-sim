import { type OrganismStore } from '../../core/store';
import { ScalarGene, SCALAR_GENE_COUNT, SCALAR_GENE_SPECS } from '../../core/genome';
import { hsv2rgb, metabSaturation, type RGB } from '../palette';

export type { RGB };

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const mul = (c: RGB, f: number): RGB => [
  Math.min(255, Math.max(0, Math.round(c[0] * f))),
  Math.min(255, Math.max(0, Math.round(c[1] * f))),
  Math.min(255, Math.max(0, Math.round(c[2] * f))),
];

export interface Derived {
  fear: number;
  cute: number;
  base: RGB;
  ink: RGB;
  shadow: RGB;
  lite: RGB;
  screenUp: [number, number];
}

export interface VisualOpts {
  showCone: boolean;
}

export class GeneView {
  constructor(
    private readonly store: OrganismStore,
    readonly slot: number,
  ) {}
  raw(g: number): number {
    return this.store.scalarGenes[this.slot * SCALAR_GENE_COUNT + g]!;
  }
  norm(g: number): number {
    const spec = SCALAR_GENE_SPECS[g]!;
    return clamp01((this.raw(g) - spec.min) / (spec.max - spec.min));
  }
  get diet(): number {
    return this.raw(ScalarGene.DIET);
  }
  get hue(): number {
    return this.store.hue[this.slot]!;
  }
  get heading(): number {
    return this.store.heading[this.slot]!;
  }
  get speed(): number {
    return Math.hypot(this.store.vx[this.slot]!, this.store.vy[this.slot]!);
  }
}

export function buildDerived(genes: GeneView): Derived {
  const diet = genes.diet;
  const fear = clamp01(diet * 1.15);
  const cute = 1 - fear;
  const sat = metabSaturation(genes.raw(ScalarGene.METAB_EFF), fear);
  const base = hsv2rgb(genes.hue - Math.floor(genes.hue), sat, lerp(0.92, 0.82, fear));
  const h = genes.heading;
  return {
    fear,
    cute,
    base,
    shadow: mul(base, 0.7),
    ink: mul(base, 0.34),
    lite: mul(base, 1.18),
    screenUp: [-Math.sin(h), -Math.cos(h)],
  };
}

export interface CreatureVisualCtx {
  ctx: CanvasRenderingContext2D;
  R: number;
  tier: 0 | 1 | 2;
  genes: GeneView;
  derived: Derived;
  opts: VisualOpts;
}

export interface TraitModule {
  id: string;
  z: number;
  minTier: 0 | 1 | 2;
  draw(c: CreatureVisualCtx): void;
}
