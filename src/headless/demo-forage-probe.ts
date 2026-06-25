/**
 * Demo-config forage-niche diagnostic (2026-06-24). The owner reports a food-preference MONOCULTURE: under
 * the EXACT live-demo config (foodChannels 2, place-coupled, A wall-tied, B drift×3), FORAGE_PREF collapses
 * to ONE channel per seed instead of maintaining an A+B two-niche polymorphism. This probe asks WHY by
 * reporting, over time (every `step` ticks), on the LIVE population:
 *   - prefMean / prefVar / bimodality        — the niche-split signal (var≈0 ⇒ monoculture)
 *   - %A-spec (pref<0.35) / %gen / %B-spec    — the specialist split
 *   - habitat: total channel-A vs channel-B BIOMASS in the field (grid-sampled) — is B diluted by drift?
 *   - occA / occB: how many creatures sit on A-food vs B-food (sampleAt vs sampleAt2 under foot)
 * So we can separate: habitat imbalance (A biomass ≫ B → A wins) vs one habitat going empty vs well-mixed
 * competitive exclusion. Run: pnpm tsx src/headless/demo-forage-probe.ts [ticks] [seed]
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { SCALAR_GENE_COUNT, ScalarGene } from '../core/genome';
import { dispersionStats } from './harness';

// EXACT live-demo overrides (src/app/main.ts).
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
  forageAvailabilityWeighted: true,
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
const seed = Number(process.argv[3] ?? 1);
const STEP = 1000;
// Optional 4th arg "nobody" disables bodySense (the A1 pop-suppressor) so we can read the niche split on a
// HEALTHY population — separating the monoculture from the bodySense crash.
const extra: Partial<Config> = process.argv[4] === 'nobody' ? { bodySense: false } : {};

const cfg = defaultConfig({ seed, ...DEMO, ...extra });
const world = new World(cfg);
const food = world.food;

// Grid-sample the field for per-channel total biomass (the field's buffers are private; sample via the
// public sampleAt/sampleAt2 on a coarse grid covering the world).
function channelBiomass(): { a: number; b: number } {
  const cols = 64,
    rows = 64;
  const cw = cfg.worldWidth / cols;
  const ch = cfg.worldHeight / rows;
  let a = 0,
    b = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * cw;
      const y = (r + 0.5) * ch;
      a += food.sampleAt(x, y);
      b += food.sampleAt2(x, y);
    }
  }
  return { a, b };
}

console.log(`=== demo forage-niche probe — seed ${seed}, ${ticks} ticks ===`);
console.log(
  'tick'.padStart(6) +
    ['pop', 'prefMean', 'prefVar', 'bimod', '%Aspec', '%gen', '%Bspec', 'fieldA', 'fieldB', 'occA', 'occB']
      .map((h) => h.padStart(9))
      .join(''),
);

for (let t = 1; t <= ticks; t++) {
  world.step();
  if (t % STEP !== 0) continue;
  const s = world.store;
  const lc = s.liveCount;
  const prefs: number[] = [];
  let aSpec = 0,
    gen = 0,
    bSpec = 0,
    occA = 0,
    occB = 0;
  for (let k = 0; k < lc; k++) {
    const i = s.liveIndices[k]!;
    const pref = s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.FORAGE_PREF]!;
    prefs.push(pref);
    if (pref < 0.35) aSpec++;
    else if (pref > 0.65) bSpec++;
    else gen++;
    const la = food.sampleAt(s.x[i]!, s.y[i]!);
    const lb = food.sampleAt2(s.x[i]!, s.y[i]!);
    if (la >= lb) occA++;
    else occB++;
  }
  const disp = dispersionStats(prefs);
  let mean = 0;
  for (const p of prefs) mean += p;
  mean /= Math.max(1, prefs.length);
  const fb = channelBiomass();
  const pc = (n: number) => ((100 * n) / Math.max(1, lc)).toFixed(0);
  console.log(
    `${t}`.padStart(6) +
      [
        `${lc}`,
        mean.toFixed(3),
        disp.variance.toFixed(4),
        disp.bimodality.toFixed(2),
        pc(aSpec),
        pc(gen),
        pc(bSpec),
        Math.round(fb.a).toString(),
        Math.round(fb.b).toString(),
        `${occA}`,
        `${occB}`,
      ]
        .map((v) => v.padStart(9))
        .join(''),
  );
}
