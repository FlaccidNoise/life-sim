import { World } from '../core/sim/world';
import { defaultConfig, type Config } from '../core/sim/config';
import { develop } from '../core/genome/develop';
import { buildHandicappedForagerGenome } from '../core/genome/critter-genome';
import { instantiateBody } from '../core/organism/instantiate';

// M7 adaptation proof — pure ECONOMIC selection, NO fitness function anywhere. The measured
// trait is the population-mean `sensorLat→turn` connection weight (preGene 2 → postGene 3):
// turning toward off-axis food, governed by `turnScale`, NOT `moveCost ∝ thrust²`. That makes
// it energetically ~free, so under a SCARCE food field a forager that steers toward food eats
// more, breeds more, and the economy selects the trait upward. (We measure lat→turn, not
// sensorFwd→thrust — the latter is ANTI-selected by the thrust² overshoot trap — and hold
// fwd→thrust at its fit 1.5 so the proof isolates the single trait under selection.)
//
// Four runs, two contrasts. The HEADLINE is the mutation-on contrast (A vs B) — M7 is about
// heritable mutation producing adaptation:
//   A) ADAPT-SCARCE    (mutation ON, all foragers start at 0.6, scarce food): mutation supplies
//      variance, scarcity makes steering the binding constraint on eating enough to breed → the
//      population-mean weight CLIMBS far above the 0.6 start (sustained, ~1.6).
//   B) ADAPT-ABUNDANT  (mutation ON, all start 0.6, fast light regrowth): the CONTROL — identical
//      mutation engine, but abundant food removes the reproduction differential, so the mean stays
//      pinned at ~0.6. The climb in A is economic selection, NOT a mutational random walk.
// The supporting contrast is the fixed-allele drift race (C vs D), a direct competition:
//   C) DRIFT-SCARCE    (mutation OFF, 50/50 fit 1.5 / handicap 0.2, scarce): the fit allele
//      out-reproduces → mean climbs above the 0.85 mix-baseline (sustained, ~1.24).
//   D) DRIFT-ABUNDANT  (mutation OFF, 50/50, fast regrowth): no selection → holds the 0.85 baseline.
//
// MEASUREMENT NOTE: the forager economy runs a violent boom-bust limit cycle (the documented
// M2/M3 predator-prey oscillation — population swings several-fold every ~2000 ticks). A single
// endpoint snapshot lands at a random cycle phase and is far too noisy to read. The correct
// estimator for a trait distribution in an oscillating population is a TIME-AVERAGE over whole
// cycles, so every run reports the back-half average of `meanTurn`, sampled finely to span peaks
// and troughs. The verdict is built on the continuous meanTurn average — never the thresholded
// fitFrac (a noisy cliff at the 0.85 midpoint), which is reported only for intuition.
//
// REGIME (verified, seed-7 deterministic — re-runs reproduce byte-for-byte): scarcity is set by
// lightRegen 0.07, which is the EXTINCTION FLOOR (0.05 starves the foragers out regardless of
// trait), so the selection gradient can't be deepened by scarcity alone. The clean climb is
// instead won by (1) strong mutation supply (rate 1.0 / σ 0.4) flooding enough upward variance to
// beat bottleneck demographic drift, and (2) a larger founding population (40 foragers / 5000
// plants) lifting the boom-bust trough so no single surviving lineage wins by lottery. See
// `.git/sdd/task-4-search2-report.md` for the full sweep + mechanism. CAVEAT: the climb has no
// fixed point (unbounded Gaussian mutation + a gradient that stays positive past 1.5), so its
// MAGNITUDE is run-length/founder-sensitive — the direction and sustained-ness are robust, the
// exact endpoint (~1.6 here) is not.

const TURN_PRE = 2;
const TURN_POST = 3;
const FIT = 1.5; // the hand-tuned fit lat→turn weight (drift runs)
const HANDICAP_DRIFT = 0.2; // the handicapped allele (drift runs) — max contrast for the direction test
const ADAPT_START = 0.6; // mutation-on starting weight: on the steep part of the gradient, with demographic margin
const MIX_BASELINE = (FIT + HANDICAP_DRIFT) / 2; // 0.85 — the 50/50 starting mean for the drift runs
const MID = 0.85; // fitFrac threshold (reported for intuition; the verdict uses meanTurn)
const TICKS = 16000;
const MEASURE_EVERY = 500; // fine sampling so the back-half average spans cycle peaks AND troughs
const PRINT_EVERY = 1000;
const HALF = TICKS / 2; // average over samples in the back half (selection has accumulated; ~4 cycles)
const PLANTS = 5000;
const FORAGERS = 40;
const MUT_RATE = 1.0; // adapt runs only — strong supply to beat bottleneck drift
const MUT_SIGMA = 0.4; // adapt runs only

// Scarce, slow-regrowth food on a 768² world — the regime where steering toward food pays.
// 768² is the confirmed scale: the forager economy extincts on a 1024² world (food too dilute
// to reach reproThreshold — the documented M2/M3 knife-edge), independent of selection.
function scarce(over: Partial<Config>): Config {
  return defaultConfig({
    seed: 7,
    maxCells: 12_000,
    worldWidth: 768,
    worldHeight: 768,
    initialPhotoFraction: 1, // all-plant seed: pure food, no competing eaters
    initialMotileFraction: 0,
    reproThreshold: 700,
    reproParentFloor: 120,
    organismDeathFloor: 0,
    lightRegen: 0.07, // KEY scarcity lever (extinction floor): grazed light recovers slowly → food stays scarce
    ...over,
  });
}

// A forager whose lat→turn weight is set to `turn` (fwd→thrust left at the fit 1.5). The handicap
// builder targets exactly that connection, so turn=1.5 yields the fully-fit forager and turn=0.2
// the steering-handicapped one — isolating the single trait under selection.
function spawnForager(w: World, turn: number, x: number, y: number): void {
  const cfg = w.config;
  const ref = w.genomes.register(buildHandicappedForagerGenome(cfg.cellRadius, 100, turn));
  const body = develop(
    buildHandicappedForagerGenome(cfg.cellRadius, 100, turn),
    cfg.maxCellsPerOrganism,
    cfg.maxRecursionDepth,
  );
  instantiateBody(
    body,
    w.cells,
    w.net,
    w.bonds,
    w.organisms,
    ref,
    x,
    y,
    0,
    cfg.worldWidth,
    cfg.worldHeight,
    w.instantiateScratch,
  );
}

function measure(w: World): { mean: number; fitFrac: number; orgs: number; maxGen: number } {
  const o = w.organisms;
  let sum = 0;
  let n = 0;
  let fit = 0;
  let maxGen = 0;
  for (let org = 1; org < o.maxOrganisms; org++) {
    if (!o.isAlive(org) || o.cellCount[org]! === 0) continue;
    const ref = o.genomeRef[org]!;
    if (ref < 0) continue;
    const g = w.genomes.get(ref);
    if (!g) continue;
    const c = g.connectionRules.find((r) => r.preGene === TURN_PRE && r.postGene === TURN_POST);
    if (!c) continue;
    sum += c.weight;
    n++;
    if (c.weight > MID) fit++;
    if (g.generation > maxGen) maxGen = g.generation;
  }
  return { mean: n > 0 ? sum / n : 0, fitFrac: n > 0 ? fit / n : 0, orgs: n, maxGen };
}

type RunResult = {
  meanAvg: number; // back-half time-average of population-mean lat→turn weight (the robust signal)
  fitFracAvg: number; // back-half time-average of the fit-allele fraction (for intuition)
  orgsAvg: number; // back-half average living-organism count
  lateMin: number; // min meanTurn over the LAST quarter — proves the climb is sustained, not a spike
  maxGen: number;
  finalOrgs: number;
};

// Seed FORAGERS foragers (lat→turn weight per `turnOf(k)`), interleaved across the world, then
// run TICKS ticks. Sample every MEASURE_EVERY ticks; average the back-half samples (whole cycles).
function seedAndRun(label: string, cfg: Config, turnOf: (k: number) => number): RunResult {
  const w = new World(cfg, false);
  w.seedLife(PLANTS);
  for (let k = 0; k < FORAGERS; k++) {
    spawnForager(
      w,
      turnOf(k),
      cfg.worldWidth * (0.12 + 0.76 * (k / FORAGERS)),
      cfg.worldHeight * (0.2 + (0.6 * ((k * 7) % 5)) / 5), // stagger rows so fit/handicapped interleave
    );
  }
  console.log(`\n[${label}] tick    orgs   fitFrac   meanTurn   maxGen   plants`);
  let sumMean = 0;
  let sumFit = 0;
  let sumOrgs = 0;
  let nBack = 0;
  let lateMin = Infinity;
  let maxGen = 0;
  let finalOrgs = 0;
  const lateFrom = TICKS * 0.75;
  for (let t = 1; t <= TICKS; t++) {
    w.tick();
    if (t % MEASURE_EVERY !== 0) continue;
    const m = measure(w);
    finalOrgs = m.orgs;
    if (m.maxGen > maxGen) maxGen = m.maxGen;
    if (t > HALF) {
      sumMean += m.mean;
      sumFit += m.fitFrac;
      sumOrgs += m.orgs;
      nBack++;
    }
    if (t > lateFrom && m.mean < lateMin) lateMin = m.mean;
    if (t % PRINT_EVERY === 0) {
      console.log(
        `         ${String(t).padStart(5)}   ${String(m.orgs).padStart(4)}    ${m.fitFrac.toFixed(2).padStart(5)}    ${m.mean.toFixed(3).padStart(7)}   ${String(m.maxGen).padStart(5)}   ${String(w.metrics.photo).padStart(6)}`,
      );
    }
  }
  return {
    meanAvg: nBack > 0 ? sumMean / nBack : 0,
    fitFracAvg: nBack > 0 ? sumFit / nBack : 0,
    orgsAvg: nBack > 0 ? sumOrgs / nBack : 0,
    lateMin: lateMin === Infinity ? 0 : lateMin,
    maxGen,
    finalOrgs,
  };
}

// HEADLINE — the mutation-on contrast (A vs B).
// A) ADAPT-SCARCE: mutation ON, all start 0.6, scarce food → mean climbs far above the start.
const adaptScarce = seedAndRun(
  'A ADAPT scarce   (mut ON, all start 0.6)',
  scarce({ mutationWeightRate: MUT_RATE, mutationWeightSigma: MUT_SIGMA }),
  () => ADAPT_START,
);
// B) ADAPT-ABUNDANT CONTROL: identical mutation, abundant food → mean stays pinned at the start.
const adaptAbundant = seedAndRun(
  'B ADAPT abundant CONTROL (mut ON, all 0.6, fast regrowth)',
  scarce({ lightRegen: 0.3, mutationWeightRate: MUT_RATE, mutationWeightSigma: MUT_SIGMA }),
  () => ADAPT_START,
);
// SUPPORTING — the fixed-allele drift race (C vs D), mutation OFF.
// C) DRIFT-SCARCE: 50/50 fit/handicap, scarce → the fit allele out-reproduces, mean climbs.
const driftScarce = seedAndRun('C DRIFT scarce   (mut OFF, 50/50 fit/handicap)', scarce({}), (k) =>
  k % 2 === 0 ? FIT : HANDICAP_DRIFT,
);
// D) DRIFT-ABUNDANT: same 50/50 but abundant → no selection, holds the 0.85 mix-baseline.
const driftAbundant = seedAndRun(
  'D DRIFT abundant (mut OFF, 50/50, fast regrowth)',
  scarce({ lightRegen: 0.3 }),
  (k) => (k % 2 === 0 ? FIT : HANDICAP_DRIFT),
);

console.log(
  `\n(back-half time-averages over t>${HALF}; meanTurn is the robust signal, fitFrac for intuition)\n` +
    `A ADAPT-scarce    meanTurn=${adaptScarce.meanAvg.toFixed(3)} (lateMin ${adaptScarce.lateMin.toFixed(3)}, orgs~${adaptScarce.orgsAvg.toFixed(0)}, gen ${adaptScarce.maxGen}) from start ${ADAPT_START.toFixed(2)}\n` +
    `B ADAPT-abundant  meanTurn=${adaptAbundant.meanAvg.toFixed(3)} (lateMin ${adaptAbundant.lateMin.toFixed(3)}, orgs~${adaptAbundant.orgsAvg.toFixed(0)}, gen ${adaptAbundant.maxGen})  ← CONTROL\n` +
    `C DRIFT-scarce    meanTurn=${driftScarce.meanAvg.toFixed(3)} (lateMin ${driftScarce.lateMin.toFixed(3)}, fitFrac ${driftScarce.fitFracAvg.toFixed(2)}, orgs~${driftScarce.orgsAvg.toFixed(0)})\n` +
    `D DRIFT-abundant  meanTurn=${driftAbundant.meanAvg.toFixed(3)} (lateMin ${driftAbundant.lateMin.toFixed(3)}, fitFrac ${driftAbundant.fitFracAvg.toFixed(2)}, orgs~${driftAbundant.orgsAvg.toFixed(0)})  baseline ${MIX_BASELINE.toFixed(2)}`,
);

// HEADLINE proof: under scarcity, mutation-supplied variance ADAPTS the mean far above the 0.6
// start AND far above the mutation-identical abundant control. Continuous meanTurn — never thresholded.
const adapts =
  adaptScarce.finalOrgs > 0 &&
  adaptAbundant.finalOrgs > 0 &&
  adaptScarce.meanAvg > ADAPT_START + 0.4 &&
  adaptScarce.meanAvg - adaptAbundant.meanAvg > 0.4 &&
  adaptScarce.lateMin > ADAPT_START; // sustained: the late-run trough never falls back to the start
// SUPPORTING: the fixed-allele drift race favours the fit allele under scarcity, not under abundance.
const driftCorroborates =
  driftScarce.finalOrgs > 0 && driftScarce.meanAvg > driftAbundant.meanAvg + 0.2;

if (adapts) {
  console.log(
    `\n→ ADAPTATION: under scarce food, mutation+economic-selection ADAPTS the steering trait from ${ADAPT_START} ` +
      `to ${adaptScarce.meanAvg.toFixed(2)} (sustained — late trough ${adaptScarce.lateMin.toFixed(2)} > start), while the ` +
      `mutation-identical ABUNDANT control stays at ${adaptAbundant.meanAvg.toFixed(2)}. ` +
      (driftCorroborates
        ? `The fixed-allele drift race corroborates (scarce ${driftScarce.meanAvg.toFixed(2)} > abundant ${driftAbundant.meanAvg.toFixed(2)}). `
        : `(Drift race weaker than expected: scarce ${driftScarce.meanAvg.toFixed(2)} vs abundant ${driftAbundant.meanAvg.toFixed(2)}.) `) +
      'No fitness function — selection is purely a consequence of the economy.',
  );
} else if (adaptScarce.finalOrgs === 0 || adaptAbundant.finalOrgs === 0) {
  console.log(
    `\n→ EXTINCTION (adaptScarce orgs=${adaptScarce.finalOrgs}, adaptAbundant orgs=${adaptAbundant.finalOrgs}). ` +
      'Ease scarcity (raise lightRegen) or add founders — never a fitness function — and re-run.',
  );
} else {
  console.log(
    `\n→ WEAK ADAPTATION (scarce meanTurn=${adaptScarce.meanAvg.toFixed(3)} from ${ADAPT_START}, abundant ${adaptAbundant.meanAvg.toFixed(3)}, ` +
      `lateMin ${adaptScarce.lateMin.toFixed(3)}). Raise mutation σ/rate or founders, or run longer — never a fitness function — and re-run.`,
  );
}
