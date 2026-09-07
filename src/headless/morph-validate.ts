/**
 * Multi-seed morph validation — runs the FULL living-world config (all 5 morphs ON) across N seeds
 * for T ticks each, sampling the 5-way ecology (autotrophs/grazers/predators/parasites/scavengers)
 * at regular intervals. Reports per-seed survival, final ecology, and flags extinctions / collapses.
 *
 * Usage: npx tsx src/headless/morph-validate.ts [ticks] [seeds] [sampleInterval]
 *   ticks=20000 seeds=8 sampleInterval=2000 (defaults)
 *
 * Exit code 0 if ≥75% of seeds survive (pop>0) to the final tick, 1 otherwise.
 */
import { defaultConfig, type Config } from '../core/config';
import { livingWorldOverrides } from '../app/living-world-config';
import { World } from '../core/world';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';

const ticks = Number(process.argv[2] ?? 20000);
const seedCount = Number(process.argv[3] ?? 8);
const sampleInterval = Number(process.argv[4] ?? 2000);

interface MorphSample {
  tick: number;
  pop: number;
  births: number;
  deaths: number;
  grazers: number;
  predators: number;
  autotrophs: number;
  parasites: number;
  attached: number;
  scavengers: number;
  extinct: boolean;
}

function sampleMorphs(world: World): MorphSample {
  const s = world.store;
  const n = s.liveCount;
  let grazers = 0,
    predators = 0,
    autotrophs = 0,
    parasites = 0,
    attached = 0,
    scavengers = 0;
  for (let k = 0; k < n; k++) {
    const i = s.liveIndices[k]!;
    const base = i * SCALAR_GENE_COUNT;
    const diet = s.scalarGenes[base + ScalarGene.DIET]!;
    const photo = s.scalarGenes[base + ScalarGene.PHOTOSYNTH]!;
    const para = s.scalarGenes[base + ScalarGene.PARASITISM]!;
    const scav = s.scalarGenes[base + ScalarGene.SCAVENGER]!;
    if (diet > 0.5) predators++;
    else grazers++;
    if (photo > 0.6) autotrophs++;
    if (para > 0.5) {
      parasites++;
      if (s.hostSlot[i]! >= 0) attached++;
    }
    if (scav > 0.5) scavengers++;
  }
  return {
    tick: world.tick,
    pop: n,
    births: world.totalBirths,
    deaths: world.totalDeaths,
    grazers,
    predators,
    autotrophs,
    parasites,
    attached,
    scavengers,
    extinct: n === 0,
  };
}

function runSeed(seed: number): {
  samples: MorphSample[];
  extinctAt: number;
  finalSample: MorphSample;
} {
  const config: Config = defaultConfig({ ...livingWorldOverrides, seed });
  const world = new World(config);
  const samples: MorphSample[] = [];
  let extinctAt = -1;
  for (let t = 0; t < ticks; t++) {
    world.step();
    if ((t + 1) % sampleInterval === 0) {
      const s = sampleMorphs(world);
      samples.push(s);
      if (s.extinct && extinctAt < 0) extinctAt = s.tick;
    }
  }
  const finalSample = sampleMorphs(world);
  if (finalSample.extinct && extinctAt < 0) extinctAt = world.tick;
  return { samples, extinctAt, finalSample };
}

// Single-seed JSON mode: an optional 4th arg `seed` > 0 runs ONE seed and prints a JSON line (no
// summary) so a parallel orchestrator can spawn N of these and aggregate. Used by
// morph-validate-parallel.sh for ~Nx speedup on multi-core machines.
const singleSeed = Number(process.argv[5] ?? 0);
if (singleSeed > 0) {
  const { samples, extinctAt, finalSample } = runSeed(singleSeed);
  const popTrajectory = samples.map((s) => s.pop);
  console.log(JSON.stringify({ seed: singleSeed, extinctAt, final: finalSample, popTrajectory }));
  process.exit(0);
}

console.log(
  `=== morph validation: ${ticks} ticks × ${seedCount} seeds, sample every ${sampleInterval} ===\n`,
);

let survivors = 0;
const extinctSeeds: number[] = [];
const rows: string[] = [];

rows.push(
  'seed |  tick0  tick2k  tick4k  tick6k  tick8k tick10k tick12k tick14k tick16k tick18k tick20k | final pop / eco',
);
rows.push('-----|' + '-'.repeat(120));

for (let seed = 1; seed <= seedCount; seed++) {
  const { samples, extinctAt, finalSample } = runSeed(seed);
  if (extinctAt < 0) survivors++;
  else extinctSeeds.push(seed);

  const popTrajectory = samples.map((s) => String(s.pop).padStart(6)).join(' ');
  const final = finalSample;
  const finalEco = `pop ${String(final.pop).padStart(5)} | g${final.grazers} p${final.predators} a${final.autotrophs} ♗${final.parasites}(${final.attached}) ☠${final.scavengers}`;
  const status = extinctAt < 0 ? 'ALIVE  ' : `EXT@${extinctAt}`;
  rows.push(`  ${seed}  | ${popTrajectory} | ${status} ${finalEco}`);
  console.log(rows[rows.length - 1]);
}

console.log('\n=== SUMMARY ===');
console.log(`survivors: ${survivors}/${seedCount} (${Math.round((survivors / seedCount) * 100)}%)`);
console.log(`extinct seeds: ${extinctSeeds.length ? extinctSeeds.join(', ') : 'none'}`);
console.log(`threshold: ≥75% survive → ${survivors / seedCount >= 0.75 ? 'PASS ✓' : 'FAIL ✗'}`);

process.exit(survivors / seedCount >= 0.75 ? 0 : 1);
