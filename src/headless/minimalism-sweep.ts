/**
 * Minimalism sweep — does the "race to the bottom" (selection stripping size/senses/efficiency down to
 * the floor) slow under cost/breed-bar interventions that stay in OUR lane (NOT food density/regen)?
 *
 * Runs the LIVE-DEMO config (walls/flow/3-channel food/pheromones, via DEMO_OVERRIDES) with single-knob
 * perturbations, across seeds, and reports — straight off the live store at checkpoints — the trait
 * MEANS and SDs that reveal collapse: a collapsed world has tiny SIZE with near-zero spread and stripped
 * senses; an un-collapsed world keeps size/sense investment AND variance (diverse strategies coexisting).
 *
 * Read-only on the engine: it only constructs configs + steps the World. No core changes.
 *
 * Run: npx tsx src/headless/minimalism-sweep.ts [ticks] [seeds]
 *   seeds: "1-3" range · "1,3,5" list · "2" single.  Default "1-3".
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';
import { DEMO_OVERRIDES, parseSeeds } from './life-history';

// Genes whose collapse IS the race to minimalism (mean ↓ + SD → 0 = stripped & monomorphic).
const TRACK = [
  { key: ScalarGene.SIZE, name: 'SIZE' },
  { key: ScalarGene.SENSE_RANGE, name: 'SENSE' },
  { key: ScalarGene.VISION_RANGE, name: 'VISION' },
  { key: ScalarGene.METAB_EFF, name: 'EFF' },
  { key: ScalarGene.DIET, name: 'DIET' },
  { key: ScalarGene.SATIATED_THRESHOLD, name: 'SATBAR' },
] as const;

interface GeneStat {
  mean: number;
  sd: number;
}
interface Snapshot {
  tick: number;
  pop: number;
  stats: GeneStat[]; // parallel to TRACK
  hueBins: number; // distinct hue bins of 20 among the live set (lineage diversity)
}
interface ArmSeedResult {
  pop: number;
  births: number;
  deaths: number;
  snaps: Snapshot[]; // at each checkpoint
}

/** Mean + population SD of a gene over the live set. */
function geneStat(world: World, gene: number): GeneStat {
  const { liveIndices, liveCount, scalarGenes } = world.store;
  if (liveCount === 0) return { mean: NaN, sd: NaN };
  let sum = 0;
  for (let k = 0; k < liveCount; k++) sum += scalarGenes[liveIndices[k]! * SCALAR_GENE_COUNT + gene]!;
  const mean = sum / liveCount;
  let v = 0;
  for (let k = 0; k < liveCount; k++) {
    const d = scalarGenes[liveIndices[k]! * SCALAR_GENE_COUNT + gene]! - mean;
    v += d * d;
  }
  return { mean, sd: Math.sqrt(v / liveCount) };
}

function hueBins(world: World): number {
  const { liveIndices, liveCount, hue } = world.store;
  const bins = new Set<number>();
  for (let k = 0; k < liveCount; k++) bins.add(Math.floor(hue[liveIndices[k]!]! * 20));
  return bins.size;
}

function snapshot(world: World): Snapshot {
  return {
    tick: world.tick,
    pop: world.population,
    stats: TRACK.map((t) => geneStat(world, t.key)),
    hueBins: hueBins(world),
  };
}

function runArmSeed(
  overrides: Partial<Config>,
  seed: number,
  ticks: number,
  checkpoints: number[],
): ArmSeedResult {
  const config: Config = defaultConfig({ seed, ...DEMO_OVERRIDES, ...overrides });
  const world = new World(config);
  const snaps: Snapshot[] = [];
  const cps = new Set(checkpoints);
  for (let t = 1; t <= ticks; t++) {
    world.step();
    if (cps.has(world.tick)) snaps.push(snapshot(world));
  }
  return { pop: world.population, births: world.totalBirths, deaths: world.totalDeaths, snaps };
}

// ── Arms: each is a single-knob (or paired) intervention on the demo config, all in OUR lane ──
const ARMS: Array<{ name: string; ov: Partial<Config> }> = [
  { name: 'baseline', ov: {} },
  { name: 'sizeStoreExp=0', ov: { sizeStoreExp: 0 } },
  { name: 'sizeStoreExp=0.5', ov: { sizeStoreExp: 0.5 } },
  { name: 'basalCost=0.08', ov: { basalCost: 0.08 } },
  { name: 'sse0+basal0.08', ov: { sizeStoreExp: 0, basalCost: 0.08 } },
];

const TICKS = Number(process.argv[2] ?? 6000);
const SEEDS = parseSeeds(process.argv[3] ?? '1-3');
const CHECKPOINTS = [Math.round(TICKS / 4), Math.round(TICKS / 2), TICKS];
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

// Run every arm × seed.
const results = new Map<string, ArmSeedResult[]>();
for (const arm of ARMS) {
  const rs: ArmSeedResult[] = [];
  for (const seed of SEEDS) {
    process.stderr.write(`[${arm.name} seed ${seed}] ${TICKS} ticks…\n`);
    rs.push(runArmSeed(arm.ov, seed, TICKS, CHECKPOINTS));
  }
  results.set(arm.name, rs);
}

// ── Report: final-checkpoint trait means±SD, pop, births, diversity — averaged over seeds, per arm ──
const out: string[] = [];
const p = (s = '') => out.push(s);
p(`# Minimalism sweep — demo config, ${SEEDS.length} seeds (${SEEDS.join(',')}), ${TICKS} ticks`);
p();
p(
  `Final-tick trait MEAN±SD over the live population, averaged across seeds. Collapse = low mean + SD→0 ` +
    `(stripped & monomorphic). The win = size/sense investment AND variance survive without pop crashing.`,
);
p();
const header =
  `arm`.padEnd(17) +
  `pop`.padStart(7) +
  `births`.padStart(8) +
  `hueBins`.padStart(8) +
  TRACK.map((t) => `${t.name}(µ±σ)`.padStart(14)).join('');
p('```');
p(header);
for (const arm of ARMS) {
  const rs = results.get(arm.name)!;
  const finals = rs.map((r) => r.snaps[r.snaps.length - 1]!);
  const pop = mean(finals.map((f) => f.pop));
  const births = mean(rs.map((r) => r.births));
  const hb = mean(finals.map((f) => f.hueBins));
  let row = arm.name.padEnd(17) + pop.toFixed(0).padStart(7) + births.toFixed(0).padStart(8) + hb.toFixed(1).padStart(8);
  for (let g = 0; g < TRACK.length; g++) {
    const mu = mean(finals.map((f) => f.stats[g]!.mean));
    const sd = mean(finals.map((f) => f.stats[g]!.sd));
    row += `${mu.toFixed(1)}±${sd.toFixed(1)}`.padStart(14);
  }
  p(row);
}
p('```');
p();

// ── Trajectory: SIZE mean over checkpoints per arm (does the collapse slow or just shift?) ──
p(`## SIZE mean trajectory (collapse curve) — t${CHECKPOINTS.join(' / t')}`);
p('```');
p(`arm`.padEnd(17) + CHECKPOINTS.map((c) => `t${c}`.padStart(9)).join(''));
for (const arm of ARMS) {
  const rs = results.get(arm.name)!;
  let row = arm.name.padEnd(17);
  for (let ci = 0; ci < CHECKPOINTS.length; ci++) {
    row += mean(rs.map((r) => r.snaps[ci]!.stats[0]!.mean)).toFixed(1).padStart(9);
  }
  p(row);
}
p('```');

console.log(out.join('\n'));
