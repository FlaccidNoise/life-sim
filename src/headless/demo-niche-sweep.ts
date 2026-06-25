/**
 * Monoculture lever sweep (2026-06-24 diagnosis). The demo collapses to an A-specialist monoculture: by
 * tick 8000 every creature sits on A-food and channel-B habitat is abandoned (occB→0) despite the field
 * holding MORE B biomass. Diagnosed cause: A is a STABLE niche (wall-tied, slow drift) while B is FUGITIVE
 * (pocket drift rate 1.0 + biomass advection driftMult 3), and the 2-channel graze (economy.ts) does NOT
 * availability-weight, so a B-specialist off its drifting pocket starves rather than falling back. This
 * sweep tests which single lever revives a maintained A+B split. bodySense OFF throughout (it crashes seed 1
 * — another session's in-flight work — and would confound the niche signal). Reports the FINAL-tick split.
 * Run: pnpm tsx src/headless/demo-niche-sweep.ts [ticks]
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { SCALAR_GENE_COUNT, ScalarGene } from '../core/genome';
import { dispersionStats } from './harness';

const DEMO: Partial<Config> = {
  wallRegionCount: 5,
  flowStrength: 0.35,
  flowPushStrength: 0.25,
  motorSquash: true,
  foodPatchCount: 40,
  foodPatchRadius: 8,
  foodChannels: 2,
  foodPocketChannelMode: 1,
  foodChannelAWallTied: true,
  foodChannelBDriftMult: 3,
  fertilityDriftRate: 1,
  fertilityDriftInterval: 20,
  foodPocketDriftRateA: 0.2,
  foodPocketDriftRateB: 1.0,
  pocketDriftSpeed: 0.6,
  pheromoneEnabled: true,
  hungerSense: true,
  scentIdentity: true,
  parcelsEnabled: true,
  parcelEnergy: 80,
  parcelSpawnInterval: 6,
  parcelCapacity: 120,
  visionFovCost: 0.02,
  visionAcuityCost: 0.02,
  basalCost: 0.08,
  hungerGatesFood: true,
  foodDriveFloor: 0.7,
  breedCooldown: 150,
  ageStages: true,
  bodySense: false, // measurement substrate — keep seed 1 alive so the niche signal isn't pop-crash noise
};

const ticks = Number(process.argv[2] ?? 8000);
const SEEDS = [1, 3, 5, 7];

const VARIANTS: { label: string; o: Partial<Config> }[] = [
  { label: 'availW spec0.5 (base bonus)', o: { forageAvailabilityWeighted: true, forageSpecBonus: 0.5 } },
  { label: 'availW spec0.65', o: { forageAvailabilityWeighted: true, forageSpecBonus: 0.65 } },
];

interface Row {
  pop: number;
  aSpec: number;
  gen: number;
  bSpec: number;
  occB: number;
  prefVar: number;
  bimod: number;
}

function run(seed: number, o: Partial<Config>): Row {
  const cfg = defaultConfig({ seed, ...DEMO, ...o });
  const world = new World(cfg);
  const food = world.food;
  for (let t = 1; t <= ticks; t++) world.step();
  const s = world.store;
  const prefs: number[] = [];
  let aSpec = 0,
    gen = 0,
    bSpec = 0,
    occB = 0;
  for (let k = 0; k < s.liveCount; k++) {
    const i = s.liveIndices[k]!;
    const pref = s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.FORAGE_PREF]!;
    prefs.push(pref);
    if (pref < 0.35) aSpec++;
    else if (pref > 0.65) bSpec++;
    else gen++;
    if (food.sampleAt2(s.x[i]!, s.y[i]!) > food.sampleAt(s.x[i]!, s.y[i]!)) occB++;
  }
  const d = dispersionStats(prefs);
  return { pop: s.liveCount, aSpec, gen, bSpec, occB, prefVar: d.variance, bimod: d.bimodality };
}

const hdr =
  'variant'.padEnd(24) +
  'seed'.padStart(5) +
  ['pop', '%Aspec', '%gen', '%Bspec', 'occB', 'prefVar', 'bimod'].map((h) => h.padStart(9)).join('');
console.log(`=== monoculture lever sweep — ${ticks} ticks, bodySense OFF ===`);
console.log(`win = B niche survives: %Bspec>0, occB>0, prefVar stays high\n`);
console.log(hdr);
console.log('-'.repeat(hdr.length));
for (const v of VARIANTS) {
  for (const seed of SEEDS) {
    const r = run(seed, v.o);
    const pc = (n: number) => ((100 * n) / Math.max(1, r.pop)).toFixed(0);
    console.log(
      v.label.padEnd(24) +
        `${seed}`.padStart(5) +
        [`${r.pop}`, pc(r.aSpec), pc(r.gen), pc(r.bSpec), `${r.occB}`, r.prefVar.toFixed(4), r.bimod.toFixed(2)]
          .map((x) => x.padStart(9))
          .join(''),
    );
  }
  console.log('-'.repeat(hdr.length));
}
