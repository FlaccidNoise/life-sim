/**
 * Env alive-guardrail probe (the merge gate for the walls + flow env feature set). Runs the SHIPPED
 * defaultConfig (walls + flow on, push off) at the real demo scale across seeds [1,3,7,42] for 15000
 * ticks each and asserts, per seed, that the world stays ALIVE and breathing under the full env stack:
 *   - turnover: totalBirths > 0 AND totalDeaths > 0 (something is being born and dying)
 *   - not extinct: population > 0
 *   - food-limited, not buffer-pegged: population < maxOrganisms
 *   - food not fully dammed/starved: world.food.total() > 0
 * Also prints the wall solid fraction per seed (to tune wallDensity toward the 30–40% target).
 * Exits non-zero if ANY seed fails an assertion, so it can gate a merge.
 * Run: pnpm tsx src/headless/env-guardrail.ts
 */
import { World } from '../core/world';
import { defaultConfig } from '../core/config';

const SEEDS = [1, 3, 7, 42];
const TICKS = 15000;

interface SeedResult {
  seed: number;
  pop: number;
  births: number;
  deaths: number;
  food: number;
  wallFrac: number;
  maxOrganisms: number;
  problems: string[];
}

function runSeed(seed: number): SeedResult {
  const config = defaultConfig({ seed });
  const world = new World(config);
  for (let t = 0; t < TICKS; t++) world.step();

  const pop = world.population;
  const food = world.food.total();
  const problems: string[] = [];
  if (world.totalBirths <= 0) problems.push('zero births');
  if (world.totalDeaths <= 0) problems.push('zero deaths');
  if (pop <= 0) problems.push('extinct (population 0)');
  if (pop >= config.maxOrganisms) problems.push(`pegged at maxOrganisms (${config.maxOrganisms})`);
  if (food <= 0) problems.push('food fully dammed/starved (total 0)');

  return {
    seed,
    pop,
    births: world.totalBirths,
    deaths: world.totalDeaths,
    food,
    wallFrac: world.walls.solidFraction(),
    maxOrganisms: config.maxOrganisms,
    problems,
  };
}

console.log(
  `=== env alive-guardrail: ${SEEDS.length} seeds × ${TICKS} ticks (shipped defaultConfig) ===`,
);
const results = SEEDS.map(runSeed);

for (const r of results) {
  const verdict = r.problems.length === 0 ? 'PASS' : `FAIL (${r.problems.join('; ')})`;
  console.log(
    `seed ${String(r.seed).padStart(2)}: ` +
      `pop=${String(r.pop).padStart(5)} ` +
      `births=${String(r.births).padStart(6)} ` +
      `deaths=${String(r.deaths).padStart(6)} ` +
      `food=${String(Math.round(r.food)).padStart(8)} ` +
      `wallFrac=${(r.wallFrac * 100).toFixed(1)}%  ${verdict}`,
  );
}

const meanWallFrac = results.reduce((a, r) => a + r.wallFrac, 0) / results.length;
const failed = results.filter((r) => r.problems.length > 0);
console.log(`\nmean wallFrac: ${(meanWallFrac * 100).toFixed(1)}%`);
if (failed.length === 0) {
  console.log(`OVERALL: PASS — all ${SEEDS.length} seeds alive + breathing.`);
  process.exit(0);
}
console.log(
  `OVERALL: FAIL — ${failed.length}/${SEEDS.length} seed(s) died: ${failed.map((r) => r.seed).join(', ')}.`,
);
process.exit(1);
