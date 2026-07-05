/**
 * Predator boom-bust A/B (experiment "b"). The live-demo config produces ONE big predator overshoot
 * (predators to ~65% of the population by ~t20k) that exhausts the grazer base and crashes to a small
 * remnant, leaving a low-diversity grazer world (observed in a 59k-tick browser run). This probe asks:
 * does tightening the predator economy or lowering predator seeding convert that boom-bust into a STABLE
 * predator minority?
 *
 * It runs the demo config plus each damping variant across seeds for a long horizon (default 60k ticks —
 * long enough to see the overshoot, the crash, AND whether it settles), sampling the trophic split + diet
 * spread, and reports the boom amplitude (peak predator %), the crash (post-peak trough %), the endpoint,
 * and a stability score (σ of predator % over the back half). A GOOD variant = a lower peak, a shallower
 * trough, and a non-trivial sustained predator fraction with low back-half σ. Read-only on the core; the
 * only differences between variants are the config deltas below.
 *
 * Run: npx tsx src/headless/predator-damping.ts [ticks] [seeds] [variants]
 *   ticks   default 60000
 *   seeds   "1" · "1,2,3" · "1-3"   (default "1,2,3")
 *   variants comma list to subset by name (default: all)
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { ScalarGene } from '../core/genome';
import { livingWorldOverrides } from '../app/living-world-config';
import { dietShape } from '../render/palette';

const POS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const TICKS = Number(POS[0] ?? 60000);
const SAMPLE = 2000;

function parseSeeds(s: string | undefined): number[] {
  if (!s) return [1, 2, 3];
  if (s.includes('-')) {
    const [a, b] = s.split('-').map(Number);
    const out: number[] = [];
    for (let i = a!; i <= b!; i++) out.push(i);
    return out;
  }
  return s.split(',').map(Number);
}
const SEEDS = parseSeeds(POS[1]);

// Each variant = the demo config plus one delta. Baseline is the demo as it ships (predatorFraction 0.3,
// predationGain 3, huntHandlingTime 0, satiatedThreshold 100 — the world that boom-busts).
interface Variant {
  name: string;
  note: string;
  delta: Partial<Config>;
}
const ALL_VARIANTS: Variant[] = [
  { name: 'baseline', note: 'demo as-is', delta: {} },
  { name: 'seed-0.2', note: 'lower predator seeding (0.3→0.2)', delta: { predatorFraction: 0.2 } },
  {
    name: 'seed-0.15',
    note: 'lower predator seeding (0.3→0.15)',
    delta: { predatorFraction: 0.15 },
  },
  {
    name: 'satiate-70',
    note: 'tighten satiation cap (100→70): predators stop hunting/hoarding sooner',
    delta: { satiatedThreshold: 70 },
  },
  {
    name: 'handling-15',
    note: 'Holling Type-II throttle: 15-tick refractory after a kill',
    delta: { huntHandlingTime: 15 },
  },
  {
    name: 'gain-2',
    note: 'lower hunting payoff (predationGain 3→2.0)',
    delta: { predationGain: 2 },
  },
  {
    name: 'gain-2.25',
    note: 'lower hunting payoff (predationGain 3→2.25)',
    delta: { predationGain: 2.25 },
  },
  {
    name: 'gain-2.5',
    note: 'lower hunting payoff (predationGain 3→2.5)',
    delta: { predationGain: 2.5 },
  },
  {
    name: 'gain-2.25-h4',
    note: 'combo: predationGain 2.25 + 4-tick handling refractory',
    delta: { predationGain: 2.25, huntHandlingTime: 4 },
  },
];
const wanted = POS[2]?.split(',');
const VARIANTS = wanted ? ALL_VARIANTS.filter((v) => wanted.includes(v.name)) : ALL_VARIANTS;

interface Sample {
  tick: number;
  pop: number;
  predFrac: number;
  dietSigma: number;
}

/** One O(pop) pass → trophic split fractions + diet σ (the bimodality signal). */
function snapshot(world: World, tick: number): Sample {
  const { liveIndices, liveCount, scalarGenes, capacity } = world.store;
  const stride = scalarGenes.length / capacity;
  let pred = 0;
  let dSum = 0;
  let dSq = 0;
  for (let k = 0; k < liveCount; k++) {
    const diet = scalarGenes[liveIndices[k]! * stride + ScalarGene.DIET]!;
    if (dietShape(diet) === 2) pred++;
    dSum += diet;
    dSq += diet * diet;
  }
  const mean = liveCount ? dSum / liveCount : 0;
  const variance = liveCount ? Math.max(0, dSq / liveCount - mean * mean) : 0;
  return {
    tick,
    pop: liveCount,
    predFrac: liveCount ? pred / liveCount : 0,
    dietSigma: Math.sqrt(variance),
  };
}

interface Result {
  variant: string;
  seed: number;
  extinct: boolean;
  peakPredFrac: number;
  peakTick: number;
  troughPredFrac: number; // min AFTER the peak (the crash depth)
  finalPredFrac: number;
  finalPop: number;
  finalDietSigma: number;
  backHalfSigmaOfPredFrac: number; // stability: σ of predFrac over the back half (lower = steadier)
  traj: Sample[];
}

function runOne(variant: Variant, seed: number): Result {
  const config = defaultConfig({ seed, ...livingWorldOverrides, ...variant.delta });
  const world = new World(config);
  const traj: Sample[] = [];
  let extinct = false;
  for (let t = 1; t <= TICKS; t++) {
    world.step();
    if (world.population <= 0) extinct = true;
    if (t % SAMPLE === 0 || t === TICKS) traj.push(snapshot(world, t));
  }
  if (traj.length === 0) traj.push(snapshot(world, world.tick)); // ticks<1 → never sampled; keep traj non-empty
  let peak = traj[0]!;
  for (const s of traj) if (s.predFrac > peak.predFrac) peak = s;
  const afterPeak = traj.filter((s) => s.tick >= peak.tick);
  const trough = afterPeak.reduce((m, s) => (s.predFrac < m ? s.predFrac : m), peak.predFrac);
  const backHalf = traj.filter((s) => s.tick >= TICKS / 2).map((s) => s.predFrac);
  const bhMean = backHalf.reduce((a, b) => a + b, 0) / Math.max(1, backHalf.length);
  const bhSigma = Math.sqrt(
    backHalf.reduce((a, b) => a + (b - bhMean) * (b - bhMean), 0) / Math.max(1, backHalf.length),
  );
  const last = traj[traj.length - 1]!;
  return {
    variant: variant.name,
    seed,
    extinct,
    peakPredFrac: peak.predFrac,
    peakTick: peak.tick,
    troughPredFrac: trough,
    finalPredFrac: last.predFrac,
    finalPop: last.pop,
    finalDietSigma: last.dietSigma,
    backHalfSigmaOfPredFrac: bhSigma,
    traj,
  };
}

const pct = (x: number): string => `${(100 * x).toFixed(0)}%`;

console.log(
  `\n=== predator boom-bust A/B · ${TICKS} ticks · seeds [${SEEDS.join(',')}] · ${VARIANTS.length} variants ===`,
);
for (const v of VARIANTS) console.log(`  ${v.name.padEnd(12)} ${v.note}`);

const results: Result[] = [];
for (const v of VARIANTS) {
  for (const seed of SEEDS) {
    const r = runOne(v, seed);
    results.push(r);
    // Per-run trajectory of predator % at 10k intervals — the SHAPE (boom → crash → settle?).
    const shape = r.traj
      .filter((s) => s.tick % 10000 === 0)
      .map((s) => pct(s.predFrac))
      .join(' → ');
    console.log(
      `\n[${v.name} · seed ${seed}] ${r.extinct ? 'EXTINCT ' : ''}` +
        `peak ${pct(r.peakPredFrac)}@${r.peakTick} → trough ${pct(r.troughPredFrac)} → ` +
        `final ${pct(r.finalPredFrac)} (pop ${r.finalPop}, dietσ ${r.finalDietSigma.toFixed(2)}, ` +
        `back-half σ ${(100 * r.backHalfSigmaOfPredFrac).toFixed(1)}pp)`,
    );
    console.log(`   pred% @10k steps: ${shape}`);
    // Machine-readable line for the parallel sweep aggregator (exact, unrounded).
    const { traj: _omit, ...rec } = r;
    console.log(`RESULT_JSON ${JSON.stringify(rec)}`);
  }
}

// Per-variant summary averaged across seeds — the headline comparison.
console.log(`\n=== SUMMARY (mean across ${SEEDS.length} seeds) ===`);
console.log('variant       peak%  trough%  final%  finalPop  dietσ  back-halfσ(pp)  extinct');
for (const v of VARIANTS) {
  const rs = results.filter((r) => r.variant === v.name);
  const avg = (f: (r: Result) => number): number => rs.reduce((a, r) => a + f(r), 0) / rs.length;
  console.log(
    `${v.name.padEnd(13)} ` +
      `${pct(avg((r) => r.peakPredFrac)).padStart(4)}  ` +
      `${pct(avg((r) => r.troughPredFrac)).padStart(6)}  ` +
      `${pct(avg((r) => r.finalPredFrac)).padStart(5)}  ` +
      `${avg((r) => r.finalPop)
        .toFixed(0)
        .padStart(7)}  ` +
      `${avg((r) => r.finalDietSigma)
        .toFixed(2)
        .padStart(5)}  ` +
      `${(100 * avg((r) => r.backHalfSigmaOfPredFrac)).toFixed(1).padStart(12)}  ` +
      `${rs.filter((r) => r.extinct).length}/${rs.length}`,
  );
}
console.log(
  '\nGood = lower peak%, higher trough%/final%, low back-half σ (steady, not boom-bust).',
);
