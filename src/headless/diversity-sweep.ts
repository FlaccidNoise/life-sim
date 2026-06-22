/**
 * diversity-sweep — measures which config levers actually revive DIET / TROPHIC / FORAGE variance, since
 * the shipped sim is a grazer monoculture (diet flat, predators 0–15%, foragePref pinned). Runs a small
 * preset sweep over POCKET DENSITY (tighter/richer Gaussian food pockets, plus a bigger world holding
 * pocket density constant — the owner's chosen direction, NOT a global shrink) plus the foodChannels
 * forage lever, and reports, per preset (multi-seed), the realized diversity of the FINAL live population.
 *
 * Reuses wf-headtohead's predEncounter metric (fraction of predators with ≥1 edible prey within biteRange
 * — bites landed per predator·tick) and its config-derived toroidal geometry, so the bigger-world presets
 * measure correctly (it reads world dims from cfg). Read-only over sim state; uses defaultConfig per preset.
 *
 * Run: pnpm tsx src/headless/diversity-sweep.ts  (optional --ticks=3000 --seeds=1,2,3)
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT, SCALAR_GENE_SPECS } from '../core/genome';

const numArg = (name: string, fallback: number): number => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.slice(name.length + 3)) : fallback;
};
const listArg = (name: string, fallback: number[]): number[] => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit
    ? hit
        .slice(name.length + 3)
        .split(',')
        .map(Number)
    : fallback;
};
const TICKS = numArg('ticks', 3000);
const SEEDS = listArg('seeds', [1, 2, 3]);

const DIET_RANGE =
  SCALAR_GENE_SPECS[ScalarGene.DIET]!.max - SCALAR_GENE_SPECS[ScalarGene.DIET]!.min;
const FORAGE_RANGE =
  SCALAR_GENE_SPECS[ScalarGene.FORAGE_PREF]!.max - SCALAR_GENE_SPECS[ScalarGene.FORAGE_PREF]!.min;

function toro(a: number, b: number, w: number): number {
  let d = Math.abs(a - b);
  if (d > w / 2) d = w - d;
  return d;
}

/** The p-th percentile of a SORTED ascending array (linear interpolation between ranks). */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (rank - lo);
}

interface Snap {
  pop: number;
  predFrac: number; // share of pop with diet > 0.6
  dietMed: number;
  dietIqrPct: number;
  dietMax: number;
  forageIqrPct: number;
  predEncounter: number;
  nndPrey: number; // mean toroidal nearest-neighbour distance among prey — the causal density variable
  perPocket: number; // mean creatures assigned to each pocket (the density-per-reservoir signal)
  betweenPocketDietSd: number; // SD of per-pocket mean diet — "distinct species per pocket" signal
}

function measure(world: World): Snap {
  const s = world.store;
  const cfg = world.config;
  const sg = s.scalarGenes;
  const n = s.liveCount;
  if (n === 0) {
    return {
      pop: 0,
      predFrac: 0,
      dietMed: 0,
      dietIqrPct: 0,
      dietMax: 0,
      forageIqrPct: 0,
      predEncounter: 0,
      nndPrey: 0,
      perPocket: 0,
      betweenPocketDietSd: 0,
    };
  }

  const idx: number[] = [];
  for (let k = 0; k < n; k++) idx.push(s.liveIndices[k]!);
  const diet = (i: number): number => sg[i * SCALAR_GENE_COUNT + ScalarGene.DIET]!;
  const size = (i: number): number => sg[i * SCALAR_GENE_COUNT + ScalarGene.SIZE]!;

  const dietVals: number[] = [];
  const forageVals: number[] = [];
  let predGt06 = 0;
  for (const i of idx) {
    const d = diet(i);
    dietVals.push(d);
    forageVals.push(sg[i * SCALAR_GENE_COUNT + ScalarGene.FORAGE_PREF]!);
    if (d > 0.6) predGt06++;
  }
  dietVals.sort((a, b) => a - b);
  forageVals.sort((a, b) => a - b);
  const dietIqrPct = (percentile(dietVals, 75) - percentile(dietVals, 25)) / DIET_RANGE;
  const forageIqrPct = (percentile(forageVals, 75) - percentile(forageVals, 25)) / FORAGE_RANGE;

  // predEncounter (reused from wf-headtohead): fraction of preds (diet ≥ 0.5) with ≥1 edible prey within
  // biteRange. Edible = size ≤ predatorSize/huntSizeRatio; cannibalism on (default) → no diet filter.
  const preds = idx.filter((i) => diet(i) >= 0.5);
  const br2 = cfg.biteRange * cfg.biteRange;
  let enc = 0;
  for (const i of preds) {
    const maxPrey = size(i) / cfg.huntSizeRatio;
    let found = false;
    for (const j of idx) {
      if (j === i) continue;
      if (size(j) > maxPrey) continue;
      if (!cfg.cannibalism && diet(j) >= diet(i)) continue;
      const dx = toro(s.x[i]!, s.x[j]!, cfg.worldWidth);
      const dy = toro(s.y[i]!, s.y[j]!, cfg.worldHeight);
      if (dx * dx + dy * dy <= br2) {
        found = true;
        break;
      }
    }
    if (found) enc++;
  }

  // Mean prey nearest-neighbour distance (toroidal, brute O(prey²) — fine once at final tick). This is
  // the CAUSAL density variable: predation only lands when prey NND approaches biteRange (16u).
  const prey = idx.filter((i) => diet(i) < 0.5);
  let nndSum = 0;
  let nndN = 0;
  for (const i of prey) {
    let best = Infinity;
    for (const j of prey) {
      if (j === i) continue;
      const dx = toro(s.x[i]!, s.x[j]!, cfg.worldWidth);
      const dy = toro(s.y[i]!, s.y[j]!, cfg.worldHeight);
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
    if (best < Infinity) {
      nndSum += Math.sqrt(best);
      nndN++;
    }
  }

  // Per-pocket assignment: each creature → nearest pocket centre (toroidal). Gives mean creatures-per-
  // pocket (the density-per-reservoir signal) and between-pocket diet SD (the "distinct species" signal).
  const centers = world.food.patchCenters;
  let perPocket = 0;
  let betweenPocketDietSd = 0;
  if (centers.length > 0) {
    const counts = new Array<number>(centers.length).fill(0);
    const dietSum = new Array<number>(centers.length).fill(0);
    for (const i of idx) {
      let bestP = 0;
      let bestD2 = Infinity;
      for (let p = 0; p < centers.length; p++) {
        const dx = toro(s.x[i]!, centers[p]!.x, cfg.worldWidth);
        const dy = toro(s.y[i]!, centers[p]!.y, cfg.worldHeight);
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestP = p;
        }
      }
      counts[bestP]!++;
      dietSum[bestP]! += diet(i);
    }
    perPocket = n / centers.length;
    // SD of per-pocket mean diet over OCCUPIED pockets only (empty pockets carry no diet signal).
    const means: number[] = [];
    for (let p = 0; p < centers.length; p++)
      if (counts[p]! > 0) means.push(dietSum[p]! / counts[p]!);
    if (means.length > 1) {
      const mu = means.reduce((a, v) => a + v, 0) / means.length;
      betweenPocketDietSd = Math.sqrt(means.reduce((a, v) => a + (v - mu) ** 2, 0) / means.length);
    }
  }

  return {
    pop: n,
    predFrac: predGt06 / n,
    dietMed: percentile(dietVals, 50),
    dietIqrPct,
    dietMax: dietVals[dietVals.length - 1]!,
    forageIqrPct,
    predEncounter: preds.length ? enc / preds.length : 0,
    nndPrey: nndN ? nndSum / nndN : 0,
    perPocket,
    betweenPocketDietSd,
  };
}

// ECONOMY PROBE (read-only on config; richness knobs left at LEGACY defaults so this isolates the ENCOUNTER
// ECONOMY from the richness feature). Question: can the encounter economy make hunting VIABLE+BALANCED on a
// BIG 8192² world at BASELINE density (prey NND ~60u) WITHOUT the fix-B shrink? Levers (economy.ts hunt):
//   predationGain — energy absorbed per bite ×this (is a bite worth it); biteRange — reach (closes the
//   NND-vs-reach gap directly); herbivoryExp — plant-fallback falloff (1−diet)^exp: 1.0 keeps predators
//   facultative→viable through the sparse bootstrap, 1.3 (default) bleeds high-diet out.
// BALANCED bar: predEnc clearly >0 AND predFrac a STABLE MINORITY (~10–40%) with prey persisting. A preset
// where predFrac→majority + pop crashes is OVERTUNED (predator monoculture), flagged in the readout.
const PRESETS: { label: string; o: Partial<Config> }[] = [
  { label: 'baseline', o: {} },
  { label: 'gain3', o: { predationGain: 3 } },
  { label: 'gain5', o: { predationGain: 5 } },
  { label: 'bite24', o: { biteRange: 24 } },
  { label: 'bite32', o: { biteRange: 32 } },
  { label: 'herbExp1.0', o: { herbivoryExp: 1.0 } },
  // Combined, aimed at the viable-balanced window: restore the plant fallback (exp 1.0) so predator lineages
  // survive bootstrap, +modest gain so a bite pays, +reach so bites land at NND~60u — but not so much it tips
  // to a shark monoculture.
  { label: 'combo mild', o: { herbivoryExp: 1.0, predationGain: 3, biteRange: 24 } },
  { label: 'combo strong', o: { herbivoryExp: 1.0, predationGain: 5, biteRange: 32 } },
];

console.log(`=== diversity sweep: ${TICKS} ticks, seeds [${SEEDS.join(',')}] ===\n`);
const header =
  'preset'.padEnd(20) +
  [
    'seed',
    'pop',
    'perPock',
    'nndPrey',
    'predFrac',
    'dietMed',
    'dietIQR%',
    'predEnc',
    'forageIQR%',
    'pocketSd',
    'ms',
  ]
    .map((h) => h.padStart(10))
    .join('');
console.log(header);
console.log('-'.repeat(header.length));

for (const p of PRESETS) {
  for (const seed of SEEDS) {
    const t0 = Date.now();
    const world = new World(defaultConfig({ seed, ...p.o }));
    for (let t = 0; t < TICKS; t++) world.step();
    const ms = Date.now() - t0;
    const m = measure(world);
    const row =
      p.label.padEnd(20) +
      [
        String(seed),
        String(m.pop),
        m.perPocket.toFixed(0),
        m.nndPrey.toFixed(1),
        `${(100 * m.predFrac).toFixed(1)}%`,
        m.dietMed.toFixed(3),
        `${(100 * m.dietIqrPct).toFixed(1)}%`,
        m.predEncounter.toFixed(3),
        `${(100 * m.forageIqrPct).toFixed(1)}%`,
        m.betweenPocketDietSd.toFixed(3),
        String(ms),
      ]
        .map((v) => v.padStart(10))
        .join('');
    console.log(row);
  }
  console.log('-'.repeat(header.length));
}
