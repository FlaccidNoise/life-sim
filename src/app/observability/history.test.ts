import { describe, it, expect } from 'vitest';
import { HistoryRecorder, sampleGeneStats, type HistorySample } from './history';
import { type OrganismStore } from '../../core/store';
import { ScalarGene, SCALAR_GENE_COUNT } from '../../core/genome';

const blank = (tick: number): HistorySample => ({
  tick,
  pop: 1,
  herb: 1,
  omni: 0,
  pred: 0,
  meanAge: 0,
  medianAge: 0,
  founders: 0,
  satiated: 0,
  meanEnergy: 0,
  births: 0,
  deaths: 0,
  avgBirths: 0,
  avgDeaths: 0,
  food: 0,
  plantCount: 0,
  plantBiomass: 0,
  speciesMean: 0,
  speciesSigma: 0,
  meanGen: 0,
  health: 0,
  geneMean: {},
  geneStd: {},
});

/** Minimal store: two creatures with DIET 0 and 1 → mean 0.5, σ 0.5. */
function makeStore(diets: number[]): OrganismStore {
  const scalarGenes = new Float32Array(diets.length * SCALAR_GENE_COUNT);
  const liveIndices = new Uint32Array(diets.length);
  diets.forEach((d, i) => {
    liveIndices[i] = i;
    scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET] = d;
  });
  return { liveCount: diets.length, liveIndices, scalarGenes } as unknown as OrganismStore;
}

describe('HistoryRecorder', () => {
  it('records only after everyTicks have elapsed since the last snapshot', () => {
    const r = new HistoryRecorder(200);
    expect(r.maybeRecord(0, () => blank(0))).toBe(true); // first is always recorded
    expect(r.maybeRecord(100, () => blank(100))).toBe(false); // < 200 since last
    expect(r.maybeRecord(200, () => blank(200))).toBe(true); // exactly 200 → records
    expect(r.maybeRecord(350, () => blank(350))).toBe(false);
    expect(r.maybeRecord(400, () => blank(400))).toBe(true);
    expect(r.count).toBe(3);
    expect(r.all().map((s) => s.tick)).toEqual([0, 200, 400]);
  });

  it('does not invoke build when the gate blocks (skips the O(pop) pass between snapshots)', () => {
    const r = new HistoryRecorder(200);
    r.maybeRecord(0, () => blank(0));
    let built = 0;
    r.maybeRecord(50, () => {
      built++;
      return blank(50);
    });
    expect(built).toBe(0);
  });

  it('clear resets both the log and the cadence gate', () => {
    const r = new HistoryRecorder(200);
    r.maybeRecord(500, () => blank(500));
    r.clear();
    expect(r.count).toBe(0);
    expect(r.maybeRecord(0, () => blank(0))).toBe(true); // gate reset → tick 0 records again
  });

  it('emits a header + one row per sample with the gene columns', () => {
    const r = new HistoryRecorder(1);
    const s = blank(10);
    s.geneMean = { diet: 0.5 };
    s.geneStd = { diet: 0.25 };
    r.maybeRecord(10, () => s);
    const lines = r.toCsv().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('tick,pop');
    expect(lines[0]).toContain('diet_mean,diet_std');
    expect(lines[1]!.startsWith('10,1,1,0,0')).toBe(true);
    expect(lines[1]).toContain('0.5,0.25');
  });
});

describe('sampleGeneStats', () => {
  it('computes population mean and σ of a tracked gene', () => {
    const { mean, std } = sampleGeneStats(makeStore([0, 1]));
    expect(mean.diet).toBeCloseTo(0.5, 6);
    expect(std.diet).toBeCloseTo(0.5, 6);
  });

  it('returns zeros for an empty population without NaN', () => {
    const { mean, std } = sampleGeneStats(makeStore([]));
    expect(mean.diet).toBe(0);
    expect(std.diet).toBe(0);
  });
});
