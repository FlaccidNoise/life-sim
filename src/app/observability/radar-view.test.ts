import { describe, it, expect } from 'vitest';
import { OrganismStore } from '../../core/store';
import { defaultConfig } from '../../core/config';
import { ScalarGene, SCALAR_GENE_COUNT, SCALAR_GENE_SPECS } from '../../core/genome';
import { computeRadar, RADAR_AXES } from './radar-view';

const cfg = defaultConfig();

/** One creature whose scalar genes are all set to their config CENTER (a "default" morphotype). */
function centered(): OrganismStore {
  const s = new OrganismStore(4);
  const i = s.alloc();
  const base = i * SCALAR_GENE_COUNT;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++)
    s.scalarGenes[base + g] = cfg[SCALAR_GENE_SPECS[g]!.centerKey];
  s.rebuildLive();
  return s;
}

function setGene(s: OrganismStore, slot: number, gene: number, v: number): void {
  s.scalarGenes[slot * SCALAR_GENE_COUNT + gene] = v;
}

describe('computeRadar', () => {
  it('exposes the 7 documented axes in order', () => {
    const st = computeRadar(centered(), cfg, 0);
    expect(st.axes.map((a) => a.label)).toEqual([
      'diet',
      'bite',
      'spd',
      'size',
      'smell',
      'r/K',
      'prov',
    ]);
    expect(RADAR_AXES).toHaveLength(7);
  });

  it('normalizes each spoke against its gene clamp bounds (0..1)', () => {
    const s = centered();
    // Push two genes to their spec extremes and assert norm hits 0 and 1 exactly.
    const sizeSpec = SCALAR_GENE_SPECS[ScalarGene.SIZE]!;
    setGene(s, 0, ScalarGene.SIZE, sizeSpec.min);
    setGene(s, 0, ScalarGene.MAX_SPEED, SCALAR_GENE_SPECS[ScalarGene.MAX_SPEED]!.max);
    const st = computeRadar(s, cfg, 0);
    expect(st.axes.find((a) => a.label === 'size')!.norm).toBe(0);
    expect(st.axes.find((a) => a.label === 'spd')!.norm).toBe(1);
  });

  it('maps a centered gene to its proportional position on the ring', () => {
    const st = computeRadar(centered(), cfg, 0);
    const spd = st.axes.find((a) => a.label === 'spd')!;
    const spec = SCALAR_GENE_SPECS[ScalarGene.MAX_SPEED]!;
    expect(spd.norm).toBeCloseTo((cfg.maxSpeed - spec.min) / (spec.max - spec.min), 10);
    expect(spd.value).toBe(cfg.maxSpeed);
  });

  it('clamps out-of-range values into [0,1]', () => {
    const s = centered();
    setGene(s, 0, ScalarGene.DAMAGE, 9999);
    expect(computeRadar(s, cfg, 0).axes.find((a) => a.label === 'bite')!.norm).toBe(1);
    setGene(s, 0, ScalarGene.DAMAGE, -50);
    expect(computeRadar(s, cfg, 0).axes.find((a) => a.label === 'bite')!.norm).toBe(0);
  });

  it('derives the diet guild hue and label (green herbivore → red predator)', () => {
    const s = centered();
    setGene(s, 0, ScalarGene.DIET, 0);
    let st = computeRadar(s, cfg, 0);
    expect(st.dietHue).toBeCloseTo(122, 6); // green
    expect(st.guild).toBe('herbivore');
    setGene(s, 0, ScalarGene.DIET, 1);
    st = computeRadar(s, cfg, 0);
    expect(st.dietHue).toBeCloseTo(0, 6); // red
    expect(st.guild).toBe('predator');
  });
});
