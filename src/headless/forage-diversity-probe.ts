/**
 * B-food-2 measurement: does the separate-drifting-A/B retune (foodPocketChannelMode 1, sparser+blobbier) deepen
 * the two-niche FORAGE_PREF split vs the co-located baseline (mode 0)? And concentrate prey? Read-only.
 * Run: npx tsx src/headless/forage-diversity-probe.ts [ticks] [seed]
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';
import { DEMO_OVERRIDES } from './life-history';

const TICKS = Number(process.argv[2] ?? 8000);
const SEED = Number(process.argv[3] ?? 1);

// Mean nearest-neighbour distance over a sample of the live population (prey concentration; lower = denser).
// Sampled pairwise min over up to SAMPLE individuals — O(SAMPLE²), cheap and deterministic (live order).
// Toroidal: the world wraps at worldWidth/worldHeight (use the shorter wrapped delta on each axis).
function meanNND(world: World, W: number, H: number): number {
  const s = world.store;
  const SAMPLE = Math.min(s.liveCount, 400);
  if (SAMPLE < 2) return NaN;
  const xs = new Float64Array(SAMPLE);
  const ys = new Float64Array(SAMPLE);
  for (let k = 0; k < SAMPLE; k++) {
    const i = s.liveIndices[k]!;
    xs[k] = s.x[i]!;
    ys[k] = s.y[i]!;
  }
  const wrap = (d: number, span: number): number => {
    const a = Math.abs(d) % span;
    return a > span / 2 ? span - a : a;
  };
  let sum = 0;
  for (let a = 0; a < SAMPLE; a++) {
    let best = Infinity;
    for (let b = 0; b < SAMPLE; b++) {
      if (a === b) continue;
      const dx = wrap(xs[a]! - xs[b]!, W);
      const dy = wrap(ys[a]! - ys[b]!, H);
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    sum += Math.sqrt(best);
  }
  return sum / SAMPLE;
}

for (const foodPocketChannelMode of [0, 1]) {
  const config: Config = defaultConfig({
    seed: SEED,
    ...(DEMO_OVERRIDES as Partial<Config>),
    foodPocketChannelMode,
  });
  const world = new World(config);
  for (let t = 0; t < TICKS; t++) world.step();
  const s = world.store;
  let n = 0;
  let sum = 0;
  let aSpec = 0;
  let gen = 0;
  let bSpec = 0;
  for (let k = 0; k < s.liveCount; k++) {
    const pref = s.scalarGenes[s.liveIndices[k]! * SCALAR_GENE_COUNT + ScalarGene.FORAGE_PREF]!;
    n++;
    sum += pref;
    if (pref < 0.33) aSpec++;
    else if (pref > 0.67) bSpec++;
    else gen++;
  }
  const mean = n ? sum / n : NaN;
  let v = 0;
  for (let k = 0; k < s.liveCount; k++) {
    const pref = s.scalarGenes[s.liveIndices[k]! * SCALAR_GENE_COUNT + ScalarGene.FORAGE_PREF]!;
    v += (pref - mean) * (pref - mean);
  }
  const std = n ? Math.sqrt(v / n) : NaN;
  const nnd = meanNND(world, config.worldWidth, config.worldHeight);
  process.stdout.write(
    `mode ${foodPocketChannelMode === 1 ? '1 (retune: separate A/B)' : '0 (baseline: co-located)'} — pop ${n} ` +
      `FORAGE_PREF mean ${mean.toFixed(3)} std ${std.toFixed(3)} | A-spec ${((100 * aSpec) / Math.max(1, n)).toFixed(0)}% ` +
      `gen ${((100 * gen) / Math.max(1, n)).toFixed(0)}% B-spec ${((100 * bSpec) / Math.max(1, n)).toFixed(0)}% ` +
      `| prey NND ${nnd.toFixed(1)}\n`,
  );
}
process.stdout.write(
  'INTERPRET: retune (mode 1) should show a BIMODAL split (both A-spec AND B-spec cohorts, std UP) vs the baseline (mode 0) single-niche collapse. If both collapse to one niche, say so. Lower NND = more concentrated prey.\n',
);
