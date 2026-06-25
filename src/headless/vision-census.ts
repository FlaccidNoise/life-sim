/**
 * VISION-REVIVAL census probe. The vision genes (VISION_RANGE/FOV/ACUITY + SHELTER_DRIVE, idx 12–15) are
 * "revived" only if they evolve MEASURABLY above their center / above a feature-OFF baseline — this prints
 * the MEAN of each over the live population (gene-variance.ts only reports spread, not mean, and has no
 * ON/OFF hook), paired clustering ON vs OFF on the SAME living-world demo config so clustering is the only
 * variable.
 *
 * Runs against livingWorldOverrides (the real demo config, shared with main.ts) layered with the sweep flags,
 * then clustering on/off on top. Deterministic: same seeds+ticks → same table. Clustering uses only the
 * parcel forked RNG, so the organism stream is untouched (the OFF gate stays byte-identical).
 *
 * Run: npx tsx src/headless/vision-census.ts [--ticks=8000] [--seeds=1,2]
 *        [--center=140] [--appeal=1] [--count=8] [--radius=120]
 *   --center/appeal/count/radius apply to BOTH the ON and OFF arms (center/appeal also to OFF so the only
 *   difference between the arms is clustering); sweep them to find what makes range climb.
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { livingWorldOverrides } from '../app/living-world-config';
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

const ticks = numArg('ticks', 8000);
const seeds = listArg('seeds', [1, 2]);
const center = numArg('center', livingWorldOverrides.visionRange ?? 140);
const appeal = numArg('appeal', livingWorldOverrides.parcelAppeal ?? 1);
const clusterCount = numArg('count', 8);
const clusterRadius = numArg('radius', 120);

// The genes under test (idx 12–15), with the config key that holds each gene's center.
const TARGETS: ReadonlyArray<{ label: string; gene: number; centerKey: keyof Config }> = [
  { label: 'range', gene: ScalarGene.VISION_RANGE, centerKey: 'visionRange' },
  { label: 'fov', gene: ScalarGene.VISION_FOV, centerKey: 'visionFov' },
  { label: 'acuity', gene: ScalarGene.VISION_ACUITY, centerKey: 'visionAcuity' },
  { label: 'shelter', gene: ScalarGene.SHELTER_DRIVE, centerKey: 'shelterDrive' },
];

/** Run one seed `ticks` steps and return the MEAN of each target gene over the live population + pop. */
function censusSeed(cfg: Config): { pop: number; means: number[] } {
  const world = new World(cfg);
  for (let t = 0; t < ticks; t++) world.step();
  const { liveIndices, liveCount, scalarGenes } = world.store;
  const means = TARGETS.map(({ gene }) => {
    if (liveCount === 0) return NaN;
    let sum = 0;
    for (let k = 0; k < liveCount; k++)
      sum += scalarGenes[liveIndices[k]! * SCALAR_GENE_COUNT + gene]!;
    return sum / liveCount;
  });
  return { pop: liveCount, means };
}

/** Build a demo config with the swept knobs + clustering on/off. */
function makeConfig(clustering: boolean, seed: number): Config {
  return defaultConfig({
    ...livingWorldOverrides,
    seed,
    visionRange: center,
    parcelAppeal: appeal,
    parcelClustering: clustering,
    parcelClusterCount: clusterCount,
    parcelClusterRadius: clusterRadius,
  });
}

interface Arm {
  perSeed: { seed: number; pop: number; means: number[] }[];
  avgMeans: number[];
  avgPop: number;
}

function runArm(clustering: boolean): Arm {
  const perSeed = seeds.map((s) => ({ seed: s, ...censusSeed(makeConfig(clustering, s)) }));
  const avgMeans = TARGETS.map(
    (_, i) => perSeed.reduce((a, r) => a + r.means[i]!, 0) / perSeed.length,
  );
  const avgPop = perSeed.reduce((a, r) => a + r.pop, 0) / perSeed.length;
  return { perSeed, avgMeans, avgPop };
}

const centers = TARGETS.map(
  (t) => defaultConfig({ ...livingWorldOverrides, visionRange: center })[t.centerKey] as number,
);

console.log(
  `=== vision census: ${ticks} ticks, seeds [${seeds.join(',')}], world 8192² | ` +
    `center=${center} appeal=${appeal} count=${clusterCount} radius=${clusterRadius} ===`,
);
console.log(`centers: ${TARGETS.map((t, i) => `${t.label}=${centers[i]}`).join('  ')}`);

function printArm(name: string, arm: Arm): void {
  console.log(`\n[${name}]`);
  for (const r of arm.perSeed) {
    console.log(
      `  seed ${r.seed}: pop=${r.pop.toString().padStart(5)}  ` +
        TARGETS.map((t, i) => `${t.label}=${r.means[i]!.toFixed(2)}`).join('  '),
    );
  }
  console.log(
    `  AVG:    pop=${arm.avgPop.toFixed(0).padStart(5)}  ` +
      TARGETS.map((t, i) => {
        const d = arm.avgMeans[i]! - centers[i]!;
        return `${t.label}=${arm.avgMeans[i]!.toFixed(2)}(Δc${d >= 0 ? '+' : ''}${d.toFixed(1)})`;
      }).join('  '),
  );
}

const off = runArm(false);
const on = runArm(true);
printArm('clustering OFF', off);
printArm('clustering ON', on);

console.log('\nDELTA (ON − OFF):');
console.log(
  '  ' +
    TARGETS.map((t, i) => {
      const d = on.avgMeans[i]! - off.avgMeans[i]!;
      return `${t.label}=${d >= 0 ? '+' : ''}${d.toFixed(2)}`;
    }).join('  '),
);
// Per-seed sign-consistency for range (the primary target): did ON beat OFF on EVERY seed?
const rangeIdx = 0;
const perSeedRangeDelta = seeds.map(
  (_, k) => on.perSeed[k]!.means[rangeIdx]! - off.perSeed[k]!.means[rangeIdx]!,
);
const allPositive = perSeedRangeDelta.every((d) => d > 0);
const rangeOnAvg = on.avgMeans[rangeIdx]!;
console.log(
  `\nRANGE: ON avg ${rangeOnAvg.toFixed(1)} (center ${centers[rangeIdx]}), ` +
    `per-seed ON−OFF = [${perSeedRangeDelta.map((d) => d.toFixed(1)).join(', ')}] ` +
    `→ ${allPositive ? 'ON beats OFF on every seed' : 'NOT consistent across seeds'}`,
);
