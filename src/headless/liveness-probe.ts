/**
 * Liveness guardrail (brain consolidation): run the demo config across several seeds and report final
 * population + total births/deaths, to prove the unified brain doesn't crash the population to extinction.
 * Run: npx tsx src/headless/liveness-probe.ts [ticks] [seeds]
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { DEMO_OVERRIDES } from './life-history';

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
  process.stdout.write(
    `seed ${seed}: start ${startPop} → end ${endPop} pop · births ${world.totalBirths} · deaths ${world.totalDeaths}\n`,
  );
}
process.stdout.write(allLive ? 'LIVENESS: PASS (no extinction)\n' : 'LIVENESS: FAIL (extinction)\n');
process.exit(allLive ? 0 : 1);
