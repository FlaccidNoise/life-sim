/**
 * REGIONAL-DIFFERENTIATION probe — the Arc C acceptance instrument. Where evolve-probe reports whether the
 * WHOLE population is turning over + diverse, this asks the biogeographic question: do DISTINCT REGIONS hold
 * DISTINCT phenotypes (regional differentiation), and is gene flow between them low enough for those
 * differences to HARDEN into isolated lineage clusters (allopatric speciation)?
 *
 * Runs the EXACT live-demo config (living-world-config.ts) and, at each sample, reports per trait
 * (diet, forage, metabEff, vision, size, hue) the F_ST-like DIFFERENTIATION RATIO = between-region σ /
 * within-region σ (an ANOVA sum-of-squares split: total SS = between SS + within SS; ratio = √(SSb/SSw)).
 *   ratio ≫ 1  → regions hold different phenotypes (the target).  ratio ≈ 0 → one global phenotype.
 * Plus per-region diet/forage niche histograms and CROSS-REGION GENE FLOW — the share of two-parent births
 * whose mother and father sat in different regions (the isolation metric; lower = more reproductively
 * isolated). Gene flow uses the onBirth father-slot hook (both parents' positions read at birth time).
 *
 * Partition axis (--by): `pocket` (default — nearest fertility pocket, always active on the demo) or
 * `biome` (Voronoi wall region via walls.regionAt; requires wallRegionCount>0).
 *
 * Run: npx tsx src/headless/region-probe.ts [ticks] [seeds] [stride] [--by=pocket|biome] [--warmup=N] [--key=val]
 *   seeds "1" | "1,3,7" | "1-8".  ticks default 20000.  stride default 5000.  warmup default 5000.
 */
import { World } from '../core/world';
import { defaultConfig } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';
import { livingWorldOverrides } from '../app/living-world-config';

const POS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const FLAGS = process.argv.slice(2).filter((a) => a.startsWith('--'));
const TICKS = Number(POS[0] ?? 20000);
const STRIDE = Number(POS[2] ?? 5000);

const ALIAS: Record<string, string> = {
  mate: 'mateContactRange',
  initPop: 'initialPopulation',
  compat: 'mateCompatThreshold',
};
const OVERRIDES: Record<string, number> = {};
let BY: 'pocket' | 'biome' = 'pocket';
let WARMUP = 5000;
for (const f of FLAGS) {
  const byM = /^--by=(pocket|biome)$/.exec(f);
  if (byM) {
    BY = byM[1] as 'pocket' | 'biome';
    continue;
  }
  const wM = /^--warmup=(\d+)$/.exec(f);
  if (wM) {
    WARMUP = Number(wM[1]);
    continue;
  }
  const m = /^--(\w+)=(-?\d+(?:\.\d+)?)$/.exec(f);
  if (m) OVERRIDES[ALIAS[m[1]!] ?? m[1]!] = Number(m[2]);
}

function parseSeeds(s: string | undefined): number[] {
  if (!s) return [1];
  if (s.includes('-')) {
    const [a, b] = s.split('-').map(Number);
    const out: number[] = [];
    for (let i = a!; i <= b!; i++) out.push(i);
    return out;
  }
  return s.split(',').map(Number);
}
const SEEDS = parseSeeds(POS[1]);

interface Trait {
  key: string;
  get: (world: World, i: number) => number;
}
const TRAITS: Trait[] = [
  { key: 'diet', get: (w, i) => w.store.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET]! },
  {
    key: 'forage',
    get: (w, i) => w.store.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.FORAGE_PREF]!,
  },
  {
    key: 'metab',
    get: (w, i) => w.store.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.METAB_EFF]!,
  },
  {
    key: 'vision',
    get: (w, i) => w.store.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.VISION_RANGE]!,
  },
  { key: 'size', get: (w, i) => w.store.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SIZE]! },
  { key: 'hue', get: (w, i) => w.store.hue[i]! },
];

/** Region index of a world position: nearest pocket (toroidal argmin) or Voronoi wall biome. */
function regionOf(world: World, x: number, y: number): number {
  if (BY === 'biome') return world.walls.regionAt(x, y);
  const centres = world.food.pocketCentres();
  const ww = world.config.worldWidth;
  const wh = world.config.worldHeight;
  let best = Infinity;
  let bp = -1;
  for (let p = 0; p < centres.length; p++) {
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
  return bp;
}

/** F_ST-like differentiation: √(SS_between / SS_within) over the region partition. Total SS = SSb + SSw, so
 *  this is the ratio of between-region SD to within-region SD (population-weighted, RNG-free pure arithmetic). */
function differentiation(
  values: number[],
  regions: number[],
  nRegions: number,
): { ratio: number; between: number; within: number } {
  const cnt = new Float64Array(nRegions);
  const sum = new Float64Array(nRegions);
  const sumsq = new Float64Array(nRegions);
  let N = 0;
  let total = 0;
  for (let k = 0; k < values.length; k++) {
    const r = regions[k]!;
    if (r < 0) continue; // unassigned (e.g. walls-off biome) — excluded
    const v = values[k]!;
    cnt[r]!++;
    sum[r]! += v;
    sumsq[r]! += v * v;
    N++;
    total += v;
  }
  if (N === 0) return { ratio: NaN, between: NaN, within: NaN };
  let ssWithin = 0;
  let ssBetween = 0;
  const grandTerm = (total * total) / N;
  for (let r = 0; r < nRegions; r++) {
    const c = cnt[r]!;
    if (c === 0) continue;
    ssWithin += sumsq[r]! - (sum[r]! * sum[r]!) / c; // Σ(x−μ_r)² within region r
    ssBetween += (sum[r]! * sum[r]!) / c; // accumulates Σ n_r μ_r² ; subtract grand term below
  }
  ssBetween -= grandTerm;
  const between = Math.sqrt(Math.max(0, ssBetween) / N);
  const within = Math.sqrt(Math.max(0, ssWithin) / N);
  const ratio = within > 1e-9 ? between / within : Infinity;
  return { ratio, between, within };
}

function runSeed(seed: number): void {
  // Holder so the onBirth closure can reach the World (for regionOf) — the closure only fires during
  // step(), which runs after ref.world is assigned below. Keeps `world` a single-assignment const.
  const ref: { world?: World } = {};
  let curTick = 0;
  const flow = { sexual: 0, cross: 0, warmSexual: 0, warmCross: 0 };

  const config = defaultConfig({
    seed,
    ...livingWorldOverrides,
    ...OVERRIDES,
    onBirth: (mom: number, _mg: number, _child: number, _cg: number, dad?: number) => {
      if (dad === undefined || dad < 0) return; // asexual clone — no two-parent gene-flow signal
      const w = ref.world!;
      const rm = regionOf(w, w.store.x[mom]!, w.store.y[mom]!);
      const rd = regionOf(w, w.store.x[dad]!, w.store.y[dad]!);
      const isCross = rm >= 0 && rd >= 0 && rm !== rd ? 1 : 0;
      flow.sexual++;
      flow.cross += isCross;
      if (curTick > WARMUP) {
        flow.warmSexual++;
        flow.warmCross += isCross;
      }
    },
  });
  const world = new World(config);
  ref.world = world;
  const s = world.store;

  if (BY === 'biome' && !world.walls.active) {
    console.log(
      `seed ${seed}: --by=biome needs wallRegionCount>0 (demo=${config.wallRegionCount}); skipping`,
    );
    return;
  }
  const nRegions = BY === 'biome' ? config.wallRegionCount : world.food.pocketCentres().length;

  const ov = Object.keys(OVERRIDES).length ? ` · ${JSON.stringify(OVERRIDES)}` : '';
  console.log(`\n=== seed ${seed} · ${TICKS} ticks · by=${BY}(${nRegions}) · demo${ov} ===`);
  console.log(
    'tick     pop   reg | diffRatio between/within σ: ' +
      TRAITS.map((t) => t.key).join(' ') +
      ' | xreg%(cum)',
  );

  for (let t = 1; t <= TICKS; t++) {
    curTick = t;
    world.step();
    if (t % STRIDE === 0 || t === TICKS) {
      const { liveIndices, liveCount } = s;
      const reg: number[] = new Array<number>(liveCount);
      let inhabited = 0;
      const seen = new Set<number>();
      for (let k = 0; k < liveCount; k++) {
        const r = regionOf(world, s.x[liveIndices[k]!]!, s.y[liveIndices[k]!]!);
        reg[k] = r;
        if (r >= 0 && !seen.has(r)) {
          seen.add(r);
          inhabited++;
        }
      }
      const ratios = TRAITS.map((tr) => {
        const vals = new Array<number>(liveCount);
        for (let k = 0; k < liveCount; k++) vals[k] = tr.get(world, liveIndices[k]!);
        return differentiation(vals, reg, nRegions).ratio;
      });
      const xregCum = flow.sexual ? (100 * flow.cross) / flow.sexual : 0;
      const line =
        `${String(t).padEnd(8)}${String(liveCount).padEnd(6)}${String(inhabited).padEnd(4)}| ` +
        ratios.map((r) => (Number.isFinite(r) ? r.toFixed(2) : 'inf').padStart(6)).join(' ') +
        ` | ${xregCum.toFixed(1)}`;
      console.log(line);
    }
  }

  // Per-region niche breakdown at the final tick (top regions by population).
  reportNiches(world, s, nRegions);
  const warmX = flow.warmSexual ? (100 * flow.warmCross) / flow.warmSexual : 0;
  console.log(
    `  gene flow: ${flow.cross}/${flow.sexual} cross-region births (${(flow.sexual ? (100 * flow.cross) / flow.sexual : 0).toFixed(1)}% cum, ${warmX.toFixed(1)}% post-t${WARMUP})`,
  );
}

function reportNiches(world: World, s: World['store'], nRegions: number): void {
  const { liveIndices, liveCount } = s;
  const pop = new Int32Array(nRegions);
  const dietBins: number[][] = Array.from({ length: nRegions }, () => [0, 0, 0, 0, 0]);
  const dietSum = new Float64Array(nRegions);
  const forageSum = new Float64Array(nRegions);
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const r = regionOf(world, s.x[i]!, s.y[i]!);
    if (r < 0) continue;
    const d = s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET]!;
    pop[r]!++;
    dietBins[r]![Math.min(4, Math.floor(d * 5))]!++;
    dietSum[r]! += d;
    forageSum[r]! += s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.FORAGE_PREF]!;
  }
  const order = [...Array(nRegions).keys()]
    .filter((r) => pop[r]! > 0)
    .sort((a, b) => pop[b]! - pop[a]!);
  console.log(`  region niches (by pop): reg  pop   K     diet[g….h]        mDiet mForage`);
  const centres = world.food.pocketCentres();
  for (const r of order.slice(0, 6)) {
    const c = pop[r]!;
    const K =
      BY === 'pocket' && centres[r] ? world.food.capacityAt(centres[r]!.x, centres[r]!.y) : 0;
    const histo = dietBins[r]!.map((b) => String(Math.round((100 * b) / c)).padStart(3)).join(' ');
    console.log(
      `    ${String(r).padEnd(4)}${String(c).padEnd(6)}${String(Math.round(K)).padEnd(6)}[${histo}]   ` +
        `${(dietSum[r]! / c).toFixed(2)}  ${(forageSum[r]! / c).toFixed(2)}`,
    );
  }
}

for (const seed of SEEDS) runSeed(seed);
