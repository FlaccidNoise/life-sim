/**
 * Predator diagnostic: track the predator sub-population (DIET > 0.5) over time on the demo config, to see
 * WHEN/why predators go extinct — and how candidate levers (predatorSeedClusters, predationGain, biteRange,
 * huntSizeRatio…) change that. Reports predator count at checkpoints + final diet split + the size relation
 * (are predators big enough to have edible prey?).
 *
 * Each checkpoint also emits two read-only diagnostics (no RNG, no store mutation — see diag()):
 *   • enc = predEncounter — fraction of DIET>0.5 predators with ≥1 EDIBLE creature within biteRange, using
 *     the SAME edibility gate as hunt() (size ≤ size/huntSizeRatio; diet filter only when cannibalism off).
 *     A bite lands iff such a target is in reach, so this is the hunting-opportunity rate (documented ≤~0.06).
 *   • nnd = localNND — mean nearest-live-neighbor distance (wrapped, toroidal) among the residents of the
 *     densest food-grid cell: are prey in the tightest pocket packed closer than biteRange (16)?
 * Run: npx tsx src/headless/predator-probe.ts [ticks] [seeds] key=value...
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';
import { DEMO_OVERRIDES } from './life-history';

const TICKS = Number(process.argv[2] ?? 6000);
const SEEDS = Number(process.argv[3] ?? 4);
const extra: Record<string, unknown> = {};
for (const a of process.argv.slice(4)) {
  const [k, v] = a.split('=');
  if (!k || v === undefined) continue;
  extra[k] = v === 'true' ? true : v === 'false' ? false : isNaN(Number(v)) ? v : Number(v);
}

function counts(world: World): {
  pop: number;
  pred: number;
  predMeanSize: number;
  preyMeanSize: number;
} {
  const s = world.store;
  const { liveIndices, liveCount, scalarGenes } = s;
  let pred = 0;
  let predSize = 0;
  let preySize = 0;
  let preyN = 0;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const diet = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET]!;
    const size = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SIZE]!;
    if (diet > 0.5) {
      pred++;
      predSize += size;
    } else {
      preyN++;
      preySize += size;
    }
  }
  return {
    pop: liveCount,
    pred,
    predMeanSize: pred ? predSize / pred : NaN,
    preyMeanSize: preyN ? preySize / preyN : NaN,
  };
}

/** Toroidal (wrapped) 1-D distance between two coordinates on a torus of side `size`. */
function wrap(d: number, size: number): number {
  d = Math.abs(d);
  return d > size / 2 ? size - d : d;
}

/**
 * Read-only per-checkpoint diagnostics (no RNG, no store/hash/food mutation, no change to iteration order).
 *
 * predEncounter — fraction of predators (DIET>0.5, the same set counts() reports) that have ≥1 EDIBLE creature
 * within biteRange. The edibility gate mirrors hunt() (economy.ts): a target is edible iff its SIZE ≤
 * size/huntSizeRatio and, when cannibalism is OFF, its DIET < the predator's. A bite lands exactly when such a
 * target is in reach, so this is the hunting-opportunity rate. Brute O(pred·N) over the live set — the
 * established probe pattern (wf-encounter.ts / wf-headtohead.ts) — so it never reads the post-step hash (which
 * is stale after cull/repro: its buckets still index pre-cull slots).
 *
 * localNND — bin the live set into food-grid cells (worldWidth/foodCols), take the residents of the densest
 * cell, and average each resident's distance to its nearest live neighbour (over ALL live creatures), wrapped
 * toroidal. A proxy for whether prey in the tightest pocket are packed closer than biteRange (16).
 */
function diag(world: World): { predEncounter: number; localNND: number } {
  const s = world.store;
  const cfg = world.config;
  const { liveIndices, liveCount, x, y, scalarGenes } = s;
  const {
    worldWidth: W,
    worldHeight: H,
    biteRange,
    huntSizeRatio,
    cannibalism,
    foodCols,
    foodRows,
  } = cfg;
  const br2 = biteRange * biteRange;

  const live: number[] = [];
  const preds: number[] = [];
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    live.push(i);
    if (scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET]! > 0.5) preds.push(i);
  }

  let biting = 0;
  for (const i of preds) {
    const dietI = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET]!;
    const maxPreySize = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SIZE]! / huntSizeRatio;
    const xi = x[i]!;
    const yi = y[i]!;
    for (const j of live) {
      if (j === i) continue;
      if (scalarGenes[j * SCALAR_GENE_COUNT + ScalarGene.SIZE]! > maxPreySize) continue;
      if (!cannibalism && scalarGenes[j * SCALAR_GENE_COUNT + ScalarGene.DIET]! >= dietI) continue;
      const dx = wrap(xi - x[j]!, W);
      const dy = wrap(yi - y[j]!, H);
      if (dx * dx + dy * dy <= br2) {
        biting++;
        break;
      }
    }
  }
  const predEncounter = biting / Math.max(1, preds.length);

  // Densest food-grid cell → mean nearest-live-neighbour distance among its residents. Ascending live-slot
  // scan + strict-`>` tie-break → deterministic (the first cell to reach the max count keeps it).
  const cellW = W / foodCols;
  const cellH = H / foodRows;
  const cellResidents = new Map<number, number[]>();
  let bestCell = -1;
  let bestN = 0;
  for (const i of live) {
    const cx = Math.min(foodCols - 1, Math.floor(x[i]! / cellW));
    const cy = Math.min(foodRows - 1, Math.floor(y[i]! / cellH));
    const cell = cy * foodCols + cx;
    let arr = cellResidents.get(cell);
    if (arr === undefined) {
      arr = [];
      cellResidents.set(cell, arr);
    }
    arr.push(i);
    if (arr.length > bestN) {
      bestN = arr.length;
      bestCell = cell;
    }
  }
  let localNND = NaN;
  const residents = bestCell >= 0 ? cellResidents.get(bestCell)! : [];
  if (residents.length > 0 && live.length > 1) {
    let acc = 0;
    for (const i of residents) {
      const xi = x[i]!;
      const yi = y[i]!;
      let best = Infinity;
      for (const j of live) {
        if (j === i) continue;
        const dx = wrap(xi - x[j]!, W);
        const dy = wrap(yi - y[j]!, H);
        const d2 = dx * dx + dy * dy;
        if (d2 < best) best = d2;
      }
      acc += Math.sqrt(best);
    }
    localNND = acc / residents.length;
  }
  return { predEncounter, localNND };
}

for (let seed = 1; seed <= SEEDS; seed++) {
  const config: Config = defaultConfig({ seed, ...(DEMO_OVERRIDES as Partial<Config>), ...extra });
  const world = new World(config);
  const start = counts(world);
  const checkpoints = [250, 500, 1000, 2000, 3000, TICKS];
  let predExtinctAt = -1;
  const samples: string[] = [];
  let ci = 0;
  for (let t = 1; t <= TICKS; t++) {
    world.step();
    const c = counts(world);
    if (c.pred === 0 && predExtinctAt < 0) predExtinctAt = t;
    if (ci < checkpoints.length && t === checkpoints[ci]) {
      const d = diag(world);
      samples.push(
        `t${t}:${c.pred}p/${c.pop} enc=${d.predEncounter.toFixed(3)} nnd=${d.localNND.toFixed(1)}`,
      );
      ci++;
    }
  }
  const end = counts(world);
  process.stdout.write(
    `seed ${seed}: start ${start.pred}pred/${start.pop} · ${samples.join(' ')} · ` +
      `predExtinct@${predExtinctAt < 0 ? 'NEVER' : 't' + predExtinctAt} · ` +
      `end ${end.pred}pred (size ${end.predMeanSize.toFixed(1)}) / ${end.pop - end.pred}prey (size ${end.preyMeanSize.toFixed(1)})\n`,
  );
}
