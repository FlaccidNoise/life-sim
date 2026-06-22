/**
 * Lever C ablation probe (one-off experiment, not a standing job). Tests ALLOPATRIC DIVERGENCE: with
 * per-pocket carrying-capacity variance (config.pocketCapVariance), lean islands should select for
 * smaller/cheaper bodies while rich islands tolerate bigger, greedier ones — so the per-pocket MEAN of a
 * trait diverges ACROSS the archipelago. The dead water + low diffusion already isolate the pockets, so
 * gene flow can't homogenize them.
 *
 * Metric = CROSS-POCKET VARIANCE of a per-pocket trait mean (SIZE is the primary K-responsive axis; DIET
 * and FORAGE_PREF are secondary — FORAGE_PREF is inert here because the probe runs single-channel). Each
 * live creature is assigned to its nearest pocket centre (toroidal), then per-pocket means are taken over
 * inhabited pockets and we report Var_p(mean_p) and the spread (max−min).
 *
 * EXPECTED: at variance=0 the per-pocket means are statistically indistinguishable → Var_p ≈ sampling
 * noise (≈0); at variance>0 it is materially larger (target ≥2× the v=0 floor). SECONDARY GATE: no pocket
 * goes extinct (min per-pocket pop > 0) — if a lean island depopulates, the variance is too high.
 * Run: pnpm tsx src/headless/biome-divergence.ts [ticks]
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';

const ticks = Number(process.argv[2] ?? 30000);
const SEEDS = [1, 2, 5];
const VARIANCES = [0, 0.25, 0.5];

interface CrossStat {
  varOfMeans: number;
  spread: number;
}
interface PocketStats {
  pop: number;
  pockets: number;
  inhabited: number;
  minPop: number;
  size: CrossStat;
  diet: CrossStat;
  pref: CrossStat;
}

function pocketStats(world: World): PocketStats {
  const s = world.store;
  const { liveIndices, liveCount, scalarGenes } = s;
  const centres = world.food.pocketCentres();
  const P = centres.length;
  const ww = world.config.worldWidth;
  const wh = world.config.worldHeight;
  const cnt = new Array<number>(P).fill(0);
  const sumSize = new Array<number>(P).fill(0);
  const sumDiet = new Array<number>(P).fill(0);
  const sumPref = new Array<number>(P).fill(0);
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const x = s.x[i]!;
    const y = s.y[i]!;
    // Nearest pocket centre by toroidal distance.
    let best = Infinity;
    let bp = -1;
    for (let p = 0; p < P; p++) {
      let dx = Math.abs(x - centres[p]!.x);
      let dy = Math.abs(y - centres[p]!.y);
      if (dx > ww * 0.5) dx = ww - dx;
      if (dy > wh * 0.5) dy = wh - dy;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) {
        best = d2;
        bp = p;
      }
    }
    if (bp < 0) continue;
    const sg = i * SCALAR_GENE_COUNT;
    cnt[bp]!++;
    sumSize[bp]! += scalarGenes[sg + ScalarGene.SIZE]!;
    sumDiet[bp]! += scalarGenes[sg + ScalarGene.DIET]!;
    sumPref[bp]! += scalarGenes[sg + ScalarGene.FORAGE_PREF]!;
  }
  // Cross-pocket variance + spread of the per-pocket means, over INHABITED pockets only.
  const crossVar = (sum: number[]): CrossStat => {
    const means: number[] = [];
    for (let p = 0; p < P; p++) if (cnt[p]! > 0) means.push(sum[p]! / cnt[p]!);
    const n = means.length;
    if (n < 2) return { varOfMeans: 0, spread: 0 };
    const mu = means.reduce((a, b) => a + b, 0) / n;
    const v = means.reduce((a, b) => a + (b - mu) ** 2, 0) / n;
    return { varOfMeans: v, spread: Math.max(...means) - Math.min(...means) };
  };
  let inhabited = 0;
  let minPop = Infinity;
  for (let p = 0; p < P; p++) {
    if (cnt[p]! > 0) inhabited++;
    if (cnt[p]! < minPop) minPop = cnt[p]!;
  }
  return {
    pop: liveCount,
    pockets: P,
    inhabited,
    minPop: minPop === Infinity ? 0 : minPop,
    size: crossVar(sumSize),
    diet: crossVar(sumDiet),
    pref: crossVar(sumPref),
  };
}

function run(seed: number, variance: number): PocketStats {
  const cfg: Config = defaultConfig({ seed, pocketCapVariance: variance });
  const world = new World(cfg);
  for (let t = 0; t < ticks; t++) world.step();
  return pocketStats(world);
}

console.log(
  `=== lever C biome-divergence probe: ${ticks} ticks, seeds ${SEEDS.join('/')}, world 8192² ===`,
);
console.log(
  'cross-pocket Var of per-pocket trait MEAN — expect ≈0 at v=0, materially >0 at v>0; minPop>0 = no island died\n',
);
const header =
  'variance'.padEnd(10) +
  'seed'.padStart(6) +
  ['pop', 'inhab/P', 'minPop', 'sizeVar', 'sizeSpr', 'dietVar', 'prefVar']
    .map((h) => h.padStart(10))
    .join('');
console.log(header);
console.log('-'.repeat(header.length));
for (const variance of VARIANCES) {
  for (const seed of SEEDS) {
    const m = run(seed, variance);
    const cells = [
      `${m.pop}`,
      `${m.inhabited}/${m.pockets}`,
      `${m.minPop}`,
      m.size.varOfMeans.toFixed(3),
      m.size.spread.toFixed(2),
      m.diet.varOfMeans.toFixed(4),
      m.pref.varOfMeans.toFixed(4),
    ];
    console.log(
      `${variance}`.padEnd(10) + `${seed}`.padStart(6) + cells.map((v) => v.padStart(10)).join(''),
    );
  }
  console.log('-'.repeat(header.length));
}
