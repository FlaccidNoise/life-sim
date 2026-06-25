/**
 * Resilience probe: run the demo config across seeds and report the population TRAJECTORY — the
 * min-population floor (and the tick it bottoms out), end pop, births/deaths, and extinction count.
 * The min-floor across seeds is the resilience metric the "delicate/damped" work optimizes.
 * Run: npx tsx src/headless/resilience-probe.ts [ticks] [seeds] key=value...
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { DEMO_OVERRIDES } from './life-history';

const TICKS = Number(process.argv[2] ?? 6000);
const SEEDS = Number(process.argv[3] ?? 8);
const extra: Record<string, unknown> = {};
for (const a of process.argv.slice(4)) {
  const [k, v] = a.split('=');
  if (!k || v === undefined) continue;
  extra[k] = v === 'true' ? true : v === 'false' ? false : isNaN(Number(v)) ? v : Number(v);
}

let extinctions = 0;
const floors: number[] = [];
const ends: number[] = [];
let totBirths = 0;
let totDeaths = 0;

for (let seed = 1; seed <= SEEDS; seed++) {
  const config: Config = defaultConfig({ seed, ...(DEMO_OVERRIDES as Partial<Config>), ...extra });
  const world = new World(config);
  const startPop = world.population;
  let minPop = startPop;
  let minTick = 0;
  for (let t = 0; t < TICKS; t++) {
    world.step();
    const p = world.population;
    if (p < minPop) {
      minPop = p;
      minTick = t;
    }
  }
  const endPop = world.population;
  if (endPop <= 0) extinctions++;
  floors.push(minPop);
  ends.push(endPop);
  totBirths += world.totalBirths;
  totDeaths += world.totalDeaths;
  process.stdout.write(
    `seed ${seed}: start ${startPop} → min ${minPop} @t${minTick} → end ${endPop} · ` +
      `births ${world.totalBirths} deaths ${world.totalDeaths}\n`,
  );
}

const minFloor = Math.min(...floors);
const meanFloor = floors.reduce((a, b) => a + b, 0) / floors.length;
const meanEnd = ends.reduce((a, b) => a + b, 0) / ends.length;
process.stdout.write(
  `\nRESILIENCE (${SEEDS} seeds × ${TICKS}t): ` +
    `min-floor ${minFloor} · mean-floor ${meanFloor.toFixed(0)} · mean-end ${meanEnd.toFixed(0)} · ` +
    `extinctions ${extinctions}/${SEEDS} · births ${totBirths} deaths ${totDeaths}\n`,
);
process.exit(extinctions > 0 ? 1 : 0);
