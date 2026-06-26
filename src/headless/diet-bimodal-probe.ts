/**
 * Diet-bimodality probe: does the grazer/predator DIET split PERSIST, or drift to a uniform-omnivore
 * monoculture? Runs the live demo config (livingWorldOverrides) + CLI key=value overrides, and at
 * checkpoints reports the DIET distribution: mean/sd plus the fraction in three modes —
 * grazer (diet<0.3), omnivore (0.3–0.7), predator (diet>0.7). A persistent bimodal split keeps BOTH
 * the grazer and predator fractions substantial past ~20k; omnivory drift collapses everything into
 * the middle band with sd→~0.1.
 *
 * Run: npx tsx src/headless/diet-bimodal-probe.ts [ticks] [seeds] key=value...
 *   seeds = a COUNT (4 = seeds 1..4). Default ticks 30000, seeds 1.
 */
import { World } from '../core/world';
import { defaultConfig } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';
import { livingWorldOverrides } from '../app/living-world-config';

const TICKS = Number(process.argv[2] ?? 30000);
const SEEDS = Number(process.argv[3] ?? 1);
const extra: Record<string, unknown> = {};
for (const a of process.argv.slice(4)) {
  const [k, v] = a.split('=');
  if (!k || v === undefined) continue;
  extra[k] = v === 'true' ? true : v === 'false' ? false : isNaN(Number(v)) ? v : Number(v);
}

const CHECKS = [5000, 10000, 20000, 30000, 40000, 50000].filter((t) => t <= TICKS);
if (!CHECKS.includes(TICKS)) CHECKS.push(TICKS);

function dietStats(world: World): string {
  const s = world.store;
  const { liveIndices, liveCount, scalarGenes } = s;
  let n = 0;
  let sum = 0;
  let graz = 0;
  let omn = 0;
  let pred = 0;
  const diets: number[] = [];
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const d = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET]!;
    n++;
    sum += d;
    diets.push(d);
    if (d < 0.3) graz++;
    else if (d > 0.7) pred++;
    else omn++;
  }
  if (n === 0) return 'EXTINCT';
  const mean = sum / n;
  let v = 0;
  for (const d of diets) v += (d - mean) * (d - mean);
  const sd = Math.sqrt(v / n);
  const pct = (x: number) => ((100 * x) / n).toFixed(0);
  return `pop=${n} μ=${mean.toFixed(2)} σ=${sd.toFixed(2)} | grazer=${pct(graz)}% omniv=${pct(omn)}% pred=${pct(pred)}%`;
}

for (let seed = 1; seed <= SEEDS; seed++) {
  const cfg = defaultConfig({ ...livingWorldOverrides, ...extra, seed });
  const world = new World(cfg);
  const parts: string[] = [];
  let ci = 0;
  for (let t = 1; t <= TICKS; t++) {
    world.step();
    if (ci < CHECKS.length && t === CHECKS[ci]) {
      parts.push(`t${t}: ${dietStats(world)}`);
      ci++;
    }
  }
  console.log(`seed ${seed} ·`, parts.join('  ·  '));
}
