/**
 * F2 pheromone BREATHING probe — at the shipped 8192² scale with pheromoneEnabled=true, does the field
 * actually populate (mean/max P > 0) and does the PHERO_FWD_THRUST brain gene evolve AWAY from its
 * founder 0 over a few thousand ticks (i.e. does selection pick a flee-or-aggregate response)?
 *
 * Honest diagnostic — it's fine if the field populates but the gene does NOT move off 0 yet (that just
 * means at this scale/economy the pheromone response isn't paying for itself, like vision evolved DOWN).
 * Run: npx tsx src/headless/phero-probe.ts
 */
import { defaultConfig } from '../core/config';
import { World } from '../core/world';
import { Brain, BRAIN_GENES } from '../core/genome';

const TICKS = 4000;
const SEED = 1;

function meanPheroGene(w: World, gene: number): number {
  const s = w.store;
  s.rebuildLive();
  let sum = 0;
  let n = 0;
  for (let k = 0; k < s.liveCount; k++) {
    const i = s.liveIndices[k]!;
    sum += s.brain[i * BRAIN_GENES + gene]!;
    n++;
  }
  return n > 0 ? sum / n : 0;
}

function absMeanPheroGene(w: World, gene: number): number {
  const s = w.store;
  s.rebuildLive();
  let sum = 0;
  let n = 0;
  for (let k = 0; k < s.liveCount; k++) {
    const i = s.liveIndices[k]!;
    sum += Math.abs(s.brain[i * BRAIN_GENES + gene]!);
    n++;
  }
  return n > 0 ? sum / n : 0;
}

const w = new World(defaultConfig({ seed: SEED, pheromoneEnabled: true }));
const cells = w.config.foodCols * w.config.foodRows;

console.log(`=== F2 pheromone breathing probe: ${TICKS} ticks, seed ${SEED}, world 8192² ===\n`);
const header =
  'tick'.padStart(6) +
  'pop'.padStart(8) +
  'meanP'.padStart(12) +
  'maxP'.padStart(12) +
  'fwdThrust'.padStart(12) +
  '|fwdThr|'.padStart(12) +
  'latTurn'.padStart(12) +
  '|latTurn|'.padStart(12);
console.log(header);
console.log('-'.repeat(header.length));

const sample = (tick: number): void => {
  const phero = w.phero!;
  const meanP = phero.total() / cells;
  const row =
    `${tick}`.padStart(6) +
    `${w.population}`.padStart(8) +
    meanP.toExponential(3).padStart(12) +
    phero.max().toExponential(3).padStart(12) +
    meanPheroGene(w, Brain.PHERO_C0_FWD_THRUST).toFixed(5).padStart(12) +
    absMeanPheroGene(w, Brain.PHERO_C0_FWD_THRUST).toFixed(5).padStart(12) +
    meanPheroGene(w, Brain.PHERO_C0_LAT_TURN).toFixed(5).padStart(12) +
    absMeanPheroGene(w, Brain.PHERO_C0_LAT_TURN).toFixed(5).padStart(12);
  console.log(row);
};

sample(0);
for (let t = 1; t <= TICKS; t++) {
  w.step();
  if (t % 500 === 0) sample(t);
}

console.log('\nInterpretation:');
console.log('- meanP/maxP > 0  → the field POPULATES (deposit-on-graze is firing at scale).');
console.log(
  '- |fwdThr| / |latTurn| drifting UP from 0 → selection is finding a pheromone response (breathing-capable).',
);
console.log(
  '- signed mean near 0 but |mean| up → split signs (some flee, some aggregate) — also a real signal.',
);
console.log(
  '- |mean| staying ~0 → the response does NOT pay at this scale yet (like vision evolving down); honest null.',
);
