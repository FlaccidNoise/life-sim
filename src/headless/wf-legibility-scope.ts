/**
 * wf-legibility-scope — LEGIBILITY/SCOPE probe (one-off scratch experiment, read-only over sim state).
 *
 * For seeds [1,2,5] over 6000 ticks each at defaultConfig({seed}), records per seed:
 *   - pop, pred (DIET>=0.5), prey (DIET<0.5)
 *   - mean VISION_RANGE gene at ~t=500 (visionRangeStart) and at t=6000 (visionRangeEnd)
 *   - nndPrey: mean nearest-neighbor toroidal distance among prey (brute O(prey^2))
 *   - schoolingIndex: mean number of OTHER prey within 200 world-units of each prey
 *   - predEncounter: fraction of predators with >=1 EDIBLE prey within biteRange=16
 *       ("edible" = prey size < predatorSize / huntSizeRatio; mirrors economy.ts kill gate)
 *
 * KEY QUESTIONS:
 *   (a) is mean VISION_RANGE lower at end than start (still evolving DOWN after the foodCap 40 fix)?
 *   (b) are prey clustered (high schoolingIndex / low NND) or scattered?
 *
 * Run: pnpm tsx src/headless/wf-legibility-scope.ts
 */
import { defaultConfig } from '../core/config';
import { World } from '../core/world';
import { ScalarGene, SCALAR_GENE_COUNT as SGC } from '../core/genome';

const W = 8192;
const H = 8192;
const SEEDS = [1, 2, 5];
const TICKS = 6000;
const START_SAMPLE = 500; // "early" snapshot for visionRangeStart
const BITE_RANGE = 16;
const SCHOOL_RADIUS = 200;

/** Toroidal 1-D separation along an axis of length `size`. */
function wrap(d: number, size: number): number {
  d = Math.abs(d);
  return d > size / 2 ? size - d : d;
}

/** Mean VISION_RANGE gene over all live creatures (genome center is in world units). */
function meanVisionRange(world: World): number {
  const s = world.store;
  const sg = s.scalarGenes;
  const n = s.liveCount;
  if (n === 0) return 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const i = s.liveIndices[k]!;
    acc += sg[i * SGC + ScalarGene.VISION_RANGE]!;
  }
  return acc / n;
}

interface Snap {
  pop: number;
  pred: number;
  prey: number;
  nndPrey: number;
  schoolingIndex: number;
  predEncounter: number;
}

function measure(world: World, cfg: ReturnType<typeof defaultConfig>): Snap {
  const s = world.store;
  const sg = s.scalarGenes;
  const n = s.liveCount;

  const predIdx: number[] = [];
  const preyIdx: number[] = [];
  for (let k = 0; k < n; k++) {
    const i = s.liveIndices[k]!;
    const diet = sg[i * SGC + ScalarGene.DIET]!;
    if (diet >= 0.5) predIdx.push(i);
    else preyIdx.push(i);
  }

  // nndPrey + schoolingIndex: single O(prey^2) pass over prey-prey pairs.
  let nndAcc = 0;
  let schoolAcc = 0;
  const school2 = SCHOOL_RADIUS * SCHOOL_RADIUS;
  if (preyIdx.length > 1) {
    for (let a = 0; a < preyIdx.length; a++) {
      const ia = preyIdx[a]!;
      const xa = s.x[ia]!;
      const ya = s.y[ia]!;
      let best = Infinity;
      let within = 0;
      for (let b = 0; b < preyIdx.length; b++) {
        if (b === a) continue;
        const ib = preyIdx[b]!;
        const dx = wrap(xa - s.x[ib]!, W);
        const dy = wrap(ya - s.y[ib]!, H);
        const d2 = dx * dx + dy * dy;
        if (d2 < best) best = d2;
        if (d2 <= school2) within++;
      }
      nndAcc += Math.sqrt(best);
      schoolAcc += within;
    }
  }
  const nndPrey = preyIdx.length > 1 ? nndAcc / preyIdx.length : 0;
  const schoolingIndex = preyIdx.length > 0 ? schoolAcc / preyIdx.length : 0;

  // predEncounter: fraction of predators with >=1 EDIBLE prey within biteRange.
  // edible = size < predatorSize / huntSizeRatio (economy.ts kill gate). Respect cannibalism flag.
  let withBite = 0;
  const hsr = cfg.huntSizeRatio;
  for (const ip of predIdx) {
    const sizeP = sg[ip * SGC + ScalarGene.SIZE]!;
    const maxPrey = sizeP / hsr;
    const dietP = sg[ip * SGC + ScalarGene.DIET]!;
    const xa = s.x[ip]!;
    const ya = s.y[ip]!;
    let haveBite = false;
    for (let k = 0; k < n && !haveBite; k++) {
      const j = s.liveIndices[k]!;
      if (j === ip) continue;
      if (sg[j * SGC + ScalarGene.SIZE]! >= maxPrey) continue; // too big to eat
      if (!cfg.cannibalism && sg[j * SGC + ScalarGene.DIET]! >= dietP) continue; // no eating equal/higher diet
      const dx = wrap(xa - s.x[j]!, W);
      const dy = wrap(ya - s.y[j]!, H);
      if (dx * dx + dy * dy <= BITE_RANGE * BITE_RANGE) haveBite = true;
    }
    if (haveBite) withBite++;
  }
  const predEncounter = predIdx.length ? withBite / predIdx.length : 0;

  return {
    pop: n,
    pred: predIdx.length,
    prey: preyIdx.length,
    nndPrey,
    schoolingIndex,
    predEncounter,
  };
}

interface Row {
  seed: number;
  visionRangeStart: number;
  visionRangeEnd: number;
  final: Snap;
}

const rows: Row[] = [];

for (const seed of SEEDS) {
  const cfg = defaultConfig({ seed });
  const world = new World(cfg);
  let visionRangeStart = 0;
  for (let t = 1; t <= TICKS; t++) {
    world.step();
    if (t === START_SAMPLE) visionRangeStart = meanVisionRange(world);
  }
  const visionRangeEnd = meanVisionRange(world);
  const final = measure(world, cfg);
  rows.push({ seed, visionRangeStart, visionRangeEnd, final });
}

console.log(
  `=== wf-legibility-scope: ${TICKS} ticks, seeds ${SEEDS.join(',')}, world ${W}x${H} ===\n`,
);
for (const r of rows) {
  const f = r.final;
  console.log(`--- SEED ${r.seed} ---`);
  console.log(`  pop=${f.pop}  pred=${f.pred}  prey=${f.prey}`);
  console.log(
    `  visionRangeStart(t=${START_SAMPLE})=${r.visionRangeStart.toFixed(3)}  visionRangeEnd(t=${TICKS})=${r.visionRangeEnd.toFixed(3)}  delta=${(r.visionRangeEnd - r.visionRangeStart).toFixed(3)}`,
  );
  console.log(
    `  nndPrey=${f.nndPrey.toFixed(2)}  schoolingIndex(<${SCHOOL_RADIUS}u)=${f.schoolingIndex.toFixed(3)}  predEncounter(bite<=${BITE_RANGE})=${f.predEncounter.toFixed(4)}`,
  );
  console.log('');
}

// Machine-readable line for downstream capture.
console.log('JSON ' + JSON.stringify(rows));
