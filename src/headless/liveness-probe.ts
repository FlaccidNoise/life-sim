/**
 * Liveness guardrail (brain consolidation): run the demo config across several seeds and report final
 * population + total births/deaths, to prove the unified brain doesn't crash the population to extinction.
 * Run: npx tsx src/headless/liveness-probe.ts [ticks] [seeds]
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';
import { DEMO_OVERRIDES } from './life-history';

/** mean + population std of a scalar gene over the live creatures (a divergence indicator). */
function geneStats(world: World, gene: number): { mean: number; std: number } {
  const s = world.store;
  const { liveIndices, liveCount, scalarGenes } = s;
  if (liveCount === 0) return { mean: NaN, std: NaN };
  let sum = 0;
  for (let k = 0; k < liveCount; k++) sum += scalarGenes[liveIndices[k]! * SCALAR_GENE_COUNT + gene]!;
  const mean = sum / liveCount;
  let v = 0;
  for (let k = 0; k < liveCount; k++) {
    const d = scalarGenes[liveIndices[k]! * SCALAR_GENE_COUNT + gene]! - mean;
    v += d * d;
  }
  return { mean, std: Math.sqrt(v / liveCount) };
}

const TICKS = Number(process.argv[2] ?? 4000);
const SEEDS = Number(process.argv[3] ?? 3);
// Extra k=v overrides (coerce true/false/number) — e.g. hiddenLayer=false brainGatedEating=false for a
// pre-merge-like baseline comparison.
const extra: Record<string, unknown> = {};
for (const a of process.argv.slice(4)) {
  const [k, v] = a.split('=');
  if (!k || v === undefined) continue;
  extra[k] = v === 'true' ? true : v === 'false' ? false : isNaN(Number(v)) ? v : Number(v);
}

let allLive = true;
for (let seed = 1; seed <= SEEDS; seed++) {
  const config: Config = defaultConfig({ seed, ...(DEMO_OVERRIDES as Partial<Config>), ...extra });
  const world = new World(config);
  const startPop = world.population;
  for (let t = 0; t < TICKS; t++) world.step();
  const endPop = world.population;
  if (endPop <= 0) allLive = false;
  const pref = geneStats(world, ScalarGene.FORAGE_PREF);
  const diet = geneStats(world, ScalarGene.DIET);
  process.stdout.write(
    `seed ${seed}: start ${startPop} → end ${endPop} pop · births ${world.totalBirths} · deaths ${world.totalDeaths}\n` +
      `         FORAGE_PREF mean ${pref.mean.toFixed(2)} std ${pref.std.toFixed(2)} (std↑ = specialised/diverged) · ` +
      `DIET mean ${diet.mean.toFixed(2)} std ${diet.std.toFixed(2)}\n`,
  );
}
process.stdout.write(allLive ? 'LIVENESS: PASS (no extinction)\n' : 'LIVENESS: FAIL (extinction)\n');
process.exit(allLive ? 0 : 1);
