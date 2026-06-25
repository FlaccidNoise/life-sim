/**
 * A2b measurement: is the brain-gated scent deposit a MODULATED decision or a stuck-open reflex? Unlike A2a's
 * bite (predators go extinct), scent operates on the LIVE grazer-dominated population, so the gate is far more
 * likely to actually engage. Runs the demo config brainGatedScent ON vs OFF and reports, over the live
 * population, the evolved scentGate mean + spread [min..max] + the fraction "going silent" (gate < 0.5).
 * Read-only. Run: npx tsx src/headless/scent-gate-probe.ts [ticks] [seed]
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { DEMO_OVERRIDES } from './life-history';

const TICKS = Number(process.argv[2] ?? 8000);
const SEED = Number(process.argv[3] ?? 1);

for (const brainGatedScent of [false, true]) {
  const config: Config = defaultConfig({ seed: SEED, ...(DEMO_OVERRIDES as Partial<Config>), brainGatedScent });
  const world = new World(config);
  for (let t = 0; t < TICKS; t++) world.step();
  const s = world.store;
  const pop = s.liveCount;
  let gSum = 0, gMin = 1, gMax = 0, silent = 0;
  for (let k = 0; k < pop; k++) {
    const g = s.scentGate[s.liveIndices[k]!]!;
    gSum += g; if (g < gMin) gMin = g; if (g > gMax) gMax = g;
    if (g < 0.5) silent++;
  }
  process.stdout.write(
    `brainGatedScent ${brainGatedScent ? 'ON ' : 'OFF'} — pop ${pop}` +
    (brainGatedScent && pop
      ? ` | scentGate mean ${(gSum / pop).toFixed(3)} [${gMin.toFixed(2)}..${gMax.toFixed(2)}] · going-silent (<0.5) ${((100 * silent) / pop).toFixed(1)}% of ${pop}`
      : '') + '\n',
  );
}
process.stdout.write('INTERPRET: scentGate mean ≈0.9+ with a tiny spread ⇒ wired+live but NOT recruited (scent deposit has no\n' +
  '           direct energy cost, so no selection pressure toward silence). A real spread + a meaningful going-silent%\n' +
  '           ⇒ the gate is MODULATED — quote it. Do not claim modulation the numbers do not support.\n');
