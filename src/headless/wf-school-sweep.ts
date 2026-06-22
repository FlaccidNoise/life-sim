/**
 * wf-school-sweep — SCHOOLING-STRENGTH sweep (read-only over sim state apart from the cohesion config).
 *
 * Question: can stronger schooling clump prey into dense, visible schools that raise predEncounter
 * (predation worth watching) WITHOUT crashing carrying capacity or washing the cohesion gene out?
 *
 * Tests strength knobs (cohesionGain / cohesionDrive) AND the hue-blind selectivity knob (whether the
 * same-hue restriction is the real limiter on diverse-lineage prey co-schooling). One config preset per
 * run (argv[2]); runs seeds [1,2,5] × 6000 ticks and prints per-seed metrics + a JSON line.
 *
 * Run: pnpm tsx src/headless/wf-school-sweep.ts <preset>
 *   presets: baseline | gain4 | drive06 | strong | blind4 | blindstrong
 */
import { defaultConfig, type Config } from '../core/config';
import { World } from '../core/world';
import { ScalarGene, SCALAR_GENE_COUNT as SGC } from '../core/genome';

const W = 8192;
const H = 8192;
const SEEDS = [1, 2, 5];
const TICKS = 6000;
const START_SAMPLE = 500;
const BITE_RANGE = 16;
const SCHOOL_RADIUS = 200;

const PRESETS: Record<string, Partial<Config>> = {
  baseline: {},
  blind1: { cohesionHueBlind: true },
  gain4: { cohesionGain: 4 },
  drive06: { cohesionDrive: 0.6 },
  strong: { cohesionDrive: 0.6, cohesionGain: 3 },
  blind4: { cohesionHueBlind: true, cohesionGain: 4 },
  blindstrong: { cohesionHueBlind: true, cohesionDrive: 0.6, cohesionGain: 3 },
};

const preset = process.argv[2] ?? 'baseline';
const overrides = PRESETS[preset];
if (!overrides) {
  console.error(`unknown preset "${preset}". valid: ${Object.keys(PRESETS).join(', ')}`);
  process.exit(1);
}

/** Toroidal 1-D separation along an axis of length `size`. */
function wrap(d: number, size: number): number {
  d = Math.abs(d);
  return d > size / 2 ? size - d : d;
}

/** Mean of a scalar gene over all live creatures. */
function meanGene(world: World, gene: number): number {
  const s = world.store;
  const sg = s.scalarGenes;
  const n = s.liveCount;
  if (n === 0) return 0;
  let acc = 0;
  for (let k = 0; k < n; k++) acc += sg[s.liveIndices[k]! * SGC + gene]!;
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

function measure(world: World, cfg: Config): Snap {
  const s = world.store;
  const sg = s.scalarGenes;
  const n = s.liveCount;

  const predIdx: number[] = [];
  const preyIdx: number[] = [];
  for (let k = 0; k < n; k++) {
    const i = s.liveIndices[k]!;
    if (sg[i * SGC + ScalarGene.DIET]! >= 0.5) predIdx.push(i);
    else preyIdx.push(i);
  }

  // nndPrey + schoolingIndex: single O(prey^2) toroidal pass over prey-prey pairs.
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

  // predEncounter: fraction of predators with >=1 EDIBLE prey within biteRange (economy.ts kill gate).
  let withBite = 0;
  const hsr = cfg.huntSizeRatio;
  for (const ip of predIdx) {
    const maxPrey = sg[ip * SGC + ScalarGene.SIZE]! / hsr;
    const dietP = sg[ip * SGC + ScalarGene.DIET]!;
    const xa = s.x[ip]!;
    const ya = s.y[ip]!;
    let haveBite = false;
    for (let k = 0; k < n && !haveBite; k++) {
      const j = s.liveIndices[k]!;
      if (j === ip) continue;
      if (sg[j * SGC + ScalarGene.SIZE]! >= maxPrey) continue;
      if (!cfg.cannibalism && sg[j * SGC + ScalarGene.DIET]! >= dietP) continue;
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
  preset: string;
  seed: number;
  cohDriveStart: number;
  cohDriveEnd: number;
  visionEnd: number;
  final: Snap;
}

const rows: Row[] = [];
for (const seed of SEEDS) {
  const cfg = defaultConfig({ seed, ...overrides });
  const world = new World(cfg);
  let cohDriveStart = 0;
  for (let t = 1; t <= TICKS; t++) {
    world.step();
    if (t === START_SAMPLE) cohDriveStart = meanGene(world, ScalarGene.COHESION_DRIVE);
  }
  rows.push({
    preset,
    seed,
    cohDriveStart,
    cohDriveEnd: meanGene(world, ScalarGene.COHESION_DRIVE),
    visionEnd: meanGene(world, ScalarGene.VISION_RANGE),
    final: measure(world, cfg),
  });
}

console.log(`=== wf-school-sweep preset=${preset} (${JSON.stringify(overrides)}) ${TICKS}t ===`);
for (const r of rows) {
  const f = r.final;
  console.log(
    `  seed ${r.seed}: pop=${f.pop} pred=${f.pred} prey=${f.prey} | nndPrey=${f.nndPrey.toFixed(1)} ` +
      `school=${f.schoolingIndex.toFixed(2)} predEnc=${f.predEncounter.toFixed(4)} | ` +
      `cohDrive ${r.cohDriveStart.toFixed(3)}->${r.cohDriveEnd.toFixed(3)} visionEnd=${r.visionEnd.toFixed(1)}`,
  );
}
console.log('JSON ' + JSON.stringify(rows));
