/**
 * Gene-variance census probe (the "flat-spoke gate", trait-radar slice 1.2). Runs a seeded population
 * N ticks PER SEED, then for EACH scalar gene reports the spread of the final live population: p25, p50,
 * p75, and IQR as a fraction of the gene's clamp range (IQRpct = IQR/(max−min)). A gene whose middle 50%
 * spans < 10% of its clamp range is FLAT — rendering a radar spoke for it would read as a broken,
 * permanently-stuck axis — UNLESS it's BIMODAL (a split population, e.g. herbivores vs predators), which
 * IQR hides: a tight cluster at each extreme has a small IQR but is the most behaviorally important axis.
 *
 * Per gene the final verdict = PROMOTE if (median IQRpct across seeds ≥ 0.10 OR bimodal on a majority of
 * seeds), else FLAT. FLIP flags a gene whose per-seed verdict isn't unanimous (near-threshold, don't trust
 * one seed). Multi-seed because single-seed near-10% genes (vision, size, shelterDrive) shouldn't drive a
 * spoke decision alone.
 *
 * Deterministic: same seeds+ticks → same table (live population iterated in ascending liveIndices order).
 * Run: pnpm tsx src/headless/gene-variance.ts [--ticks=3000] [--seeds=1,2,3,4]  (or --seed=N for one seed)
 */
import { World } from '../core/world';
import { defaultConfig } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT, SCALAR_GENE_SPECS } from '../core/genome';

const numArg = (name: string, fallback: number): number => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.slice(name.length + 3)) : fallback;
};
const listArg = (name: string): number[] | undefined => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit
    ? hit
        .slice(name.length + 3)
        .split(',')
        .map(Number)
    : undefined;
};
const ticks = numArg('ticks', 3000);
// --seeds wins; else --seed=N for the single-seed path; else the default 4-seed set.
const seeds = listArg('seeds') ?? (listArg('seed') ? listArg('seed')! : [1, 2, 3, 4]);

// Readable label per gene, kept in ScalarGene enum order. Asserted against SCALAR_GENE_COUNT so it
// can't silently drift if a gene is added.
const GENE_LABELS: readonly string[] = [
  'maxSpeed',
  'eatRate',
  'senseRange',
  'size',
  'maxTurn',
  'maxThrust',
  'metabEff',
  'reproThresh',
  'satiatedThresh',
  'birthEnergy',
  'diet',
  'damage',
  'visionRange',
  'visionFov',
  'visionAcuity',
  'shelterDrive',
  'cohesionDrive',
  'foragePref',
  'foragePrefC',
  'senseRangeB',
  'senseRangeC',
  'pheroDeposit',
  'damping',
];
if (GENE_LABELS.length !== SCALAR_GENE_COUNT) {
  throw new Error(
    `GENE_LABELS length ${GENE_LABELS.length} !== SCALAR_GENE_COUNT ${SCALAR_GENE_COUNT}`,
  );
}
// Guard the label↔enum alignment too: every ScalarGene index must have a label at that position.
for (const [name, idx] of Object.entries(ScalarGene)) {
  if (GENE_LABELS[idx] === undefined)
    throw new Error(`no label for ScalarGene.${name} (index ${idx})`);
}

/** The p-th percentile of a SORTED ascending array (linear interpolation between ranks). */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (rank - lo);
}

/** Median of an unsorted array. */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return percentile(s, 50);
}

interface GeneStat {
  iqrPct: number;
  bimodal: boolean;
}

/** Run one seed `ticks` steps and census the final live population: per-gene IQRpct + bimodality. */
function censusSeed(seed: number): { pop: number; stats: GeneStat[] } {
  const world = new World(defaultConfig({ seed }));
  for (let t = 0; t < ticks; t++) world.step();
  const { liveIndices, liveCount, scalarGenes } = world.store;
  const stats: GeneStat[] = [];
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) {
    const spec = SCALAR_GENE_SPECS[g]!;
    const range = spec.max - spec.min;
    if (liveCount === 0) {
      stats.push({ iqrPct: 0, bimodal: false });
      continue;
    }
    const vals: number[] = [];
    // Bottom/top 15% of the CLAMP range — the bimodality bands. A creature counts as low/high if its
    // gene sits within 15% of the range above min / below max.
    const loEdge = spec.min + 0.15 * range;
    const hiEdge = spec.max - 0.15 * range;
    let lo = 0;
    let hi = 0;
    for (let k = 0; k < liveCount; k++) {
      const v = scalarGenes[liveIndices[k]! * SCALAR_GENE_COUNT + g]!;
      vals.push(v);
      if (v <= loEdge) lo++;
      if (v >= hiEdge) hi++;
    }
    vals.sort((a, b) => a - b);
    const iqrPct = (percentile(vals, 75) - percentile(vals, 25)) / range;
    const bimodal = lo / liveCount >= 0.15 && hi / liveCount >= 0.15;
    stats.push({ iqrPct, bimodal });
  }
  return { pop: liveCount, stats };
}

console.log(
  `=== gene-variance census: ${ticks} ticks, seeds [${seeds.join(',')}], world 8192² ===`,
);
const perSeed = seeds.map((s) => ({ seed: s, ...censusSeed(s) }));
for (const r of perSeed) console.log(`  seed ${r.seed}: population ${r.pop}`);
console.log();

const cols = ['gene', 'medIQR%', 'min%', 'max%', 'BIMODAL', 'FLIP', 'VERDICT'];
const header =
  cols[0]!.padEnd(16) +
  cols
    .slice(1)
    .map((c) => c.padStart(10))
    .join('');
console.log(header);
console.log('-'.repeat(header.length));

for (let g = 0; g < SCALAR_GENE_COUNT; g++) {
  const iqrPcts = perSeed.map((r) => r.stats[g]!.iqrPct);
  const bimodalCount = perSeed.filter((r) => r.stats[g]!.bimodal).length;
  const medIqr = median(iqrPcts);
  // Per-seed verdict (a seed PROMOTEs if its own IQR clears the bar OR it's bimodal on that seed).
  const seedPromotes = perSeed.map((r) => r.stats[g]!.iqrPct >= 0.1 || r.stats[g]!.bimodal);
  const flip = seedPromotes.some((p) => p) && seedPromotes.some((p) => !p);
  const bimodal = bimodalCount > seeds.length / 2; // bimodal on a majority of seeds
  const verdict = medIqr >= 0.1 || bimodal ? 'PROMOTE' : 'FLAT';
  const row =
    GENE_LABELS[g]!.padEnd(16) +
    [
      `${(100 * medIqr).toFixed(1)}%`,
      `${(100 * Math.min(...iqrPcts)).toFixed(1)}%`,
      `${(100 * Math.max(...iqrPcts)).toFixed(1)}%`,
      bimodal ? 'BIMODAL' : '-',
      flip ? 'FLIP' : '-',
      verdict,
    ]
      .map((v) => v.padStart(10))
      .join('');
  console.log(row);
}
