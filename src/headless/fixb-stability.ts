/**
 * fixb-stability — is fix-B's predator mode REAL and DURABLE, or a transient graze-fallback spike? Runs
 * the fix-B preset (4096² + initialPopulation 140 → 4× density → prey NND closes toward biteRange) to 10k
 * ticks and samples, every 1000 ticks: predator fraction (diet > 0.6) and predEncounter (fraction of preds
 * with ≥1 edible prey within biteRange — the actual-hunting signal). If predFrac holds AND predEncounter is
 * non-trivial, predators are really hunting; if predFrac decays or predEncounter ≈ 0, they're omnivores
 * living on graze fallback and the "predator mode" is cosmetic.
 *
 * Run: pnpm tsx src/headless/fixb-stability.ts  (optional --ticks=10000 --seeds=1,2,3 --every=1000)
 */
import { World } from '../core/world';
import { defaultConfig } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';

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
const TICKS = numArg('ticks', 10000);
const EVERY = numArg('every', 1000);
const SEEDS = listArg('seeds', [1, 2, 3]);
const popAbort = numArg('popAbort', 5000);
const strArg = (name: string, fallback: string): string => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const PRESET = strArg('preset', 'fixb');

// fixb = the small-world density preset (the original question). econ = combo-mild economy on the BIG 8192²
// world at baseline density. found = combo-mild economy + FOUNDING-PROTECTION (cluster predator founders into
// the 3 deepest pockets) — the payoff test: does it break the founding lottery so dead seeds establish?
const FIXB = { worldWidth: 4096, worldHeight: 4096, initialPopulation: 140 };
const ECON = { herbivoryExp: 1.0, predationGain: 3, biteRange: 24 };
const FOUND = { herbivoryExp: 1.0, predationGain: 3, biteRange: 24, predatorSeedClusters: 3 };
const OVERRIDE = PRESET === 'found' ? FOUND : PRESET === 'econ' ? ECON : FIXB;

function toro(a: number, b: number, w: number): number {
  let d = Math.abs(a - b);
  if (d > w / 2) d = w - d;
  return d;
}

interface Sample {
  pop: number;
  predFrac: number;
  predEncounter: number;
  nndPrey: number;
}

function sample(world: World): Sample {
  const s = world.store;
  const cfg = world.config;
  const sg = s.scalarGenes;
  const n = s.liveCount;
  if (n === 0) return { pop: 0, predFrac: 0, predEncounter: 0, nndPrey: 0 };

  const idx: number[] = [];
  for (let k = 0; k < n; k++) idx.push(s.liveIndices[k]!);
  const diet = (i: number): number => sg[i * SCALAR_GENE_COUNT + ScalarGene.DIET]!;
  const size = (i: number): number => sg[i * SCALAR_GENE_COUNT + ScalarGene.SIZE]!;

  let predGt06 = 0;
  for (const i of idx) if (diet(i) > 0.6) predGt06++;

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

  return {
    pop: n,
    predFrac: predGt06 / n,
    predEncounter: preds.length ? enc / preds.length : 0,
    nndPrey: nndN ? nndSum / nndN : 0,
  };
}

console.log(
  `=== stability [${PRESET}]: ${TICKS} ticks, seeds [${SEEDS.join(',')}], every ${EVERY} ===\n`,
);
const header =
  'seed'.padEnd(6) +
  ['tick', 'pop', 'predFrac', 'predEnc', 'nndPrey'].map((h) => h.padStart(10)).join('');

for (const seed of SEEDS) {
  console.log(header);
  console.log('-'.repeat(header.length));
  const world = new World(defaultConfig({ seed, ...OVERRIDE }));
  for (let t = 1; t <= TICKS; t++) {
    world.step();
    if (t % EVERY === 0) {
      const m = sample(world);
      const row =
        String(seed).padEnd(6) +
        [
          String(t),
          String(m.pop),
          `${(100 * m.predFrac).toFixed(1)}%`,
          m.predEncounter.toFixed(3),
          m.nndPrey.toFixed(1),
        ]
          .map((v) => v.padStart(10))
          .join('');
      console.log(row);
      // Safety bound: a runaway (predator takeover → cap-peg → O(occupants²) slowdown) must not burn time.
      if (m.pop > popAbort) {
        console.log(
          `  ABORT seed ${seed}: pop ${m.pop} > ${popAbort} at tick ${t} (runaway guard).`,
        );
        break;
      }
    }
  }
  console.log();
}
