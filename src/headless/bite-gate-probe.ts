/**
 * A2a measurement: does brain-gated bite suppress the (already engine-ceiling-fragile) predation? Runs the
 * demo config brainGatedBiting ON vs OFF and reports predator fraction + the evolved biteGate spread across
 * predators. Read-only. Run: npx tsx src/headless/bite-gate-probe.ts [ticks] [seed]
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';
import { DEMO_OVERRIDES } from './life-history';

const TICKS = Number(process.argv[2] ?? 8000);
const SEED = Number(process.argv[3] ?? 1);

for (const brainGatedBiting of [false, true]) {
  const config: Config = defaultConfig({ seed: SEED, ...(DEMO_OVERRIDES as Partial<Config>), brainGatedBiting });
  const world = new World(config);
  for (let t = 0; t < TICKS; t++) world.step();
  const s = world.store;
  let pred = 0, dietSum = 0, gSum = 0, gMin = 1, gMax = 0;
  for (let k = 0; k < s.liveCount; k++) {
    const i = s.liveIndices[k]!;
    const diet = s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET]!;
    dietSum += diet;
    if (diet >= 0.5) {
      pred++;
      const g = s.biteGate[i]!;
      gSum += g; if (g < gMin) gMin = g; if (g > gMax) gMax = g;
    }
  }
  const pop = s.liveCount;
  process.stdout.write(
    `brainGatedBiting ${brainGatedBiting ? 'ON ' : 'OFF'} — pop ${pop} predFrac ${((100 * pred) / Math.max(1, pop)).toFixed(1)}% meanDiet ${(dietSum / Math.max(1, pop)).toFixed(3)}` +
    (brainGatedBiting ? ` | predators' biteGate mean ${pred ? (gSum / pred).toFixed(3) : 'n/a'} [${gMin.toFixed(2)}..${gMax.toFixed(2)}] over ${pred} predators` : '') + '\n',
  );
}
process.stdout.write('INTERPRET: predFrac ON vs OFF (suppression?) + the predators biteGate mean (evolving shut → suppression; ~open → not). NB engine ceiling: predation is fragile regardless.\n');
