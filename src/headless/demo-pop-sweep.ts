/**
 * Demo population-trajectory sweep (2026-06-24 diagnosis). The demo-forage probe showed the DEMO config
 * crashing 524→1 over 8000t on seed 1 — a near-extinction, not a stable monoculture. The only change since
 * last session (when seed 1 held ~150-330 at 6000t) is the rebase pulling main's A1/A2a commits, which ship
 * `bodySense` (A1 interoception) and `brainGatedBiting` (A2a) ON by default. This sweep toggles those OFF to
 * isolate whether they caused the collapse. Reports population at 2k/4k/6k/8k per variant × seed.
 * Run: pnpm tsx src/headless/demo-pop-sweep.ts [ticks]
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';

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
};

const ticks = Number(process.argv[2] ?? 8000);
const SEEDS = [1, 3, 7];
const MARKS = [2000, 4000, 6000, 8000].filter((m) => m <= ticks);

const VARIANTS: { label: string; o: Partial<Config> }[] = [
  { label: 'demo (A1+A2a ON)', o: {} },
  { label: 'bodySense OFF', o: { bodySense: false } },
  { label: 'brainGatedBiting OFF', o: { brainGatedBiting: false } },
  { label: 'both OFF (pre-A1/A2a)', o: { bodySense: false, brainGatedBiting: false } },
];

function run(seed: number, o: Partial<Config>): number[] {
  const world = new World(defaultConfig({ seed, ...DEMO, ...o }));
  const marks: number[] = [];
  let mi = 0;
  for (let t = 1; t <= ticks; t++) {
    world.step();
    if (mi < MARKS.length && t === MARKS[mi]) {
      marks.push(world.population);
      mi++;
    }
  }
  return marks;
}

const hdr = 'variant'.padEnd(24) + 'seed'.padStart(5) + MARKS.map((m) => `t${m}`.padStart(8)).join('');
console.log(`=== demo population trajectory — ${ticks} ticks ===\n`);
console.log(hdr);
console.log('-'.repeat(hdr.length));
for (const v of VARIANTS) {
  for (const seed of SEEDS) {
    const marks = run(seed, v.o);
    console.log(
      v.label.padEnd(24) + `${seed}`.padStart(5) + marks.map((m) => `${m}`.padStart(8)).join(''),
    );
  }
  console.log('-'.repeat(hdr.length));
}
