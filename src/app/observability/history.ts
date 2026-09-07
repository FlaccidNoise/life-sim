/**
 * Run history recorder — the persistent time-series the scrolling graph can't keep. The graph holds a
 * 600-point ring and discards everything older, so a multi-hour browser run leaves no record of how it
 * evolved. This appends a compact snapshot every `everyTicks` sim-ticks (density bounded by sim-time,
 * not frame-rate, so any speed yields the same trajectory resolution) into an in-memory log the console
 * can dump as CSV for offline analysis.
 *
 * Each snapshot pairs the whole-population summary (counts, vital rates, energy, turnover) with the
 * mean+σ of the genes whose drift tells the evolution story (diet, size, speed, vision, metabolism, …),
 * so the CSV shows both the ecology and the genome moving over the run. The gene pass runs ONLY when a
 * snapshot is taken (inside the record thunk), so its O(pop) cost is paid ~once per `everyTicks`, never
 * per frame.
 */
import { type OrganismStore } from '../../core/store';
import { ScalarGene, SCALAR_GENE_COUNT } from '../../core/genome';
import { type Plants, PLANT_GENE_COUNT, PlantGene } from '../../core/plants';

// Genes whose population mean+σ track the run's evolutionary trajectory. Order fixes the CSV columns.
const TRACKED_GENES: readonly (readonly [string, number])[] = [
  ['diet', ScalarGene.DIET],
  ['size', ScalarGene.SIZE],
  ['maxSpeed', ScalarGene.MAX_SPEED],
  ['visionRange', ScalarGene.VISION_RANGE],
  ['senseRange', ScalarGene.SENSE_RANGE],
  ['metabEff', ScalarGene.METAB_EFF],
  ['damage', ScalarGene.DAMAGE],
  ['reproThreshold', ScalarGene.REPRO_THRESHOLD],
  ['damping', ScalarGene.DAMPING],
];

export interface HistorySample {
  tick: number;
  pop: number;
  herb: number;
  omni: number;
  pred: number;
  meanAge: number;
  medianAge: number;
  founders: number;
  satiated: number;
  meanEnergy: number;
  births: number; // cumulative total births at snapshot time
  deaths: number; // cumulative total deaths
  avgBirths: number; // trailing per-tick birth rate
  avgDeaths: number;
  food: number;
  /** Live plant count. 0 when plants are off — without these four series a long browser run would lose
   *  all producer data once the food field's biomass channels go away. */
  plantCount: number;
  /** Σ plant energy — the standing crop. */
  plantBiomass: number;
  /** Population mean of the plant SPECIES gene (the resource axis). */
  speciesMean: number;
  /** Population σ of SPECIES — > 0 and growing means the axis is genuinely splitting. */
  speciesSigma: number;
  meanGen: number;
  health: number; // invariant-violation count (0 = clean)
  geneMean: Record<string, number>;
  geneStd: Record<string, number>;
}

/** One O(pop) pass → population mean + σ of each tracked gene (sum/sumSq, so σ is single-pass). */
export function sampleGeneStats(store: OrganismStore): {
  mean: Record<string, number>;
  std: Record<string, number>;
} {
  const n = store.liveCount;
  const sum = new Float64Array(TRACKED_GENES.length);
  const sumSq = new Float64Array(TRACKED_GENES.length);
  for (let k = 0; k < n; k++) {
    const base = store.liveIndices[k]! * SCALAR_GENE_COUNT;
    for (let g = 0; g < TRACKED_GENES.length; g++) {
      const v = store.scalarGenes[base + TRACKED_GENES[g]![1]]!;
      sum[g]! += v;
      sumSq[g]! += v * v;
    }
  }
  const mean: Record<string, number> = {};
  const std: Record<string, number> = {};
  for (let g = 0; g < TRACKED_GENES.length; g++) {
    const name = TRACKED_GENES[g]![0];
    const m = n ? sum[g]! / n : 0;
    mean[name] = m;
    std[name] = Math.sqrt(n ? Math.max(0, sumSq[g]! / n - m * m) : 0); // clamp float noise so σ can't go NaN
  }
  return { mean, std };
}

/** Count, Σ energy, and the mean+σ of SPECIES over the live plants. Null pool (plants off) → zeroes. */
export function samplePlantStats(plants: Plants | null): {
  count: number;
  biomass: number;
  speciesMean: number;
  speciesSigma: number;
} {
  if (plants === null || plants.liveCount === 0)
    return { count: 0, biomass: 0, speciesMean: 0, speciesSigma: 0 };
  const { liveIndices, liveCount, energy, genes } = plants;
  let biomass = 0;
  let sum = 0;
  let sumSq = 0;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    biomass += energy[i]!;
    const v = genes[i * PLANT_GENE_COUNT + PlantGene.SPECIES]!;
    sum += v;
    sumSq += v * v;
  }
  const m = sum / liveCount;
  return {
    count: liveCount,
    biomass,
    speciesMean: m,
    speciesSigma: Math.sqrt(Math.max(0, sumSq / liveCount - m * m)),
  };
}

const round = (v: number, dp = 1): number => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

export class HistoryRecorder {
  private readonly samples: HistorySample[] = [];
  private lastRecordedTick = -Infinity;

  constructor(private readonly everyTicks = 200) {}

  /** Record a snapshot iff ≥`everyTicks` sim-ticks have elapsed since the last. `build` is only invoked
   *  when recording, so the caller's O(pop) gene pass is skipped on the frames in between. */
  maybeRecord(tick: number, build: () => HistorySample): boolean {
    if (tick - this.lastRecordedTick < this.everyTicks) return false;
    this.lastRecordedTick = tick;
    this.samples.push(build());
    return true;
  }

  get count(): number {
    return this.samples.length;
  }

  all(): readonly HistorySample[] {
    return this.samples;
  }

  clear(): void {
    this.samples.length = 0;
    this.lastRecordedTick = -Infinity;
  }

  toCsv(): string {
    const geneCols = TRACKED_GENES.flatMap(([name]) => [`${name}_mean`, `${name}_std`]);
    const header = [
      'tick',
      'pop',
      'herb',
      'omni',
      'pred',
      'meanAge',
      'medianAge',
      'founders',
      'satiated',
      'meanEnergy',
      'births',
      'deaths',
      'avgBirths',
      'avgDeaths',
      'food',
      'plantCount',
      'plantBiomass',
      'speciesMean',
      'speciesSigma',
      'meanGen',
      'health',
      ...geneCols,
    ].join(',');
    const rows = this.samples.map((s) =>
      [
        s.tick,
        s.pop,
        s.herb,
        s.omni,
        s.pred,
        round(s.meanAge),
        s.medianAge,
        s.founders,
        s.satiated,
        round(s.meanEnergy),
        s.births,
        s.deaths,
        round(s.avgBirths, 3),
        round(s.avgDeaths, 3),
        round(s.food),
        s.plantCount,
        round(s.plantBiomass),
        round(s.speciesMean, 4),
        round(s.speciesSigma, 4),
        round(s.meanGen, 3),
        s.health,
        ...TRACKED_GENES.flatMap(([name]) => [
          round(s.geneMean[name] ?? 0, 4),
          round(s.geneStd[name] ?? 0, 4),
        ]),
      ].join(','),
    );
    return [header, ...rows].join('\n');
  }
}
