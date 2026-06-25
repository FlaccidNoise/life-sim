/**
 * Identity-bearing scent MEASUREMENT probe — does behavior emerge from the 4-channel signature?
 *
 * Runs the LIVE-DEMO config (DEMO_OVERRIDES) for N ticks across several seeds and reports, as a read-only
 * census (no sim-core change):
 *
 *  1. FOLLOW-PREY / FLEE-PREDATOR — bin live creatures by DIET (grazer / mid / predator) and report the
 *     mean PREY-channel and PRED-channel forward-thrust synapses per bin. Hypothesis: predators evolve a
 *     MORE POSITIVE PREY-channel climb than grazers do, and prey a MORE NEGATIVE PRED-channel response —
 *     i.e. the relevant synapse sign DIVERGES BY DIET.
 *  2. KIN CLUSTERING — does spatial neighborhood share hue more than the global population? Compare the
 *     mean nearest-neighbour hue-distance against the population hue spread; also run a scentIdentity=false
 *     control. If identity scent clusters lineages, same-hue creatures co-locate (smaller NN hue-distance).
 *  3. LIVENESS — population alive across all seeds.
 *
 * Run: npx tsx src/headless/scent-probe.ts [ticks] [seeds]
 */
import { type Config } from '../core/config';
import { defaultConfig } from '../core/config';
import { World } from '../core/world';
import { Brain, BRAIN_GENES, ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';
import { DEMO_OVERRIDES } from './life-history';

const TICKS = Number(process.argv[2] ?? 6000);
const SEEDS = Number(process.argv[3] ?? 4);

interface Bin {
  label: string;
  n: number;
  preyFwd: number; // PHERO_C0_FWD_THRUST — climb prey-scent
  predFwd: number; // PHERO_C1_FWD_THRUST — response to predator-scent
  sigCosFwd: number; // PHERO_C2_FWD_THRUST — hue compass
  sigSinFwd: number; // PHERO_C3_FWD_THRUST
}

function dietBin(diet: number): number {
  return diet < 0.33 ? 0 : diet < 0.66 ? 1 : 2;
}

function censusSynapses(w: World): Bin[] {
  const s = w.store;
  s.rebuildLive();
  const bins: Bin[] = [
    { label: 'grazer  (diet<.33)', n: 0, preyFwd: 0, predFwd: 0, sigCosFwd: 0, sigSinFwd: 0 },
    { label: 'mid     (.33-.66)', n: 0, preyFwd: 0, predFwd: 0, sigCosFwd: 0, sigSinFwd: 0 },
    { label: 'predator(diet>.66)', n: 0, preyFwd: 0, predFwd: 0, sigCosFwd: 0, sigSinFwd: 0 },
  ];
  for (let k = 0; k < s.liveCount; k++) {
    const i = s.liveIndices[k]!;
    const b = i * BRAIN_GENES;
    const diet = s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET]!;
    const bin = bins[dietBin(diet)]!;
    bin.n++;
    bin.preyFwd += s.brain[b + Brain.PHERO_C0_FWD_THRUST]!;
    bin.predFwd += s.brain[b + Brain.PHERO_C1_FWD_THRUST]!;
    bin.sigCosFwd += s.brain[b + Brain.PHERO_C2_FWD_THRUST]!;
    bin.sigSinFwd += s.brain[b + Brain.PHERO_C3_FWD_THRUST]!;
  }
  for (const bin of bins) {
    if (bin.n > 0) {
      bin.preyFwd /= bin.n;
      bin.predFwd /= bin.n;
      bin.sigCosFwd /= bin.n;
      bin.sigSinFwd /= bin.n;
    }
  }
  return bins;
}

/** Mean nearest-neighbour hue-distance (circular, [0,0.5]) vs the mean pairwise hue spread of a random
 *  sample. If kin cluster spatially, NN hue-distance < global spread. Sampled to stay O(n·sample). */
function kinClustering(w: World): { nnHue: number; globalHue: number } {
  const s = w.store;
  s.rebuildLive();
  const n = s.liveCount;
  if (n < 10) return { nnHue: 0, globalHue: 0 };
  const hueDist = (a: number, b: number): number => {
    const d = Math.abs(a - b) % 1;
    return d > 0.5 ? 1 - d : d;
  };
  const idx = (k: number): number => s.liveIndices[k]!;
  // Nearest spatial neighbour's hue-distance, averaged over a sample of creatures.
  let nnSum = 0;
  let nnN = 0;
  const STRIDE = Math.max(1, Math.floor(n / 400)); // cap the O(n·n) scan
  for (let k = 0; k < n; k += STRIDE) {
    const i = idx(k);
    let best = Infinity;
    let bestHue = -1;
    for (let m = 0; m < n; m += STRIDE) {
      if (m === k) continue;
      const j = idx(m);
      const dx = s.x[i]! - s.x[j]!;
      const dy = s.y[i]! - s.y[j]!;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) {
        best = d2;
        bestHue = s.hue[j]!;
      }
    }
    if (bestHue >= 0) {
      nnSum += hueDist(s.hue[i]!, bestHue);
      nnN++;
    }
  }
  // Global expected hue-distance: mean over random pairs.
  let gSum = 0;
  let gN = 0;
  for (let k = 0; k < n; k += STRIDE) {
    const i = idx(k);
    const j = idx((k + Math.floor(n / 2)) % n);
    gSum += hueDist(s.hue[i]!, s.hue[j]!);
    gN++;
  }
  return { nnHue: nnN > 0 ? nnSum / nnN : 0, globalHue: gN > 0 ? gSum / gN : 0 };
}

function run(seed: number, identity: boolean): { bins: Bin[]; live: number; kin: ReturnType<typeof kinClustering> } {
  const cfg: Config = defaultConfig({ ...DEMO_OVERRIDES, seed, scentIdentity: identity });
  const w = new World(cfg);
  for (let t = 0; t < TICKS; t++) w.step();
  w.store.rebuildLive();
  return { bins: censusSynapses(w), live: w.store.liveCount, kin: kinClustering(w) };
}

console.log(`=== identity-bearing scent probe: ${TICKS} ticks, ${SEEDS} seeds (demo config) ===\n`);

// Aggregate the diet-binned synapse census across seeds (identity ON).
const agg: Bin[] = [
  { label: 'grazer  (diet<.33)', n: 0, preyFwd: 0, predFwd: 0, sigCosFwd: 0, sigSinFwd: 0 },
  { label: 'mid     (.33-.66)', n: 0, preyFwd: 0, predFwd: 0, sigCosFwd: 0, sigSinFwd: 0 },
  { label: 'predator(diet>.66)', n: 0, preyFwd: 0, predFwd: 0, sigCosFwd: 0, sigSinFwd: 0 },
];
let totalLive = 0;
let kinOnNN = 0;
let kinOnGlobal = 0;
let kinOffNN = 0;
let kinOffGlobal = 0;

for (let seed = 1; seed <= SEEDS; seed++) {
  const on = run(seed, true);
  const off = run(seed, false);
  totalLive += on.live;
  kinOnNN += on.kin.nnHue;
  kinOnGlobal += on.kin.globalHue;
  kinOffNN += off.kin.nnHue;
  kinOffGlobal += off.kin.globalHue;
  for (let b = 0; b < 3; b++) {
    const src = on.bins[b]!;
    const dst = agg[b]!;
    // weight by creature count so the cross-seed mean is population-weighted
    dst.preyFwd += src.preyFwd * src.n;
    dst.predFwd += src.predFwd * src.n;
    dst.sigCosFwd += src.sigCosFwd * src.n;
    dst.sigSinFwd += src.sigSinFwd * src.n;
    dst.n += src.n;
  }
  console.log(
    `seed ${seed}: live(ON)=${on.live}  live(OFF)=${off.live}  ` +
      `kinNN(ON)=${on.kin.nnHue.toFixed(4)} vs global=${on.kin.globalHue.toFixed(4)}`,
  );
}

console.log('\n--- diet-binned scent synapses (population-weighted mean across seeds, identity ON) ---');
console.log(
  'bin'.padEnd(20) + 'n'.padStart(7) + 'preyFwd(C0)'.padStart(14) + 'predFwd(C1)'.padStart(14) +
    'sigCos(C2)'.padStart(14) + 'sigSin(C3)'.padStart(14),
);
for (const b of agg) {
  const d = b.n > 0 ? b.n : 1;
  console.log(
    b.label.padEnd(20) +
      `${b.n}`.padStart(7) +
      (b.preyFwd / d).toFixed(5).padStart(14) +
      (b.predFwd / d).toFixed(5).padStart(14) +
      (b.sigCosFwd / d).toFixed(5).padStart(14) +
      (b.sigSinFwd / d).toFixed(5).padStart(14),
  );
}

const gz = agg[0]!;
const pr = agg[2]!;
const preySplit = (pr.n > 0 ? pr.preyFwd / pr.n : 0) - (gz.n > 0 ? gz.preyFwd / gz.n : 0);
const predSplit = (pr.n > 0 ? pr.predFwd / pr.n : 0) - (gz.n > 0 ? gz.predFwd / gz.n : 0);
console.log('\n--- hypothesis tests ---');
console.log(`H1 follow-prey: predator PREY-climb − grazer PREY-climb = ${preySplit.toFixed(5)}  (expect > 0)`);
console.log(`H1 flee-pred:   predator PRED-resp − grazer PRED-resp  = ${predSplit.toFixed(5)}`);
console.log(
  `H2 kin-cluster: NN hue-dist ON=${(kinOnNN / SEEDS).toFixed(4)} vs global=${(kinOnGlobal / SEEDS).toFixed(4)}; ` +
    `OFF NN=${(kinOffNN / SEEDS).toFixed(4)} vs global=${(kinOffGlobal / SEEDS).toFixed(4)}  (cluster ⇒ NN < global, more so ON)`,
);
console.log(`H3 liveness: mean live(ON) across seeds = ${(totalLive / SEEDS).toFixed(0)}  (expect alive)`);
