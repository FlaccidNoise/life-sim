/**
 * SIMPLIFICATION-AUDIT ablation harness (2026-06-19). Mirrors the EXACT live demo (src/app/main.ts):
 * the 8192² archipelago config + the 20-community founder scene (3 plant bases + 5 foragers + 1 predator
 * per light pocket). Runs the baseline plus a battery of single-system ABLATIONS (each turns ONE system
 * OFF via a config override) and reports, per run, the population trajectory + a "breathing" metric
 * (coefficient of variation + oscillation count over the back half) + extinction times.
 *
 * Purpose: empirically answer "does each system EARN its complexity by changing ecological dynamics?".
 * A system whose ablation barely moves the trajectory is not load-bearing (removal candidate); an
 * ablation that INCREASES oscillation amplitude was damping the dynamics the owner wants ("breathing").
 *
 * Run:  pnpm exec tsx src/headless/ablation-probe.ts <keys|all|baseline|census> [ticks] [seed] [driftoff]
 *   pnpm exec tsx src/headless/ablation-probe.ts all 6000 3
 *   pnpm exec tsx src/headless/ablation-probe.ts all 6000 3 driftoff   # drift-off = the living-ecosystem baseline
 *   pnpm exec tsx src/headless/ablation-probe.ts census 6000 3 driftoff
 */
import { World } from '../core/sim/world';
import { defaultConfig, type Config } from '../core/sim/config';
import { CellType } from '../core/cells/types';
import {
  buildForagerGenome,
  buildNightForagerGenome,
  buildToxinAvoiderGenome,
  buildPredatorGenome,
} from '../core/genome/critter-genome';

const FORAGER_INIT_E = 40;
const PRED_INIT_E = 560;

// ── EXACT live-demo config (src/app/main.ts:57-234) ──────────────────────────────────────────────
function demoConfig(seed: number): Config {
  return defaultConfig({
    seed,
    maxCells: 400_000,
    maxBonds: 262_144,
    maxOrganisms: 131_072,
    cellRadius: 4,
    worldWidth: 8192,
    worldHeight: 8192,
    initialPhotoFraction: 1,
    initialMotileFraction: 0,
    crowdDivideCap: 4,
    crowdGridSize: 32,
    divideThreshold: 70,
    reproThreshold: 150,
    reproParentFloor: 15,
    organismDeathFloor: 0,
    basalCost: 0.0008,
    cruiseThrust: 1,
    maxThrust: 14,
    thrustScale: 5,
    thrustBias: 3,
    turnScale: 0.45,
    moveCost: 0.0015,
    preyDeposit: 5,
    predDigestRate: 40,
    predDigestEfficiency: 0.9,
    predReach: 1.5,
    predLatchRange: 2.5,
    predLatchStiffness: 1.0,
    carnivoreThrustMult: 2.0,
    predScentDeposit: 5,
    predFleeWeight: 1.0,
    driftAmplitude: 48,
    loudnessGain: 0.5,
    viewRange: 32,
    viewHalfAngle: 0.6,
    mutationSenseSourceRate: 0.02,
    herbivoreLatch: true,
    grazeRate: 4,
    grazeLatchRange: 2.5,
    grazeLatchStiffness: 20,
    grazeSatiation: 50,
    exploreWander: 0.3,
    patrolCruise: 6,
    mutationWeightRate: 0.25,
    mutationWeightSigma: 0.1,
    mutationParamRate: 0.1,
    mutationParamSigma: 0.1,
    mutationChangeTypeRate: 0.015,
    mutationSensorChannelRate: 0.01,
    dayNightDepth: 0.5,
    dayLength: 800,
    seasonLength: 10000,
    seasonDepth: 0.2,
    rockCount: 80,
    rockRadiusMin: 8,
    rockRadiusMax: 20,
    rockRepulsion: 4,
    rockGridSize: 64,
    tempPatchCount: 24,
    tempMin: 0,
    tempMax: 1,
    tempComfortLow: 0.3,
    tempComfortHigh: 0.7,
    tempColdPenalty: 0.25,
    tempHeatPenalty: 0.25,
    glowGridCols: 64,
    glowGridRows: 64,
    glowDiffuse: 0.2,
    glowDecay: 0.05,
    glowGain: 1,
    glowCost: 0.02,
    toxinGridCols: 128,
    toxinGridRows: 128,
    toxinDiffuse: 0.2,
    toxinDecay: 0.03,
    toxinDamage: 0.04,
    toxinDepositOnMeatDecay: 0.1,
    currentGridCols: 64,
    currentGridRows: 64,
    currentPatchCount: 16,
    currentPatchRadius: 6,
    currentStrength: 0,
    currentEvolveRate: 0.05,
    sessilePlants: true,
    plantGrowthThreshold: 12,
    plantGrowthCost: 8,
    plantBondLen: 10,
    plantSporeThreshold: 90,
    plantSporeCost: 55,
    plantSporeImpulse: 8,
    plantSettleSpeed: 1.0,
    plantBaseDensityCap: 6,
    lightGridCols: 64,
    lightGridRows: 64,
    lightPatchCount: 20,
    lightPatchRadius: 2,
    lightDiffuse: 0.02,
    foodDecay: 0.06,
  });
}

// ── ABLATIONS: each turns ONE system OFF (or to its no-op value) ──────────────────────────────────
const ABLATIONS: Record<string, Partial<Config>> = {
  baseline: {},
  'no-sight': { viewRange: 0, viewHalfAngle: 0 },
  'no-hearing': { loudnessGain: 0 },
  'no-drift': { driftAmplitude: 0 },
  'smell-only': { viewRange: 0, viewHalfAngle: 0, loudnessGain: 0 },
  'no-toxin': { toxinDamage: 0, toxinDepositOnMeatDecay: 0 },
  'no-temp': { tempColdPenalty: 0, tempHeatPenalty: 0 },
  'no-daynight': { dayNightDepth: 0, seasonDepth: 0 },
  'no-rocks': { rockCount: 0 },
  'no-glow': { glowCost: 0, glowGain: 0 },
  'no-env': {
    toxinDamage: 0,
    toxinDepositOnMeatDecay: 0,
    tempColdPenalty: 0,
    tempHeatPenalty: 0,
    dayNightDepth: 0,
    seasonDepth: 0,
    rockCount: 0,
    glowCost: 0,
    glowGain: 0,
  },
  'no-flee': { predFleeWeight: 0, predScentDeposit: 0 },
  'no-speededge': { carnivoreThrustMult: 1 },
  'no-pred-latch': { predLatchRange: 0, predLatchStiffness: 0 },
  'no-predation': { predDigestRate: 0 },
  'no-transfer': { transferRate: 0 },
  'no-crowdcap': { crowdDivideCap: 65535, plantBaseDensityCap: 65535 },
  'weak-graze-tether': { grazeLatchStiffness: 1.0 },
  'no-graze-latch': { herbivoreLatch: false },
  'no-satiation-stack': { grazeSatiation: 1e9, exploreWander: 0, patrolCruise: 0 },
  'fewer-foragers': {}, // seeding-level knob — handled in seedArchipelago via FORAGERS_OVERRIDE
  'no-dampers': {
    crowdDivideCap: 65535,
    plantBaseDensityCap: 65535,
    grazeLatchStiffness: 1.0,
    predFleeWeight: 0,
    predScentDeposit: 0,
    grazeSatiation: 1e9,
    exploreWander: 0,
    patrolCruise: 0,
  },
};

// A plant base/chain is ALSO an organism (seedPlantBase allocs one), so a non-carnivore organism is a
// real FORAGER only if it has ≥1 brain/body cell — an all-PHOTO organism is a sessile plant. Classify
// by scanning live cells once.
function liveOrganisms(w: World): { foragers: number; predators: number; plantOrgs: number } {
  const cc = w.organisms.cellCount;
  const carn = w.organisms.carnivore;
  const f = w.cells.fields;
  const isCreatureCell = new Uint8Array(cc.length);
  for (let i = 0; i < w.cells.capacity; i++) {
    if (!w.cells.isAlive(i)) continue;
    const org = f.organismId[i]!;
    if (org === 0) continue;
    const t = f.cellType[i]!;
    if (t !== CellType.PHOTO && t !== CellType.MEAT) isCreatureCell[org] = 1;
  }
  let foragers = 0;
  let predators = 0;
  let plantOrgs = 0;
  for (let org = 1; org < cc.length; org++) {
    if (cc[org]! === 0) continue;
    if (carn[org] === 1) predators++;
    else if (isCreatureCell[org]) foragers++;
    else plantOrgs++;
  }
  return { foragers, predators, plantOrgs };
}

function plantCount(w: World): number {
  const f = w.cells.fields;
  let n = 0;
  for (let i = 0; i < w.cells.capacity; i++) if (w.cells.isAlive(i) && f.cellType[i] === 0) n++;
  return n;
}

// Mirror main.ts:242-306 — the 20-community archipelago founder scene. foragersPerIsland overridable
// for the grazing-pressure experiment (Tier 1.1).
function seedArchipelago(world: World, foragersPerIsland = 5): void {
  const config = world.config;
  const COMMUNITY_COUNT = 20;
  const PLANT_BASES_PER_ISLAND = 3;
  const lf = world.light;
  const patchW = config.worldWidth / lf.cols;
  const patchH = config.worldHeight / lf.rows;
  const ranked = Array.from(lf.field, (v, i) => ({
    v,
    col: i % lf.cols,
    row: (i / lf.cols) | 0,
  })).sort((a, b) => b.v - a.v);
  const pockets: { x: number; y: number }[] = [];
  for (const cell of ranked) {
    if (pockets.length >= COMMUNITY_COUNT) break;
    const x = cell.col * patchW + patchW / 2;
    const y = cell.row * patchH + patchH / 2;
    const far = pockets.every(
      (p) => Math.abs(p.x - x) > 2 * patchW || Math.abs(p.y - y) > 2 * patchH,
    );
    if (far) pockets.push({ x, y });
  }
  const CREATURE_OFFSET = 90;
  const foragerVariants = [buildForagerGenome, buildNightForagerGenome, buildToxinAvoiderGenome];
  let fIdx = 0;
  for (let c = 0; c < pockets.length; c++) {
    const p = pockets[c]!;
    for (let b = 0; b < PLANT_BASES_PER_ISLAND; b++) {
      const a = (b / PLANT_BASES_PER_ISLAND) * Math.PI * 2;
      world.seedPlantBase(p.x + Math.cos(a) * 50 * b, p.y + Math.sin(a) * 50 * b);
    }
    for (let k = 0; k < foragersPerIsland; k++) {
      const a = (fIdx * 2.39996) % (Math.PI * 2);
      world.spawnOrganism(
        foragerVariants[fIdx % foragerVariants.length]!(config.cellRadius, FORAGER_INIT_E),
        p.x + Math.cos(a) * CREATURE_OFFSET,
        p.y + Math.sin(a) * CREATURE_OFFSET,
        a,
      );
      fIdx++;
    }
    world.spawnOrganism(
      buildPredatorGenome(config.cellRadius, PRED_INIT_E, -1.5),
      p.x + CREATURE_OFFSET,
      p.y + CREATURE_OFFSET,
      1.0,
    );
  }
}

// Breathing metric: coefficient of variation + local-extrema count over the back half of a series.
function breathing(series: number[]): {
  mean: number;
  cv: number;
  min: number;
  max: number;
  osc: number;
} {
  const half = series.slice(Math.floor(series.length / 2));
  const n = half.length || 1;
  const mean = half.reduce((s, v) => s + v, 0) / n;
  const variance = half.reduce((s, v) => s + (v - mean) * (v - mean), 0) / n;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
  let osc = 0;
  for (let i = 1; i < half.length - 1; i++) {
    const a = half[i - 1]!,
      b = half[i]!,
      c = half[i + 1]!;
    if ((b > a && b > c) || (b < a && b < c)) osc++;
  }
  return { mean, cv, min: Math.min(...half), max: Math.max(...half), osc };
}

function run(key: string, seedN: number, ticks: number): string {
  const cfg = { ...demoConfig(seedN), ...basePatch, ...ABLATIONS[key] };
  const world = new World(cfg, false);
  seedArchipelago(world, key === 'fewer-foragers' ? 2 : 5);
  const SAMPLE = 100;
  const fSeries: number[] = [];
  const pSeries: number[] = [];
  let forExt = -1,
    predExt = -1,
    plantExt = -1;
  let coarse = '';
  for (let t = 1; t <= ticks; t++) {
    world.tick();
    const { foragers, predators } = liveOrganisms(world);
    if (foragers === 0 && forExt < 0 && t > 50) forExt = t;
    if (predators === 0 && predExt < 0 && t > 50) predExt = t;
    if (t % SAMPLE === 0) {
      const plants = plantCount(world);
      if (plants === 0 && plantExt < 0) plantExt = t;
      fSeries.push(foragers);
      pSeries.push(predators);
      if (t % ((ticks / 6) | 0 || 1) < SAMPLE)
        coarse += `[${(t / 1000).toFixed(1)}k PL${plants} F${foragers} P${predators}] `;
    }
  }
  const bf = breathing(fSeries);
  const bp = breathing(pSeries);
  const ext =
    [
      plantExt > 0 ? `PLANT@${plantExt}` : '',
      forExt > 0 ? `FOR@${forExt}` : '',
      predExt > 0 ? `PRED@${predExt}` : '',
    ]
      .filter(Boolean)
      .join(',') || 'ALL3';
  return (
    `${key.padEnd(20)} ${ext.padEnd(14)} ` +
    `F[mean ${bf.mean.toFixed(0)} cv ${bf.cv.toFixed(2)} min${bf.min} max${bf.max} osc${bf.osc}] ` +
    `P[mean ${bp.mean.toFixed(1)} cv ${bp.cv.toFixed(2)} min${bp.min} max${bp.max} osc${bp.osc}]\n` +
    `${' '.repeat(20)} ${coarse}`
  );
}

// CENSUS: count live SENSOR cells by modality (SenseSource.SMELL=0 SIGHT=1 HEARING=2) over a run — the
// direct test of "does any creature actually USE sight/hearing?".
function census(seedN: number, ticksN: number): void {
  const cfg = { ...demoConfig(seedN), ...basePatch };
  const world = new World(cfg, false);
  seedArchipelago(world);
  const f = world.cells.fields;
  const tally = (): string => {
    const net = world.net;
    let smell = 0,
      sight = 0,
      hearing = 0;
    for (let k = 0; k < net.sensorCount; k++) {
      const i = net.sensorCell[k]!;
      if (!world.cells.isAlive(i) || f.cellType[i] !== CellType.SENSOR) continue;
      const s = net.sensorSource[k]!;
      if (s === 0) smell++;
      else if (s === 1) sight++;
      else hearing++;
    }
    return `SMELL ${smell} SIGHT ${sight} HEARING ${hearing} (total ${smell + sight + hearing})`;
  };
  console.log(
    `=== SENSOR MODALITY CENSUS (8192² live demo${basePatchLabel}), ${ticksN} ticks, seed ${seedN} ===`,
  );
  console.log(`t0: ${tally()}`);
  for (let t = 1; t <= ticksN; t++) {
    world.tick();
    if (t % 1000 === 0) console.log(`t${t}: ${tally()}`);
  }
}

const arg = process.argv[2] ?? 'baseline';
const ticks = Number(process.argv[3] ?? 6000);
const seed = Number(process.argv[4] ?? 3);
// Optional global base patch applied to EVERY run, e.g. "driftoff" makes drift-off the new baseline so
// each ablation's effect is measured in a LIVING ecosystem (drift-on collapses everything → confound).
const basePatch: Partial<Config> = process.argv[5] === 'driftoff' ? { driftAmplitude: 0 } : {};
const basePatchLabel = process.argv[5] ? ' +' + process.argv[5] : '';
const keys = arg === 'all' ? Object.keys(ABLATIONS) : arg.split(',');

if (arg === 'census') {
  census(seed, ticks);
} else {
  console.log(
    `=== ABLATION (8192² live-demo mirror${basePatchLabel}), ${ticks} ticks, seed ${seed} ===`,
  );
  console.log(
    `metric: F/P = foragers/predators; cv = coeff of variation (back half), osc = local extrema count\n`,
  );
  for (const k of keys) {
    if (!(k in ABLATIONS)) {
      console.log(`?? unknown ablation "${k}" — known: ${Object.keys(ABLATIONS).join(', ')}`);
      continue;
    }
    console.log(run(k, seed, ticks));
  }
}
