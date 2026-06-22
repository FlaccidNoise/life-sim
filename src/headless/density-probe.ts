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
  sizeMean: number;
  sizeSd: number;
  meanSpeed: number;
  occPct: number;
  maxBucket: number;
  turnSatPct: number;
  thrustSatPct: number;
  drift: number;
  births: number;
  deaths: number;
  shelterIdx: number; // mean dist from each SMALL creature to its nearest ≥1.3×-larger creature (lower = more sheltering)
  schoolSim: number; // mean hue-similarity (∈[0,1]) of each creature to its NEAREST neighbor (higher = like-color schools)
}

function measure(world: World): Metrics {
  const s = world.store;
  const { liveIndices, liveCount, vx, vy, heading, senseX, senseY, sightX, sightY } = s;
  const { learnedBrain, brain, scalarGenes } = s;
  if (liveCount === 0) {
    return {
      pop: 0,
      herb: 0,
      pred: 0,
      visRange: 0,
      visAcuity: 0,
      diet: 0,
      sizeMean: 0,
      sizeSd: 0,
      meanSpeed: 0,
      occPct: 0,
      maxBucket: 0,
      turnSatPct: 0,
      thrustSatPct: 0,
      drift: 0,
      births: world.totalBirths,
      deaths: world.totalDeaths,
      shelterIdx: 0,
      schoolSim: 0,
    };
  }
  let herb = 0;
  let pred = 0;
  let vr = 0;
  let va = 0;
  let dietSum = 0;
  let sizeSum = 0;
  let speedSum = 0;
  const sizes: number[] = [];
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
    const szv = scalarGenes[sg + ScalarGene.SIZE]!;
    sizeSum += szv;
    sizes.push(szv);
    speedSum += Math.hypot(vx[i]!, vy[i]!);
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
  // Shelter index: for each SMALL creature (size below the population median), the toroidal distance to
  // the nearest creature ≥1.3× its size. Mean over small creatures. Lower = small bodies sit closer to
  // big bodies = more sheltering/clustering. O(n²) brute force — fine at probe populations.
  const ww = world.config.worldWidth;
  const wh = world.config.worldHeight;
  const sortedSizes = [...sizes].sort((a, b) => a - b);
  const medSize = sortedSizes[Math.floor(sortedSizes.length / 2)]!;
  let shelterSum = 0;
  let shelterN = 0;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const szi = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SIZE]!;
    if (szi >= medSize) continue; // only the small half seeks shelter
    let best = Infinity;
    for (let m = 0; m < liveCount; m++) {
      if (m === k) continue;
      const j = liveIndices[m]!;
      if (scalarGenes[j * SCALAR_GENE_COUNT + ScalarGene.SIZE]! < szi * 1.3) continue; // not "much larger"
      let dx = Math.abs(s.x[j]! - s.x[i]!);
      let dy = Math.abs(s.y[j]! - s.y[i]!);
      if (dx > ww * 0.5) dx = ww - dx;
      if (dy > wh * 0.5) dy = wh - dy;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
    if (best < Infinity) {
      shelterSum += Math.sqrt(best);
      shelterN++;
    }
  }
  // School similarity: for each creature, the hue-similarity to its NEAREST neighbor (any), meaned over
  // all. A local pairwise measure → robust to population-composition shifts (unlike shelterIdx). Higher =
  // neighbors share a lineage color = schools. O(n²) brute force, fine at probe populations.
  let schoolSum = 0;
  let schoolN = 0;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    let best = Infinity;
    let bestJ = -1;
    for (let m = 0; m < liveCount; m++) {
      if (m === k) continue;
      const j = liveIndices[m]!;
      let dx = Math.abs(s.x[j]! - s.x[i]!);
      let dy = Math.abs(s.y[j]! - s.y[i]!);
      if (dx > ww * 0.5) dx = ww - dx;
      if (dy > wh * 0.5) dy = wh - dy;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) {
        best = d2;
        bestJ = j;
      }
    }
    if (bestJ >= 0) {
      let hd = Math.abs(s.hue[i]! - s.hue[bestJ]!);
      if (hd > 0.5) hd = 1 - hd;
      schoolSum += 1 - 2 * hd;
      schoolN++;
    }
  }
  const hs = world.hash.stats();
  return {
    pop: liveCount,
    herb,
    pred,
    visRange: vr / liveCount,
    visAcuity: va / liveCount,
    diet: dietSum / liveCount,
    sizeMean: sizeSum / liveCount,
    sizeSd: Math.sqrt(sizes.reduce((a, v) => a + (v - sizeSum / liveCount) ** 2, 0) / liveCount),
    meanSpeed: speedSum / liveCount,
    occPct: (100 * hs.occupied) / hs.buckets,
    maxBucket: hs.maxBucket,
    turnSatPct: (100 * turnSat) / liveCount,
    thrustSatPct: (100 * thrustSat) / liveCount,
    drift: driftSum / liveCount,
    births: world.totalBirths,
    deaths: world.totalDeaths,
    shelterIdx: shelterN > 0 ? shelterSum / shelterN : 0,
    schoolSim: schoolN > 0 ? schoolSum / schoolN : 0,
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
// OBLIGATE-CARNIVORY sweep: raise herbivoryExp so predators get ~nothing from algae → forced to HUNT
// (more active behavior). Want predators AND herbivores to coexist (real predator/prey), higher
// meanSpeed (active not passive), and more size variance (szSd). Tested on 2 seeds.
// Find the highest herbivoryExp where predators still PERSIST (max hunting pressure, still alive), with
// sizeCost 0.015 locked for more size variance. Two seeds for robustness.
// SHELTER-SEEKING ablation: shelterGain 0 (off) vs 1 (on) on seeds 1/2/5. Want shelterIdx to DROP with
// shelter on (small bodies sit closer to big ones = clustering) AND the world to stay alive (pop>0,
// births>0) on every seed. shelterIdx printed last.
// SCHOOLING ablation: cohesionGain 0 (off) vs 1 (on) on seeds 1/2/5. Want schoolSim to RISE with
// cohesion on (nearest neighbors share a lineage color = schools) AND the world to stay alive on every
// seed. schoolSim is the last column; shelterIdx kept for context (shelter is on at its default).
// VARIETY sweep: wider founder spread + slower/richer food vs the current baseline, seeds 1/5. Want
// MORE size/trophic variety (szSd, diet) and predators present, while staying alive (pop>0). Slower
// regen → boom-bust that rewards migration; wider founderSigma → more raw material from t0.
const CASES: { label: string; o: Partial<Config> }[] = [
  { label: 'base        s1', o: {} },
  { label: 'fSig.6      s1', o: { founderSigma: 0.6 } },
  { label: 'regen.04    s1', o: { foodRegen: 0.04 } },
  { label: 'regen.04cap20 s1', o: { foodRegen: 0.04, foodCap: 20 } },
  { label: 'base        s5', o: { seed: 5 } },
  { label: 'fSig.6      s5', o: { founderSigma: 0.6, seed: 5 } },
  { label: 'regen.04    s5', o: { foodRegen: 0.04, seed: 5 } },
  { label: 'regen.04cap20 s5', o: { foodRegen: 0.04, foodCap: 20, seed: 5 } },
];

console.log(`=== density + ablation probe: ${ticks} ticks, seed ${seed}, world 8192² ===\n`);
const header =
  'case'.padEnd(28) +
  [
    'pop',
    'herb',
    'pred',
    'size',
    'szSd',
    'diet',
    'spd',
    'visR',
    'occ%',
    'turnSat%',
    'drift',
    'shelterIdx',
    'schoolSim',
  ]
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
      m.sizeMean.toFixed(1),
      m.sizeSd.toFixed(1),
      m.diet.toFixed(2),
      m.meanSpeed.toFixed(2),
      m.visRange.toFixed(0),
      m.occPct.toFixed(2),
      m.turnSatPct.toFixed(0),
      m.drift.toFixed(1),
      m.shelterIdx.toFixed(0),
      m.schoolSim.toFixed(2),
    ]
      .map((v) => v.padStart(9))
      .join('');
  console.log(row);
}
