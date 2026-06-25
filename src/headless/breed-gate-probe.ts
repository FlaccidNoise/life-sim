/**
 * A2c measurement probe (brain-gated breeding). Read-only. Runs the demo config (brainGatedBreeding ON by
 * default) and reports, over the live population at the end:
 *   - pop (liveness)
 *   - the breedGate (0..1) distribution: mean + [min..max] spread + the fraction BELOW breedGateThreshold
 *     (= "gating breeding off").
 * Selection should keep the gate OPEN (not-breeding is selected against), so expect mean ≈ the seeded ≈0.98
 * and ~0% below threshold. If it stays open, the gate is wired + live but breeding-TIMING isn't modulated
 * (there's no fitness benefit to deferring) — REPORT THAT honestly, do not claim modulation. If a fraction
 * gates breeding off while the population still survives, quote it.
 * Run: npx tsx src/headless/breed-gate-probe.ts [ticks] [seed]
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { DEMO_OVERRIDES } from './life-history';

const TICKS = Number(process.argv[2] ?? 8000);
const SEED = Number(process.argv[3] ?? 1);

const config: Config = defaultConfig({ seed: SEED, ...(DEMO_OVERRIDES as Partial<Config>) });
const world = new World(config);
for (let t = 0; t < TICKS; t++) world.step();

const s = world.store;
const { liveIndices, liveCount, breedGate } = s;
const threshold = world.config.breedGateThreshold;

let sum = 0,
  min = Infinity,
  max = -Infinity,
  below = 0;
for (let k = 0; k < liveCount; k++) {
  const g = breedGate[liveIndices[k]!]!;
  sum += g;
  if (g < min) min = g;
  if (g > max) max = g;
  if (g < threshold) below++;
}
const mean = liveCount ? sum / liveCount : NaN;
const fracBelow = liveCount ? (100 * below) / liveCount : NaN;

process.stdout.write(`brainGatedBreeding ${world.config.brainGatedBreeding ? 'ON' : 'OFF'} — pop ${liveCount} (ticks ${TICKS} seed ${SEED})\n`);
if (liveCount) {
  process.stdout.write(
    `   breedGate: mean ${mean.toFixed(3)} [${min.toFixed(3)}..${max.toFixed(3)}] · ` +
      `below threshold (${threshold}) ${below}/${liveCount} = ${fracBelow.toFixed(1)}% (= gating breeding off)\n`,
  );
} else {
  process.stdout.write('   breedGate: n/a (population extinct)\n');
}
process.stdout.write(
  'INTERPRET: mean ≈ seeded(≈0.98) + ~0% below threshold ⇒ the gate is wired + live but stays OPEN — selection\n' +
    '           keeps it open (not-breeding is selected against); breeding-TIMING is NOT modulated (no benefit to\n' +
    '           deferring). Say so. A nonzero below-threshold fraction (with pop surviving) = some gating off.\n',
);
