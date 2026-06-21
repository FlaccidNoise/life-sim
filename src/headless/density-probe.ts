/**
 * Density + ablation probe (one-off experiment, not a standing job). Runs several configs to the same
 * tick count and reports, on the final live population:
 *   - demographics: pop, herbivores, predators
 *   - perception under selection: mean visionRange / visionAcuity (do eyes grow or shrink?)
 *   - ENCOUNTER RATE proxy: hash occupancy % + max bucket (how often creatures actually meet)
 *   - the SPIN hypothesis: % of creatures whose turn/thrust output is pinned at its clamp (saturated →
 *     constant rotation / full thrust regardless of input = "vibrating / spinning in place"), + mean
 *     learning drift (how far the runtime brain has run from instinct).
 *
 * Variables (big 8192² world kept throughout, per the owner): pocket COUNT (closer ↔ spread) and SIZE,
 * plus the learning and cannibalism off-switches. Run: pnpm tsx src/headless/density-probe.ts [ticks]
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { Brain, BRAIN_GENES, ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';

const ticks = Number(process.argv[2] ?? 10000);
const seed = 1;

interface Metrics {
  pop: number;
  herb: number;
  pred: number;
  visRange: number;
  visAcuity: number;
  diet: number;
  occPct: number;
  maxBucket: number;
  turnSatPct: number;
  thrustSatPct: number;
  drift: number;
  births: number;
  deaths: number;
}

function measure(world: World): Metrics {
  const s = world.store;
  const { liveIndices, liveCount, heading, senseX, senseY, sightX, sightY } = s;
  const { learnedBrain, brain, scalarGenes } = s;
  if (liveCount === 0) {
    return {
      pop: 0,
      herb: 0,
      pred: 0,
      visRange: 0,
      visAcuity: 0,
      diet: 0,
      occPct: 0,
      maxBucket: 0,
      turnSatPct: 0,
      thrustSatPct: 0,
      drift: 0,
      births: world.totalBirths,
      deaths: world.totalDeaths,
    };
  }
  let herb = 0;
  let pred = 0;
  let vr = 0;
  let va = 0;
  let dietSum = 0;
  let turnSat = 0;
  let thrustSat = 0;
  let driftSum = 0;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const sg = i * SCALAR_GENE_COUNT;
    const diet = scalarGenes[sg + ScalarGene.DIET]!;
    dietSum += diet;
    if (diet >= 0.5) pred++;
    else herb++;
    vr += scalarGenes[sg + ScalarGene.VISION_RANGE]!;
    va += scalarGenes[sg + ScalarGene.VISION_ACUITY]!;
    // Recompute the brain's motor output to test saturation (steer()'s math).
    const h = heading[i]!;
    const dx = Math.cos(h);
    const dy = Math.sin(h);
    const gx = senseX[i]!;
    const gy = senseY[i]!;
    const fwd = gx * dx + gy * dy;
    const lat = -gx * dy + gy * dx;
    const sx = sightX[i]!;
    const sy = sightY[i]!;
    const sFwd = sx * dx + sy * dy;
    const sLat = -sx * dy + sy * dx;
    const b = i * BRAIN_GENES;
    const turnRaw =
      learnedBrain[b + Brain.LAT_TURN]! * lat +
      learnedBrain[b + Brain.FWD_TURN]! * fwd +
      learnedBrain[b + Brain.SIGHT_LAT_TURN]! * sLat +
      learnedBrain[b + Brain.SIGHT_FWD_TURN]! * sFwd +
      learnedBrain[b + Brain.TURN_BIAS]!;
    const thrustRaw =
      learnedBrain[b + Brain.LAT_THRUST]! * lat +
      learnedBrain[b + Brain.FWD_THRUST]! * fwd +
      learnedBrain[b + Brain.SIGHT_LAT_THRUST]! * sLat +
      learnedBrain[b + Brain.SIGHT_FWD_THRUST]! * sFwd +
      learnedBrain[b + Brain.THRUST_BIAS]!;
    const maxTurn = scalarGenes[sg + ScalarGene.MAX_TURN]!;
    const maxThrust = scalarGenes[sg + ScalarGene.MAX_THRUST]!;
    if (Math.abs(turnRaw) >= maxTurn * 0.999) turnSat++;
    if (thrustRaw >= maxThrust * 0.999) thrustSat++;
    for (let g = 0; g < BRAIN_GENES; g++)
      driftSum += Math.abs(learnedBrain[b + g]! - brain[b + g]!);
  }
  const hs = world.hash.stats();
  return {
    pop: liveCount,
    herb,
    pred,
    visRange: vr / liveCount,
    visAcuity: va / liveCount,
    diet: dietSum / liveCount,
    occPct: (100 * hs.occupied) / hs.buckets,
    maxBucket: hs.maxBucket,
    turnSatPct: (100 * turnSat) / liveCount,
    thrustSatPct: (100 * thrustSat) / liveCount,
    drift: driftSum / liveCount,
    births: world.totalBirths,
    deaths: world.totalDeaths,
  };
}

function run(label: string, overrides: Partial<Config>): { label: string; m: Metrics } {
  const cfg = defaultConfig({ seed, ...overrides });
  const world = new World(cfg);
  for (let t = 0; t < ticks; t++) world.step();
  return { label, m: measure(world) };
}

// Ablations of the NEW defaults (sight weights + reward learning + predation economy + tuning): each
// case flips one lever back so we can see its individual effect on predators / vision / liveness.
// Facultative-predator search: a plant fallback (low herbivoryExp) so predators survive sparse stretches,
// + a modest hunting bonus + moderate bite. Want predators present but not dominant, herbivores the
// majority, pop well below the 32768 cap.
// CONSERVATION (gain1): verify predators viable AND no runaway-to-cap, incl. the seed5/initPop600 case
// that pegged the cap under gain1.5. Want pred>0 on s1 cases and pop ≪ 32768 on the s5 cases.
const CASES: { label: string; o: Partial<Config> }[] = [
  { label: 'defaults s1', o: {} },
  { label: 'defaults s5 ip600', o: { seed: 5, initialPopulation: 600 } },
  { label: 'exp1 s1', o: { herbivoryExp: 1 } },
  { label: 'exp1 bite24 s1', o: { herbivoryExp: 1, biteRange: 24 } },
  { label: 'exp1 s5 ip600', o: { herbivoryExp: 1, seed: 5, initialPopulation: 600 } },
  { label: 'bite24 s1', o: { biteRange: 24 } },
];

console.log(`=== density + ablation probe: ${ticks} ticks, seed ${seed}, world 8192² ===\n`);
const header =
  'case'.padEnd(28) +
  ['pop', 'herb', 'pred', 'visR', 'visA', 'diet', 'occ%', 'maxBk', 'turnSat%', 'thrSat%', 'drift']
    .map((h) => h.padStart(9))
    .join('');
console.log(header);
console.log('-'.repeat(header.length));
for (const c of CASES) {
  const { label, m } = run(c.label, c.o);
  const row =
    label.padEnd(28) +
    [
      `${m.pop}`,
      `${m.herb}`,
      `${m.pred}`,
      m.visRange.toFixed(1),
      m.visAcuity.toFixed(2),
      m.diet.toFixed(2),
      m.occPct.toFixed(2),
      `${m.maxBucket}`,
      m.turnSatPct.toFixed(0),
      m.thrustSatPct.toFixed(0),
      m.drift.toFixed(1),
    ]
      .map((v) => v.padStart(9))
      .join('');
  console.log(row);
}
