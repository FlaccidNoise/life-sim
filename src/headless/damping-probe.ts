/**
 * Damping-distribution probe — evolves the world headless across several seeds and reports the EVOLVED
 * DAMPING gene distribution (mean / SD / min / max) per seed plus a cross-seed aggregate. Answers the
 * one open question from the evolvable-damping design: do drift AND dart strategies coexist, or does the
 * gene collapse to one end (a drifter-monoculture)? Pure observation — reads store.scalarGenes after the
 * run; zero core changes.
 *
 * Run: npx tsx src/headless/damping-probe.ts [ticks] [seeds]
 *   seeds: "5" (count 1..5) — default 5.   ticks default 8000.
 */
import { World } from '../core/world';
import { defaultConfig } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';

interface SeedStat {
  seed: number;
  pop: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
}

function dampingStats(world: World, seed: number): SeedStat {
  const { liveIndices, liveCount, scalarGenes } = world.store;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  const vals: number[] = [];
  for (let k = 0; k < liveCount; k++) {
    const d = scalarGenes[liveIndices[k]! * SCALAR_GENE_COUNT + ScalarGene.DAMPING]!;
    vals.push(d);
    sum += d;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  const mean = liveCount > 0 ? sum / liveCount : 0;
  let varSum = 0;
  for (const d of vals) varSum += (d - mean) ** 2;
  const sd = liveCount > 0 ? Math.sqrt(varSum / liveCount) : 0;
  return { seed, pop: liveCount, mean, sd, min: liveCount ? min : 0, max: liveCount ? max : 0 };
}

const ticks = Number(process.argv[2] ?? 8000);
const seedCount = Number(process.argv[3] ?? 5);

console.log(`=== damping probe: ${ticks} ticks × ${seedCount} seeds ===`);
console.log('seed |   pop |  mean |   sd  |  min  |  max');
const stats: SeedStat[] = [];
for (let seed = 1; seed <= seedCount; seed++) {
  const world = new World(defaultConfig({ seed }));
  for (let t = 0; t < ticks; t++) world.step();
  const s = dampingStats(world, seed);
  stats.push(s);
  console.log(
    `${String(seed).padStart(4)} | ${String(s.pop).padStart(5)} | ${s.mean.toFixed(3)} | ` +
      `${s.sd.toFixed(3)} | ${s.min.toFixed(3)} | ${s.max.toFixed(3)}`,
  );
}

const alive = stats.filter((s) => s.pop > 0);
const grandMean = alive.reduce((a, s) => a + s.mean, 0) / Math.max(1, alive.length);
const meanSd = alive.reduce((a, s) => a + s.sd, 0) / Math.max(1, alive.length);
console.log('---');
console.log(
  `aggregate (${alive.length}/${seedCount} alive): cross-seed mean ${grandMean.toFixed(3)}, ` +
    `mean within-seed SD ${meanSd.toFixed(3)}`,
);
console.log(
  meanSd < 0.03
    ? 'VERDICT: low spread → gene is collapsing toward a single strategy (monoculture risk).'
    : 'VERDICT: meaningful spread → drift/dart strategies coexist.',
);
