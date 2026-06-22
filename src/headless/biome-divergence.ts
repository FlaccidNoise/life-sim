/**
 * Lever C ablation probe (one-off experiment, not a standing job). Tests ALLOPATRIC DIVERGENCE: with
 * per-pocket carrying-capacity variance (config.pocketCapVariance), do isolated islands of different K
 * evolve different trait optima? The dead water + low diffusion isolate the pockets, so gene flow can't
 * homogenize them.
 *
 * METRIC — a DIRECTED correlation, not a variance. A first cut measured the cross-pocket VARIANCE of the
 * per-pocket trait mean (expecting ≈0 at v=0, large at v>0); it FAILED because isolated small-population
 * islands drift genetically even at v=0, so the v=0 variance floor is high and noisy and swamps the K
 * signal. The drift confound is removed by asking, directly: do the pockets that are actually RICH hold
 * (e.g.) more K-strategist life histories? We read each pocket's K (capacityAt its centre) and report the
 * Pearson r of (pocket K → pocket mean trait) across inhabited pockets. At v=0, K is uniform → no signal
 * to correlate with (r is noise); a robust r of consistent sign across seeds at v>0 IS the divergence,
 * independent of the absolute drift level.
 *
 * WHICH TRAITS. The textbook K-responsive axis is LIFE HISTORY (r/K selection): rich, stable pockets favor
 * K-strategists (few well-provisioned offspring → high birthEnergy + high reproduction bars); lean pockets
 * favor r-strategists (many cheap offspring → low). So reproThreshold / satiatedThreshold / birthEnergy are
 * the primary axes. SIZE and DIET are reported too but are NOT expected to track K (size's payoffs — deep
 * reserves, predation refuge, bite — don't scale with local food abundance). FORAGE_PREF is omitted (pinned
 * under the single channel this probe runs). SECONDARY GATE: no pocket goes extinct (minPop>0).
 * Run: pnpm tsx src/headless/biome-divergence.ts [ticks]
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';

const ticks = Number(process.argv[2] ?? 30000);
const SEEDS = [1, 2, 5];
const VARIANCES = [0, 0.25, 0.5];

// Traits to correlate against per-pocket K. Life-history first (the r/K axis), then size/diet for context.
const TRAITS: { key: string; gene: number }[] = [
  { key: 'repro', gene: ScalarGene.REPRO_THRESHOLD },
  { key: 'satiat', gene: ScalarGene.SATIATED_THRESHOLD },
  { key: 'birthE', gene: ScalarGene.BIRTH_ENERGY },
  { key: 'size', gene: ScalarGene.SIZE },
  { key: 'diet', gene: ScalarGene.DIET },
];

interface PocketStats {
  pop: number;
  inhabited: number;
  pockets: number;
  minPop: number;
  kMin: number;
  kMax: number;
  corr: Record<string, number>; // trait key → Pearson r of (pocket K, pocket mean trait)
}

/** Pearson correlation of paired samples; 0 when either side has no spread (degenerate). */
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

function pocketStats(world: World): PocketStats {
  const s = world.store;
  const { liveIndices, liveCount, scalarGenes } = s;
  const centres = world.food.pocketCentres();
  const P = centres.length;
  const ww = world.config.worldWidth;
  const wh = world.config.worldHeight;
  const cnt = new Array<number>(P).fill(0);
  // Per-trait per-pocket sums.
  const sums: Record<string, number[]> = {};
  for (const t of TRAITS) sums[t.key] = new Array<number>(P).fill(0);
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
    for (const t of TRAITS) sums[t.key]![bp]! += scalarGenes[sg + t.gene]!;
  }
  // Paired (K_p, mean trait_p) over INHABITED pockets — the directed divergence test.
  const kp: number[] = [];
  const means: Record<string, number[]> = {};
  for (const t of TRAITS) means[t.key] = [];
  let inhabited = 0;
  let minPop = Infinity;
  for (let p = 0; p < P; p++) {
    const c = cnt[p]!;
    if (c < minPop) minPop = c;
    if (c === 0) continue;
    inhabited++;
    kp.push(world.food.capacityAt(centres[p]!.x, centres[p]!.y));
    for (const t of TRAITS) means[t.key]!.push(sums[t.key]![p]! / c);
  }
  const corr: Record<string, number> = {};
  for (const t of TRAITS) corr[t.key] = pearson(kp, means[t.key]!);
  return {
    pop: liveCount,
    inhabited,
    pockets: P,
    minPop: minPop === Infinity ? 0 : minPop,
    kMin: kp.length ? Math.min(...kp) : 0,
    kMax: kp.length ? Math.max(...kp) : 0,
    corr,
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
  'corr = Pearson r of (pocket K → pocket mean trait). r≈0 at v=0 (K uniform); a consistent-sign r across\n' +
    'seeds at v>0 = K drives that trait. repro/satiat/birthE are the r/K life-history axes (primary).\n' +
    'kMin/kMax = per-pocket K range (confirms the lever varies K). minPop>0 = no island died.\n',
);
const header =
  'variance'.padEnd(9) +
  'seed'.padStart(5) +
  ['pop', 'minPop', 'kMin', 'kMax', ...TRAITS.map((t) => `${t.key}~K`)]
    .map((h) => h.padStart(10))
    .join('');
console.log(header);
console.log('-'.repeat(header.length));
for (const variance of VARIANCES) {
  for (const seed of SEEDS) {
    const m = run(seed, variance);
    const cells = [
      `${m.pop}`,
      `${m.minPop}`,
      m.kMin.toFixed(1),
      m.kMax.toFixed(1),
      ...TRAITS.map((t) => m.corr[t.key]!.toFixed(3)),
    ];
    console.log(
      `${variance}`.padEnd(9) + `${seed}`.padStart(5) + cells.map((v) => v.padStart(10)).join(''),
    );
  }
  console.log('-'.repeat(header.length));
}
