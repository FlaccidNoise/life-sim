import { describe, it, expect } from 'vitest';
import { OrganismStore } from '../../core/store';
import { defaultConfig } from '../../core/config';
import { ScalarGene, SCALAR_GENE_COUNT, SCALAR_GENE_SPECS } from '../../core/genome';
import { computeRadar, CAPABILITY_AXES, LENSES, DEFAULT_LENS } from './radar-view';

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
      'agility',
      'size',
      'vision',
      'r/K',
      'prov',
    ]);
    expect(CAPABILITY_AXES).toHaveLength(7);
  });

  it('normalizes each spoke against its gene clamp bounds (0..1)', () => {
    const s = centered();
    // Push two genes to their spec extremes and assert norm hits 0 and 1 exactly.
    const sizeSpec = SCALAR_GENE_SPECS[ScalarGene.SIZE]!;
    setGene(s, 0, ScalarGene.SIZE, sizeSpec.min);
    setGene(s, 0, ScalarGene.MAX_TURN, SCALAR_GENE_SPECS[ScalarGene.MAX_TURN]!.max);
    const st = computeRadar(s, cfg, 0);
    expect(st.axes.find((a) => a.label === 'size')!.norm).toBe(0);
    expect(st.axes.find((a) => a.label === 'agility')!.norm).toBe(1);
  });

  it('maps a centered gene to its proportional position on the ring', () => {
    const st = computeRadar(centered(), cfg, 0);
    const agility = st.axes.find((a) => a.label === 'agility')!;
    const spec = SCALAR_GENE_SPECS[ScalarGene.MAX_TURN]!;
    // maxTurn's center (0.35) isn't exactly representable in the Float32Array gene store, so compare at
    // float32 precision rather than full double precision.
    expect(agility.norm).toBeCloseTo((cfg.maxTurn - spec.min) / (spec.max - spec.min), 6);
    expect(agility.value).toBeCloseTo(cfg.maxTurn, 6);
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

describe('radar lenses', () => {
  it('registers the ordered subsystem lenses with capability first + default', () => {
    expect(LENSES.map((l) => l.key)).toEqual([
      'capability',
      'body',
      'senses',
      'metabolism',
      'foraging',
      'social',
    ]);
    expect(DEFAULT_LENS).toBe('capability');
    expect(LENSES[0]!.axes).toBe(CAPABILITY_AXES);
  });

  it('every lens has 2..8 axes over real, normalizable genes', () => {
    for (const lens of LENSES) {
      expect(lens.axes.length).toBeGreaterThanOrEqual(2);
      expect(lens.axes.length).toBeLessThanOrEqual(8);
      for (const ax of lens.axes) {
        expect(SCALAR_GENE_SPECS[ax.gene]).toBeDefined();
        expect(ax.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('the subsystem lenses (everything past capability) cover every heritable gene', () => {
    // Capability is a curated overview; the remaining lenses are the genome walk and together must
    // surface all 26 scalar genes so the dropdown gives a full read of a creature.
    const covered = new Set<number>();
    for (const lens of LENSES) {
      if (lens.key === 'capability') continue;
      for (const ax of lens.axes) covered.add(ax.gene);
    }
    expect(covered.size).toBe(SCALAR_GENE_COUNT);
    for (let g = 0; g < SCALAR_GENE_COUNT; g++) expect(covered.has(g)).toBe(true);
  });

  it('computeRadar honors an explicit axis-set (the active lens)', () => {
    const st = computeRadar(centered(), cfg, 0, LENSES[1]!.axes);
    expect(st.axes.map((a) => a.label)).toEqual(LENSES[1]!.axes.map((a) => a.label));
  });

  it('defaults to the capability lens when no axis-set is passed', () => {
    const st = computeRadar(centered(), cfg, 0);
    expect(st.axes.map((a) => a.label)).toEqual(CAPABILITY_AXES.map((a) => a.label));
  });

  it('carries a compact rim value string scaled to each gene range', () => {
    const s = centered();
    setGene(s, 0, ScalarGene.DIET, 0.37); // small-range gene → 2 decimals
    setGene(s, 0, ScalarGene.SENESCENCE_AGE, 1840.6); // large-range gene → rounded integer
    const body = computeRadar(s, cfg, 0, [
      { gene: ScalarGene.DIET, label: 'diet', color: '#fff' },
      { gene: ScalarGene.SENESCENCE_AGE, label: 'lifespan', color: '#fff' },
    ]);
    expect(body.axes[0]!.display).toBe('0.37');
    expect(body.axes[1]!.display).toBe('1841');
  });
});
