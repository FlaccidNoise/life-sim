/**
 * Long-horizon liveness + emergence probe for the LIVE DEMO config (src/app/living-world-config.ts — the
 * exact world the browser runs). Runs one or more seeds for N ticks and samples the trajectory + the
 * standing-population trait distribution, so we can see (a) the world stays alive and breathing over very
 * long runs, and (b) genuine emergent diversity + evolutionary drift (diet/forage niches, vision/size/speed
 * means moving in response to the environment). Asserts liveness per seed and exits non-zero on failure, so
 * it doubles as a CI gate for the overnight demo.
 *
 * Run: npx tsx src/headless/long-run.ts [ticks] [seeds] [sampleStride]
 *   seeds: "1" · "1,3,7" · "1-4".  Default "1".   ticks default 120000.   stride default 10000.
 */
import { World } from '../core/world';
import { defaultConfig } from '../core/config';
import { ScalarGene } from '../core/genome';
import { livingWorldOverrides } from '../app/living-world-config';

const POS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const TICKS = Number(POS[0] ?? 120000);
const STRIDE = Number(POS[2] ?? 10000);

function parseSeeds(s: string | undefined): number[] {
  if (!s) return [1];
  if (s.includes('-')) {
    const [a, b] = s.split('-').map(Number);
    const out: number[] = [];
    for (let i = a!; i <= b!; i++) out.push(i);
    return out;
  }
  return s.split(',').map(Number);
}
const SEEDS = parseSeeds(POS[1]);

function meanVar(xs: number[]): { mean: number; sd: number } {
  if (xs.length === 0) return { mean: NaN, sd: NaN };
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length;
  return { mean: m, sd: Math.sqrt(v) };
}

// Read a scalar gene across the standing population.
function geneCol(world: World, gene: number): number[] {
  const { liveIndices, liveCount, scalarGenes } = world.store;
  const stride = scalarGenes.length / world.store.capacity;
  const out: number[] = [];
  for (let n = 0; n < liveCount; n++) {
    const slot = liveIndices[n]!;
    out.push(scalarGenes[slot * stride + gene]!);
  }
  return out;
}

interface SeedResult {
  seed: number;
  alive: boolean;
  finalPop: number;
  births: number;
  deaths: number;
  problems: string[];
}

function runSeed(seed: number): SeedResult {
  const config = defaultConfig({ seed, ...livingWorldOverrides });
  const world = new World(config);
  const cap = config.maxOrganisms;

  console.log(`\n=== seed ${seed} · ${TICKS} ticks · world ${config.worldWidth}² · cap ${cap} ===`);
  console.log(
    'tick      pop    food    b/kt   d/kt  | diet μ±σ      forage σ  vision μ  size μ  speed μ',
  );

  let prevB = 0;
  let prevD = 0;
  let minPop = Infinity;
  let maxPop = 0;
  let sawZeroPop = false;
  let pegged = false;

  for (let t = 1; t <= TICKS; t++) {
    world.step();
    const pop = world.population;
    if (pop <= 0) sawZeroPop = true;
    if (pop >= cap) pegged = true;
    if (pop < minPop) minPop = pop;
    if (pop > maxPop) maxPop = pop;

    if (t % STRIDE === 0 || t === TICKS) {
      const food = world.food.total();
      const dB = world.totalBirths - prevB;
      const dD = world.totalDeaths - prevD;
      prevB = world.totalBirths;
      prevD = world.totalDeaths;
      const diet = meanVar(geneCol(world, ScalarGene.DIET));
      const forage = meanVar(geneCol(world, ScalarGene.FORAGE_PREF));
      const vis = meanVar(geneCol(world, ScalarGene.VISION_RANGE));
      const size = meanVar(geneCol(world, ScalarGene.SIZE));
      const spd = meanVar(geneCol(world, ScalarGene.MAX_SPEED));
      const bRate = (dB / STRIDE) * 1000;
      const dRate = (dD / STRIDE) * 1000;
      console.log(
        `${String(t).padEnd(8)}${String(pop).padEnd(7)}${food.toFixed(0).padEnd(8)}` +
          `${bRate.toFixed(1).padEnd(7)}${dRate.toFixed(1).padEnd(6)}| ` +
          `${diet.mean.toFixed(2)}±${diet.sd.toFixed(2)}   ${forage.sd.toFixed(3)}     ` +
          `${vis.mean.toFixed(0).padEnd(8)} ${size.mean.toFixed(1).padEnd(6)} ${spd.mean.toFixed(1)}`,
      );
    }
  }

  const problems: string[] = [];
  if (sawZeroPop || world.population <= 0) problems.push('went extinct (pop hit 0)');
  if (world.totalBirths <= 0) problems.push('zero births');
  if (world.totalDeaths <= 0) problems.push('zero deaths');
  if (pegged) problems.push(`pegged at cap ${cap} (runaway)`);
  if (world.food.total() <= 0) problems.push('food fully exhausted');

  console.log(
    `seed ${seed}: ${problems.length === 0 ? 'PASS' : 'FAIL'} · final pop ${world.population} · ` +
      `pop range [${minPop}, ${maxPop}] · births ${world.totalBirths} · deaths ${world.totalDeaths}` +
      (problems.length ? ` · PROBLEMS: ${problems.join(', ')}` : ''),
  );

  return {
    seed,
    alive: problems.length === 0,
    finalPop: world.population,
    births: world.totalBirths,
    deaths: world.totalDeaths,
    problems,
  };
}

const results = SEEDS.map(runSeed);
const failed = results.filter((r) => !r.alive);
console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} seeds alive ===`);
for (const r of results) {
  console.log(
    `  seed ${r.seed}: ${r.alive ? 'ALIVE' : 'DEAD'} pop ${r.finalPop} births ${r.births}` +
      (r.problems.length ? ` (${r.problems.join('; ')})` : ''),
  );
}
if (failed.length > 0) process.exit(1);
