/**
 * Gene census: run the demo config across seeds and report each scalar gene's live-population mean / max /
 * min and how close the max sits to the gene's spec ceiling — to find which ranges are BINDING (railing at
 * their max → widening would give evolution room) vs slack (widening would be unused). Evidence for slice 3.
 * Run: npx tsx src/headless/gene-census.ts [ticks] [seeds] key=value...
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { SCALAR_GENE_SPECS, SCALAR_GENE_COUNT } from '../core/genome';
import { DEMO_OVERRIDES } from './life-history';

const TICKS = Number(process.argv[2] ?? 6000);
const SEEDS = Number(process.argv[3] ?? 6);
const extra: Record<string, unknown> = {};
for (const a of process.argv.slice(4)) {
  const [k, v] = a.split('=');
  if (!k || v === undefined) continue;
  extra[k] = v === 'true' ? true : v === 'false' ? false : isNaN(Number(v)) ? v : Number(v);
}

const G = SCALAR_GENE_COUNT;
// accumulate per-gene mean-of-means, max-of-maxes, min-of-mins across seeds
const sumMean: number[] = new Array<number>(G).fill(0);
const maxMax: number[] = new Array<number>(G).fill(-Infinity);
const minMin: number[] = new Array<number>(G).fill(Infinity);
let seedsLive = 0;

for (let seed = 1; seed <= SEEDS; seed++) {
  const config: Config = defaultConfig({ seed, ...(DEMO_OVERRIDES as Partial<Config>), ...extra });
  const world = new World(config);
  for (let t = 0; t < TICKS; t++) world.step();
  const s = world.store;
  const { liveIndices, liveCount, scalarGenes } = s;
  if (liveCount === 0) continue;
  seedsLive++;
  for (let g = 0; g < G; g++) {
    let sum = 0;
    let mx = -Infinity;
    let mn = Infinity;
    for (let k = 0; k < liveCount; k++) {
      const v = scalarGenes[liveIndices[k]! * G + g]!;
      sum += v;
      if (v > mx) mx = v;
      if (v < mn) mn = v;
    }
    sumMean[g]! += sum / liveCount;
    if (mx > maxMax[g]!) maxMax[g] = mx;
    if (mn < minMin[g]!) minMin[g] = mn;
  }
}

process.stdout.write(`gene census (${seedsLive}/${SEEDS} live seeds × ${TICKS}t)\n`);
process.stdout.write(
  `${'gene'.padEnd(20)} ${'min..max'.padEnd(14)} ${'pop-mean'.padStart(9)} ${'pop-max'.padStart(9)} ${'ceil%'.padStart(7)}  rail?\n`,
);
for (let g = 0; g < G; g++) {
  const spec = SCALAR_GENE_SPECS[g]!;
  const mean = sumMean[g]! / Math.max(1, seedsLive);
  const popMax = maxMax[g]!;
  const range = spec.max - spec.min;
  const ceilPct = range > 0 ? ((popMax - spec.min) / range) * 100 : 0; // how far the live max reaches into the range
  const rail = ceilPct >= 90 ? 'RAIL↑' : ceilPct <= 10 ? 'floor' : '';
  process.stdout.write(
    `${String(spec.centerKey).padEnd(20)} ${`${spec.min}..${spec.max}`.padEnd(14)} ` +
      `${mean.toFixed(2).padStart(9)} ${popMax.toFixed(2).padStart(9)} ${ceilPct.toFixed(0).padStart(6)}%  ${rail}\n`,
  );
}
