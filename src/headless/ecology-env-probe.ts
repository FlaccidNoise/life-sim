/**
 * M7.5 MERGE validation: does the 3-trophic ecology (plants → foragers → predators) still coexist
 * once the predation economy ALSO carries the environment Waves (day/night, temperature, toxin,
 * current, rocks)? This is the combined economy the live demo (src/app/main.ts) now runs. The
 * rebase put predation on top of env; this probe is the gate before the ff-merge to main.
 *
 * Mirrors the demo's config + seeding EXACTLY, then runs 12k ticks across seeds and asserts no
 * trophic level goes extinct. Run: pnpm exec tsx src/headless/ecology-env-probe.ts
 */
import { World } from '../core/sim/world';
import { defaultConfig, type Config } from '../core/sim/config';
import {
  buildForagerGenome,
  buildNightForagerGenome,
  buildGlowForagerGenome,
  buildToxinAvoiderGenome,
  buildPredatorGenome,
} from '../core/genome/critter-genome';

const FORAGER_INIT_E = 45;
const PRED_INIT_E = FORAGER_INIT_E * 8;

function liveOrganisms(w: World): { foragers: number; predators: number } {
  const cc = w.organisms.cellCount;
  const carn = w.organisms.carnivore;
  let foragers = 0;
  let predators = 0;
  for (let org = 1; org < cc.length; org++) {
    if (cc[org]! === 0) continue;
    if (carn[org] === 1) predators++;
    else foragers++;
  }
  return { foragers, predators };
}

function plantCount(w: World): number {
  // PHOTO cells = trophic level 1. Count live plant cells directly.
  const f = w.cells.fields;
  let n = 0;
  for (let i = 0; i < w.cells.capacity; i++) if (w.cells.isAlive(i) && f.cellType[i] === 0) n++;
  return n;
}

// The EXACT live-demo config (src/app/main.ts) — ecology economy + predation knobs + env features ON.
function demoConfig(seed: number): Config {
  return defaultConfig({
    seed,
    maxCells: 300_000,
    maxBonds: 131_072,
    maxOrganisms: 65_536,
    cellRadius: 4,
    worldWidth: 2048,
    worldHeight: 2048,
    initialPhotoFraction: 1,
    initialMotileFraction: 0,
    crowdDivideCap: 4,
    crowdGridSize: 32,
    divideThreshold: 70,
    reproThreshold: 280,
    reproParentFloor: 60,
    organismDeathFloor: 0,
    basalCost: 0.004,
    cruiseThrust: 1,
    maxThrust: 8,
    preyDeposit: 5,
    predDigestRate: 40,
    predDigestEfficiency: 0.9,
    predReach: 1.5,
    predLatchRange: 2.5,
    predLatchStiffness: 1.0,
    carnivoreThrustMult: 2.0,
    predScentDeposit: 5,
    predFleeWeight: 1.0, // LOCKED via the combined-economy flee sweep (flee0/0.5/1/2 @ seeds 3/42):
    // 1.0 keeps the healthiest predator layer (P9/P11 vs flee2's P6/P6 drift) while all 3 levels
    // survive — strongest sustained two-way pressure (active fleeing arms race), not over-protected prey.
    mutationWeightRate: 0.25,
    mutationWeightSigma: 0.1,
    mutationParamRate: 0.1,
    mutationParamSigma: 0.1,
    mutationChangeTypeRate: 0.015,
    mutationSensorChannelRate: 0.01,
    // ── Environmental features (the env Waves) ──
    dayNightDepth: 0.5,
    dayLength: 800,
    seasonLength: 10000,
    seasonDepth: 0.2,
    rockCount: 40,
    rockRadiusMin: 8,
    rockRadiusMax: 20,
    rockRepulsion: 4,
    rockGridSize: 64,
    tempPatchCount: 12,
    tempMin: 0,
    tempMax: 1,
    tempComfortLow: 0.3,
    tempComfortHigh: 0.7,
    tempColdPenalty: 0.25,
    tempHeatPenalty: 0.25,
    glowGridCols: 32,
    glowGridRows: 32,
    glowDiffuse: 0.2,
    glowDecay: 0.05,
    glowGain: 1,
    glowCost: 0.02,
    toxinGridCols: 64,
    toxinGridRows: 64,
    toxinDiffuse: 0.2,
    toxinDecay: 0.03,
    toxinDamage: 0.04,
    toxinDepositOnMeatDecay: 0.1,
    currentGridCols: 32,
    currentGridRows: 32,
    currentPatchCount: 16,
    currentPatchRadius: 6,
    currentStrength: 2,
    currentEvolveRate: 0.05,
  });
}

function seedDemo(world: World): void {
  world.seedLife(18000);
  const spawnX = (k: number) => world.config.worldWidth * (0.1 + (0.8 * ((k * 7) % 20)) / 20);
  const spawnY = (k: number) => world.config.worldHeight * (0.1 + (0.8 * ((k * 13) % 20)) / 20);
  const spawnH = (k: number) => (k * 2.39996) % (Math.PI * 2);
  for (let k = 0; k < 250; k++) {
    const r = k % 10;
    const g =
      r < 7
        ? buildForagerGenome(world.config.cellRadius, FORAGER_INIT_E)
        : r === 7
          ? buildNightForagerGenome(world.config.cellRadius, FORAGER_INIT_E)
          : r === 8
            ? buildGlowForagerGenome(world.config.cellRadius, FORAGER_INIT_E)
            : buildToxinAvoiderGenome(world.config.cellRadius, FORAGER_INIT_E);
    world.spawnOrganism(g, spawnX(k), spawnY(k), spawnH(k));
  }
  for (let k = 0; k < 24; k++) {
    world.spawnOrganism(
      buildPredatorGenome(world.config.cellRadius, PRED_INIT_E, -1.5),
      world.config.worldWidth * (0.15 + (0.7 * ((k * 11) % 13)) / 13),
      world.config.worldHeight * (0.15 + (0.7 * ((k * 5) % 13)) / 13),
      (k * 1.7) % (Math.PI * 2),
    );
  }
}

const TICKS = 12000;

function run(seed: number): { seed: number; survives: boolean; line: string } {
  const world = new World(demoConfig(seed), false);
  seedDemo(world);
  let plantExt = -1;
  let forExt = -1;
  let predExt = -1;
  let series = '';
  for (let t = 1; t <= TICKS; t++) {
    world.tick();
    const { foragers, predators } = liveOrganisms(world);
    const plants = plantCount(world);
    if (plants === 0 && plantExt < 0 && t > 50) plantExt = t;
    if (foragers === 0 && forExt < 0 && t > 50) forExt = t;
    if (predators === 0 && predExt < 0 && t > 50) predExt = t;
    if (t % 3000 === 0) {
      series += `[t${t / 1000}k PL${plants} F${foragers} P${predators} d${world.metrics.diversity.toFixed(2)}] `;
    }
  }
  const dead = [
    plantExt > 0 ? `PLANT@${plantExt}` : '',
    forExt > 0 ? `FORAGER@${forExt}` : '',
    predExt > 0 ? `PRED@${predExt}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const survives = !dead;
  const line = `seed ${String(seed).padEnd(3)}: ${series}${survives ? '| ALL 3 COEXIST ✓' : '| EXTINCT ' + dead}`;
  return { seed, survives, line };
}

console.log('=== M7.5 combined-economy validation (env Waves + predation), 12k ticks ===\n');
const results = [3, 7, 42, 99].map(run);
for (const r of results) console.log(r.line);
const passed = results.filter((r) => r.survives).length;
console.log(`\n${passed}/${results.length} seeds: all three trophic levels coexist.`);
