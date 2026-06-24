/**
 * Mate-encounter feasibility probe (life-sim-xa90, step 2 — run BEFORE building sexual reproduction).
 *
 * The risk: sexual + genetic-compatibility-gated mating could crash births to extinction if a breeding-
 * ready creature rarely has a genetically-COMPATIBLE partner within mating range. This probe MEASURES that
 * under the live-demo config (dense pockets) and CALIBRATES the compatibility threshold — it does NOT yet
 * change the sim (read-only over the public store surface after each step()).
 *
 * It answers three questions:
 *   1. RAW encounter — does a breeding-ready creature have ANY live neighbour within mating range R?
 *      (the owner's hypothesis: the dense pockets make this fine.)
 *   2. COMPATIBLE encounter — does it have a neighbour within R whose genetic distance < threshold T?
 *      (the rate that actually gates births once compatibility is enforced.)
 *   3. SEPARATION — is there a clean gap between within-species distances (same diet class, same pocket)
 *      and between-species distances (predator↔prey, divergent pops) to place T in? And does a threshold
 *      at that gap actually BLOCK predator×prey crosses?
 *
 * Genetic distance metric (provisional, the thing being calibrated): normalised per-gene L2 over the scalar
 * genes, with DIET (the predator↔prey axis) up-weighted so trophic role dominates — predator/prey isolation
 * should fall out of the metric, not a special case. weightDiet is swept so we can SEE how much weight DIET
 * needs to separate the classes.
 *
 * Run: npx tsx src/headless/mate-encounter-probe.ts [ticks] [seeds] [--demo] [--warmup=N] [--key=value]
 *   Defaults: 4000 ticks, seeds 1-3, --warmup=1500. --demo applies the live-demo overrides (recommended —
 *   that's the world the owner watches and the regime the threshold must work in).
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT, SCALAR_GENE_SPECS } from '../core/genome';
import { satiatedBar } from '../core/economy';
import { SpatialHash } from '../core/spatial-hash';
import { DEMO_OVERRIDES, parseSeeds } from './life-history';
import { fileURLToPath } from 'node:url';

// Mating ranges to sweep (world units). offspringOffset=8, cellRadius=6 (interaction cutoff 12u); a mate
// query a few body-lengths out is the natural scale. The real impl can reuse world.hash for R≤12u; bigger
// R would need a dedicated hash — measuring the curve tells us whether that's worth it.
const RANGES = [8, 16, 32, 64];
// DIET up-weight to sweep (multiplies the normalised DIET term in the metric). 1 = DIET counts like any
// other gene; higher = trophic role dominates the distance.
const DIET_WEIGHTS = [1, 5, 20];
// Candidate compatibility thresholds (in metric units) to report the compatible-encounter rate at.
const THRESHOLDS = [0.1, 0.2, 0.3, 0.5, 0.75, 1.0, 1.5];

/** Normalised per-gene L2 genetic distance between slots a and b, with DIET up-weighted by `wDiet`.
 *  Each gene's raw diff is divided by its (max-min) range so all genes contribute comparably; constant
 *  (pinned/gated) genes contribute 0. This is the provisional metric the threshold is calibrated against. */
function geneDist(genes: Float32Array, a: number, b: number, wDiet: number): number {
  const ab = a * SCALAR_GENE_COUNT;
  const bb = b * SCALAR_GENE_COUNT;
  let sum = 0;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) {
    const spec = SCALAR_GENE_SPECS[g]!;
    const range = spec.max - spec.min || 1;
    const d = (genes[ab + g]! - genes[bb + g]!) / range;
    const w = g === ScalarGene.DIET ? wDiet : 1;
    sum += w * d * d;
  }
  return Math.sqrt(sum);
}

function torusDelta(d: number, size: number): number {
  const h = size * 0.5;
  if (d > h) return d - size;
  if (d < -h) return d + size;
  return d;
}

function quantiles(xs: number[], qs: number[]): number[] {
  if (xs.length === 0) return qs.map(() => NaN);
  const s = [...xs].sort((p, q) => p - q);
  return qs.map((q) => s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]!);
}
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

interface SeedStats {
  seed: number;
  samples: number;
  pop: number[]; // population at each sample tick
  readyCount: number; // total breeding-ready observations across samples
  // per breeding-ready creature, at the SMALLEST range that any data is collected (we collect per range):
  rawRate: Map<number, number>; // range -> fraction with ≥1 live neighbour in range
  // compatible rate keyed by `${range}|${wDiet}|${T}` -> fraction with a compatible neighbour
  compatRate: Map<string, number>;
  nnDistByW: Map<number, number[]>; // wDiet -> nearest-neighbour genetic distances (within max range)
  sameClassNN: Map<number, number[]>; // wDiet -> nearest SAME diet-class neighbour distance
  crossClassNN: Map<number, number[]>; // wDiet -> nearest CROSS diet-class neighbour distance
  // predator×prey leak: among predator ready-creatures with a compatible neighbour at (R=16,T), how many
  // of those compatible neighbours were PREY (cross-class)? Keyed by wDiet|T -> [leaks, totalCompatPairs].
  predPreyLeak: Map<string, [number, number]>;
}

function classOf(diet: number): number {
  return diet < 0.5 ? 0 : 1;
}

function runSeed(seed: number, ticks: number, warmup: number, overrides: Partial<Config>): SeedStats {
  const config: Config = defaultConfig({ seed, ...overrides });
  const world = new World(config);
  const s = world.store;
  const maxRange = Math.max(...RANGES);
  // Dedicated hash sized so a 3×3 neighbourhood reliably covers maxRange (cell ≥ cutoff). Rebuilt per sample.
  const hash = new SpatialHash(config.worldWidth, config.worldHeight, maxRange, config.maxOrganisms);

  const stats: SeedStats = {
    seed,
    samples: 0,
    pop: [],
    readyCount: 0,
    rawRate: new Map(RANGES.map((r) => [r, 0])),
    compatRate: new Map(),
    nnDistByW: new Map(DIET_WEIGHTS.map((w) => [w, []])),
    sameClassNN: new Map(DIET_WEIGHTS.map((w) => [w, []])),
    crossClassNN: new Map(DIET_WEIGHTS.map((w) => [w, []])),
    predPreyLeak: new Map(),
  };
  const rawHits = new Map(RANGES.map((r) => [r, 0]));
  const compatHits = new Map<string, number>();

  function isReady(i: number): boolean {
    if (config.ageStages && s.age[i]! < s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.MATURITY_AGE]!)
      return false;
    if (config.breedCooldown > 0 && s.breedCooldownLeft[i]! > 0) return false;
    return s.energy[i]! >= satiatedBar(s.scalarGenes, i, config);
  }

  const sampleStride = 100;
  for (let t = 1; t <= ticks; t++) {
    world.step();
    if (t < warmup || t % sampleStride !== 0) continue;
    stats.samples++;
    stats.pop.push(world.population);
    hash.build(s);
    const ww = config.worldWidth;
    const hh = config.worldHeight;

    for (let k = 0; k < s.liveCount; k++) {
      const i = s.liveIndices[k]!;
      if (!isReady(i)) continue;
      stats.readyCount++;
      const xi = s.x[i]!;
      const yi = s.y[i]!;
      const dietI = s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET]!;
      const classI = classOf(dietI);

      // Collect neighbour slots within maxRange once (the union of all ranges), with their spatial dist.
      const neigh: Array<{ j: number; dist: number }> = [];
      hash.forEachNeighbor(xi, yi, (j) => {
        if (j === i || !s.isAlive(j)) return;
        const dx = torusDelta(s.x[j]! - xi, ww);
        const dy = torusDelta(s.y[j]! - yi, hh);
        const d = Math.hypot(dx, dy);
        if (d <= maxRange) neigh.push({ j, dist: d });
      });

      // (1) raw encounter rate per range.
      for (const R of RANGES) if (neigh.some((n) => n.dist <= R)) rawHits.set(R, rawHits.get(R)! + 1);

      // (2/3) genetic structure — per DIET weight.
      for (const wDiet of DIET_WEIGHTS) {
        let nnAll = Infinity;
        let nnSame = Infinity;
        let nnCross = Infinity;
        for (const n of neigh) {
          const gd = geneDist(s.scalarGenes, i, n.j, wDiet);
          if (gd < nnAll) nnAll = gd;
          const sameClass = classOf(s.scalarGenes[n.j * SCALAR_GENE_COUNT + ScalarGene.DIET]!) === classI;
          if (sameClass) nnSame = Math.min(nnSame, gd);
          else nnCross = Math.min(nnCross, gd);
        }
        if (Number.isFinite(nnAll)) stats.nnDistByW.get(wDiet)!.push(nnAll);
        if (Number.isFinite(nnSame)) stats.sameClassNN.get(wDiet)!.push(nnSame);
        if (Number.isFinite(nnCross)) stats.crossClassNN.get(wDiet)!.push(nnCross);

        // compatible-encounter rate per (range, threshold) + predator×prey leak at R=16.
        for (const R of RANGES) {
          for (const T of THRESHOLDS) {
            const key = `${R}|${wDiet}|${T}`;
            const compatible = neigh.some(
              (n) => n.dist <= R && geneDist(s.scalarGenes, i, n.j, wDiet) < T,
            );
            if (compatible) compatHits.set(key, (compatHits.get(key) ?? 0) + 1);
          }
        }
        // leak: predator (classI===1) ready creature — at R=16, count compatible neighbours that are PREY.
        if (classI === 1) {
          for (const T of THRESHOLDS) {
            const key = `${wDiet}|${T}`;
            const cur = stats.predPreyLeak.get(key) ?? [0, 0];
            for (const n of neigh) {
              if (n.dist > 16) continue;
              if (geneDist(s.scalarGenes, i, n.j, wDiet) >= T) continue;
              cur[1]++; // a compatible pair
              if (classOf(s.scalarGenes[n.j * SCALAR_GENE_COUNT + ScalarGene.DIET]!) === 0) cur[0]++; // prey
            }
            stats.predPreyLeak.set(key, cur);
          }
        }
      }
    }
  }

  const denom = stats.readyCount || 1;
  for (const R of RANGES) stats.rawRate.set(R, rawHits.get(R)! / denom);
  for (const [key, hits] of compatHits) stats.compatRate.set(key, hits / denom);
  return stats;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const FLAGS = process.argv.slice(2).filter((a) => a.startsWith('--'));
  const POS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const DEMO = FLAGS.includes('--demo');
  const setOverrides: Record<string, unknown> = {};
  let warmup = 1500;
  for (const f of FLAGS) {
    const eq = f.indexOf('=');
    if (eq < 0) continue;
    const key = f.slice(2, eq);
    const raw = f.slice(eq + 1);
    const val =
      raw === 'true' ? true : raw === 'false' ? false : /^-?\d*\.?\d+$/.test(raw) ? Number(raw) : raw;
    if (key === 'warmup') warmup = Number(raw);
    else setOverrides[key] = val;
  }
  const OVERRIDES: Partial<Config> = {
    ...(DEMO ? DEMO_OVERRIDES : {}),
    ...(setOverrides as Partial<Config>),
  };
  const TICKS = Number(POS[0] ?? 4000);
  const SEEDS = parseSeeds(POS[1] ?? '1-3');

  const all: SeedStats[] = [];
  for (const seed of SEEDS) {
    process.stderr.write(`[seed ${seed}] running ${TICKS} ticks (warmup ${warmup})${DEMO ? ' DEMO' : ''}…\n`);
    all.push(runSeed(seed, TICKS, warmup, OVERRIDES));
  }

  const L: string[] = [];
  const p = (x = ''): void => void L.push(x);
  p(`# Mate-encounter feasibility — ${SEEDS.length} seed(s) [${SEEDS.join(',')}], ${TICKS} ticks, ${DEMO ? 'DEMO' : 'default'} config`);
  p();
  const totalReady = all.reduce((a, s) => a + s.readyCount, 0);
  const avgPop = mean(all.flatMap((s) => s.pop));
  p(`Breeding-ready observations: ${totalReady} across ${all.reduce((a, s) => a + s.samples, 0)} samples · mean pop ${avgPop.toFixed(0)}`);
  p();

  p(`## 1. RAW encounter rate — fraction of breeding-ready creatures with ANY live neighbour within range`);
  p('```');
  p(`range(u)   ${all.map((s) => `seed${s.seed}`).join('   ')}   mean`);
  for (const R of RANGES) {
    const vals = all.map((s) => s.rawRate.get(R)!);
    p(`${String(R).padStart(6)}     ${vals.map((v) => (100 * v).toFixed(0).padStart(5) + '%').join('  ')}  ${(100 * mean(vals)).toFixed(0).padStart(5)}%`);
  }
  p('```');
  p();

  p(`## 2. Genetic-distance SEPARATION (nearest same-class vs cross-class neighbour), per DIET weight`);
  p(`Class = grazer (diet<0.5) / predator (diet≥0.5). A clean gap between "same" and "cross" is where the`);
  p(`compatibility threshold T goes. nn = nearest-neighbour metric distance among breeding-ready creatures.`);
  p('```');
  p(`wDiet  nn-same(med/p90)   nn-cross(med/p10)   gap?   nn-any(med)`);
  for (const wDiet of DIET_WEIGHTS) {
    const same = all.flatMap((s) => s.sameClassNN.get(wDiet)!);
    const cross = all.flatMap((s) => s.crossClassNN.get(wDiet)!);
    const anyd = all.flatMap((s) => s.nnDistByW.get(wDiet)!);
    const [sMed, sP90] = quantiles(same, [0.5, 0.9]);
    const [cP10, cMed] = quantiles(cross, [0.1, 0.5]);
    const gap = sP90! < cP10! ? `CLEAN(${sP90!.toFixed(2)}<${cP10!.toFixed(2)})` : 'overlap';
    p(`${String(wDiet).padStart(5)}  ${sMed!.toFixed(2)}/${sP90!.toFixed(2).padStart(5)}      ${cMed!.toFixed(2)}/${cP10!.toFixed(2).padStart(5)}      ${gap.padEnd(18)} ${quantiles(anyd, [0.5])[0]!.toFixed(2)}`);
  }
  p('```');
  p();

  p(`## 3. COMPATIBLE encounter rate — fraction with a neighbour within R AND genetic distance < T`);
  p(`The rate that gates births once compatibility is enforced. Want it high (births won't crash) while T`);
  p(`is still small enough to block predator×prey (see §4). Shown for R=16 (one hash cell of the real impl).`);
  for (const wDiet of DIET_WEIGHTS) {
    p(`### DIET weight ${wDiet}`);
    p('```');
    p(`T \\ range   ${RANGES.map((r) => String(r).padStart(6)).join(' ')}`);
    for (const T of THRESHOLDS) {
      const cells = RANGES.map((R) => {
        const vals = all.map((s) => s.compatRate.get(`${R}|${wDiet}|${T}`) ?? 0);
        return (100 * mean(vals)).toFixed(0).padStart(5) + '%';
      });
      p(`${T.toFixed(2).padStart(7)}    ${cells.join(' ')}`);
    }
    p('```');
  }
  p();

  p(`## 4. Predator×prey LEAK — at R=16, of all "compatible" pairs a predator has, what % are actually PREY?`);
  p(`This MUST go to ~0 at the chosen (wDiet, T): a threshold that lets predators mate prey defeats the`);
  p(`whole reproductive-isolation goal. leak% = preyCompatPairs / allCompatPairs for predator ready-creatures.`);
  p('```');
  p(`wDiet    ${THRESHOLDS.map((t) => t.toFixed(2).padStart(6)).join(' ')}`);
  for (const wDiet of DIET_WEIGHTS) {
    const cells = THRESHOLDS.map((T) => {
      let leak = 0;
      let tot = 0;
      for (const s of all) {
        const [l, n] = s.predPreyLeak.get(`${wDiet}|${T}`) ?? [0, 0];
        leak += l;
        tot += n;
      }
      return (tot ? ((100 * leak) / tot).toFixed(0) : '–').padStart(5) + '%';
    });
    p(`${String(wDiet).padStart(5)}    ${cells.join(' ')}`);
  }
  p('```');
  p();
  p(`## Read`);
  p(`- §1 high → encounters are NOT the blocker (owner's hypothesis). §2 CLEAN gap → a threshold exists that`);
  p(`  separates species. §3 high at that T → births survive. §4 ~0 at that (wDiet,T) → predator/prey isolated.`);
  p(`- Pick the smallest wDiet whose §2 gap is CLEAN, then the T inside that gap whose §3 rate is healthy and`);
  p(`  §4 leak is ~0. That (wDiet,T) is the starting compatibility config for the build.`);

  console.log(L.join('\n'));
}
