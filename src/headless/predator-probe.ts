/**
 * Predator diagnostic: track the predator sub-population (DIET > 0.5) over time on the demo config, to see
 * WHEN/why predators go extinct — and how candidate levers (predatorSeedClusters, predationGain, biteRange,
 * huntSizeRatio…) change that. Reports predator count at checkpoints + final diet split + the size relation
 * (are predators big enough to have edible prey?).
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

function counts(world: World): { pop: number; pred: number; predMeanSize: number; preyMeanSize: number } {
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
      samples.push(`t${t}:${c.pred}p/${c.pop}`);
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
