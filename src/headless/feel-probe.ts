/**
 * Ecology probe. Mirrors the live demo + adds PREDATORS, and traces the THREE-trophic system
 * (plants → foragers → predators) so the predation balance can be tuned headlessly: do all three
 * coexist (no level goes extinct), does the predator cull the forager swarm, does it breathe?
 * Run: pnpm exec tsx src/headless/feel-probe.ts
 *
 * Two modes (gated on argv[2]):
 *   diag       — FAST single-seed diagnostic in a ¼-area arena (1024²), 5k ticks. The rescale
 *                economy is scale-invariant (income & basal ∝ area; predator-prey contact is local)
 *                so behaviour transfers, but a run finishes in seconds → tight tuning loop.
 *   (default)  — FULL validation: 2048² arena, 12k ticks, seeds 3/7/42/99, the SUCCESS BAR.
 */
import { World } from '../core/sim/world';
import { defaultConfig, type Config } from '../core/sim/config';
import { develop } from '../core/genome/develop';
import { instantiateBody } from '../core/organism/instantiate';
import { buildForagerGenome, buildPredatorGenome } from '../core/genome/critter-genome';

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

function spawn(
  w: World,
  genome: ReturnType<typeof buildForagerGenome>,
  x: number,
  y: number,
  h: number,
): void {
  const ref = w.genomes.register(genome);
  const body = develop(genome, w.config.maxCellsPerOrganism, w.config.maxRecursionDepth);
  instantiateBody(
    body,
    w.cells,
    w.net,
    w.bonds,
    w.organisms,
    ref,
    x,
    y,
    h,
    w.config.worldWidth,
    w.config.worldHeight,
    w.instantiateScratch,
    w.glowEffectors,
  );
}

// PHASE 1 RESCALE base: smaller cells (r4, area 16 vs 36), bigger world (2048²), energy quantities
// scaled by area ratio (~0.44) so the economy is self-similar. break-even light is scale-invariant
// (income & basal both ∝ area). crowdGridSize stays 32 (cellSize now 8, so a bucket holds ~32 r4
// cells at full pack — cap re-derived empirically). Body geometry auto-compacts (offsets are r-relative).
const FORAGER_INIT_E = 45; // forager per-cell seed energy (was 100 at r6; scaled ~0.44)
const BASE: Partial<Config> = {
  seed: 3,
  cellRadius: 4,
  worldWidth: 2048,
  worldHeight: 2048,
  initialPhotoFraction: 1,
  initialMotileFraction: 0,
  crowdDivideCap: 2,
  crowdGridSize: 32,
  divideThreshold: 70, // plant division threshold scaled from 150 (r6) by area ratio
  basalCost: 0.012,
  reproThreshold: 280, // organism repro scaled from 600 (r6) by area ratio
  reproParentFloor: 60,
  organismDeathFloor: 0,
  cruiseThrust: 1,
  maxThrust: 8,
  mutationWeightRate: 0.25,
  mutationWeightSigma: 0.1,
  mutationParamRate: 0.1,
  mutationParamSigma: 0.1,
  mutationChangeTypeRate: 0.015,
};

interface Trial {
  name: string;
  plants: number;
  foragers: number;
  predators: number;
  o: Partial<Config>;
  /** Carnivore speed edge — config.carnivoreThrustMult (>1 = predators outrun equal-speed prey). */
  predThrustMult?: number;
  /** Ambush brake strength — buildPredatorGenome's sensorFwd→thrust weight (negative = loiter in scent). */
  fwdThrustWeight?: number;
  /** Predator seed reserve as a multiple of FORAGER_INIT_E (survives the early hunt-establish gauntlet). */
  predReserveMult?: number;
}

function run(t: Trial, ticks: number, world1024: boolean): void {
  const arena: Partial<Config> = world1024 ? { worldWidth: 1024, worldHeight: 1024 } : {};
  const config = defaultConfig({
    maxCells: 300_000,
    maxBonds: 131_072,
    maxOrganisms: 65_536,
    ...BASE,
    ...arena,
    carnivoreThrustMult: t.predThrustMult ?? 1,
    ...t.o,
  });
  const world = new World(config);
  world.seedLife(t.plants);
  for (let k = 0; k < t.foragers; k++) {
    spawn(
      world,
      buildForagerGenome(world.config.cellRadius, FORAGER_INIT_E),
      world.config.worldWidth * (0.1 + (0.8 * ((k * 7) % 20)) / 20),
      world.config.worldHeight * (0.1 + (0.8 * ((k * 13) % 20)) / 20),
      (k * 2.39996) % (Math.PI * 2),
    );
  }
  const fwd = t.fwdThrustWeight ?? -1.5;
  const reserveMult = t.predReserveMult ?? 2;
  for (let k = 0; k < t.predators; k++) {
    const g = buildPredatorGenome(world.config.cellRadius, FORAGER_INIT_E * reserveMult, fwd);
    spawn(
      world,
      g,
      world.config.worldWidth * (0.15 + (0.7 * ((k * 11) % 13)) / 13),
      world.config.worldHeight * (0.15 + (0.7 * ((k * 5) % 13)) / 13),
      (k * 1.7) % (Math.PI * 2),
    );
  }

  const worldArea = config.worldWidth * config.worldHeight;
  const cellArea = Math.PI * config.cellRadius * config.cellRadius;
  let predExtinct = -1;
  let forExtinct = -1;
  let predMax = t.predators;
  let predMin = t.predators;
  let forMax = t.foragers;
  const sample = Math.round(ticks / 10);
  let series = '';
  for (let tick = 1; tick <= ticks; tick++) {
    world.tick();
    const { foragers, predators } = liveOrganisms(world);
    if (predators > predMax) predMax = predators;
    if (predators < predMin) predMin = predators;
    if (foragers > forMax) forMax = foragers;
    if (t.predators > 0 && predators === 0 && predExtinct < 0 && tick > 50) predExtinct = tick;
    if (t.foragers > 0 && foragers === 0 && forExtinct < 0 && tick > 50) forExtinct = tick;
    if (tick % sample === 0) {
      const m = world.metrics;
      const pack = ((m.population * cellArea) / worldArea) * 100;
      series += `[${tick} F${foragers} P${predators} pk${pack.toFixed(0)}%] `;
    }
  }
  const dead = [
    predExtinct > 0 ? `PRED@${predExtinct}` : '',
    forExtinct > 0 ? `FOR@${forExtinct}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  // predBred = predators reproduced above the seed count → the cycle breathes on the top trophic level.
  const predBred = predMax > t.predators ? `predMax${predMax}` : 'predNoBreed';
  console.log(
    `${t.name.padEnd(26)}: ${series}| ${predBred} forMax${forMax} ${dead ? 'EXTINCT ' + dead : 'ALL3'}`,
  );
}

const mode = process.argv[2] ?? 'full';

if (mode === 'diag') {
  // DIAG12: push BIGGER than 2048² (Josh wants even bigger). The longevity config sustains predators at
  // 2048²; does it scale up? Hold the 2048² density (plants 18000 / foragers 250 / predators 24 per
  // 4.19e6 area) and the longevity economy, sweep world up to 3072². 8k ticks, seed 3.
  console.log('=== DIAG12: bigger worlds via longevity (latch+ambush, 8k, seed 3) ===');
  const base = {
    basalCost: 0.004,
    preyDeposit: 5,
    predDigestRate: 40,
    predDigestEfficiency: 0.9,
    predReach: 1.5,
    crowdDivideCap: 4,
    predLatchRange: 2.5,
    predLatchStiffness: 1.0,
  };
  const A = { predThrustMult: 2.0, fwdThrustWeight: -1.5, predReserveMult: 8 } as const;
  for (const ws of [2048, 2560, 3072]) {
    const a = (ws * ws) / (2048 * 2048);
    run(
      {
        name: `world${ws} s3`,
        plants: Math.round(18000 * a),
        foragers: Math.round(250 * a),
        predators: Math.round(24 * a),
        o: { ...base, worldWidth: ws, worldHeight: ws, seed: 3 },
        ...A,
      },
      8000,
      false,
    );
  }
} else {
  // LOCKED ECOLOGY CONFIG — VALIDATED: all 3 trophic levels coexist across seeds 3/7/42/99 for 12k
  // ticks with NO top-ups at 1024² (predators settle 1-4, foragers 67-194, plants 42-58% pack).
  // WORLD SIZE is the binding constraint: the predator layer needs a minimum local prey density for
  // its ambush bite-rate, so larger worlds are too sparse — 1280² is marginal (2/4 seeds wink out at
  // P1) and the 2048² Phase-1 target cannot host a BREEDING predator at all (subsistence P1 → death).
  // Mechanism: ambush brain (sensorFwd→thrust -1.5, brake/loiter in prey-scent, sidestep pursuit-lag)
  // + carnivore speed edge (carnivoreThrustMult 2.0) + strike-reach (predReach 1.5) + strong prey-scent
  // (preyDeposit 5) + 4× predator reserve (early gauntlet) + the LATCH (predLatchRange 2.5 + rest-length
  // tether predLatchStiffness 1.0) — the latch ~doubled the predator bloom and turned extinction into
  // coexistence at this scale. CAVEAT: coexistence is a damped equilibrium, not sustained boom-bust
  // "breathing" — predators are few and the prey settles to a fixed point. Counts hold the diagnostic
  // density (4290 plants / 17 foragers / 11.4 predators per 1e6 area).
  // LOCKED ECOLOGY CONFIG — VALIDATED at the full 2048² target via LONGEVITY (Josh's direction). All 4
  // seeds (3/7/42/99) reach STABLE 3-trophic coexistence for 12k with no top-ups: predators settle 8-13
  // (predMax 25-30, well above the seed 24 → a real breeding population, not subsistence), foragers
  // 506-657, plants 51-58% pack. The predator layer failed here before because creatures bled out
  // traversing the sparse field between meals. The fix is longer life + richer kills, NOT a smaller
  // world: lower global basalCost (0.012→0.004) makes every creature bleed ~3× slower (overcomes the
  // distance) AND lets plants accumulate faster → denser prey → more contact; richer kills (predDigestRate
  // 40, efficiency 0.9) + 8× predator reserve fund reproduction at the lower contact rate; the LATCH
  // converts each contact into a completed kill. basalCost is an existing knob → determinism defaults
  // unchanged. Prey pre-bloomed (250 foragers) as a richer one-time seed (not a top-up). CAVEAT: a damped
  // equilibrium (settles to a stable point), not dramatic boom-bust — predators do bloom (25-30) then settle.
  console.log('=== FULL validation: 2048² LONGEVITY, 12k ticks, seeds 3/7/42/99 ===');
  const LOCKED = {
    basalCost: 0.004,
    preyDeposit: 5,
    predDigestRate: 40,
    predDigestEfficiency: 0.9,
    predReach: 1.5,
    crowdDivideCap: 4,
    predLatchRange: 2.5,
    predLatchStiffness: 1.0,
    worldWidth: 2048,
    worldHeight: 2048,
  };
  const W = { predThrustMult: 2.0, fwdThrustWeight: -1.5, predReserveMult: 8 } as const;
  for (const seed of [3, 7, 42, 99]) {
    run(
      {
        name: `full s${seed}`,
        plants: 18000,
        foragers: 250,
        predators: 24,
        o: { ...LOCKED, seed },
        ...W,
      },
      12000,
      false,
    );
  }
}
