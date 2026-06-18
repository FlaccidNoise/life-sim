/**
 * Ecology probe. Mirrors the live demo + adds PREDATORS, and traces the THREE-trophic system
 * (plants → foragers → predators) so the predation balance can be tuned headlessly: do all three
 * coexist (no level goes extinct), does the predator cull the forager swarm, does it breathe?
 * Run: pnpm exec tsx src/headless/feel-probe.ts
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
  predMass?: number; // < 2 → faster predator (speed edge)
  mouthR?: number; // predator mouth radius (bigger → larger catch range)
}

function run(t: Trial): void {
  const config = defaultConfig({ maxCells: 100_000, ...BASE, ...t.o });
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
  const predMass = t.predMass ?? 2;
  const mouthR = t.mouthR ?? world.config.cellRadius;
  for (let k = 0; k < t.predators; k++) {
    const g = buildPredatorGenome(world.config.cellRadius, 200); // double seed reserve
    g.genes = g.genes.map((gene) => ({ ...gene, mass: predMass })); // lighter → faster (speed edge)
    g.genes[5] = { ...g.genes[5]!, radius: mouthR }; // bigger maw → larger contact range to snag prey
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
  let series = '';
  for (let tick = 1; tick <= 12000; tick++) {
    world.tick();
    const { foragers, predators } = liveOrganisms(world);
    if (t.predators > 0 && predators === 0 && predExtinct < 0 && tick > 50) predExtinct = tick;
    if (t.foragers > 0 && foragers === 0 && forExtinct < 0 && tick > 50) forExtinct = tick;
    if (tick % 3000 === 0) {
      const m = world.metrics;
      const pack = ((m.population * cellArea) / worldArea) * 100;
      series += `[t${tick / 1000}k F${foragers} P${predators} pk${pack.toFixed(0)}% div${m.diversity.toFixed(2)}] `;
    }
  }
  const dead = [
    predExtinct > 0 ? `PRED@${predExtinct}` : '',
    forExtinct > 0 ? `FOR@${forExtinct}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  console.log(`${t.name.padEnd(22)}: ${series}${dead ? '| EXTINCT ' + dead : '| all 3 survive'}`);
}

console.log(
  '=== PHASE 1: rescale (r4, 2048², scaled energy) — foragers self-sustain + de-jam? ===',
);
// Predation OFF (predators 0, preyDeposit 0). Gate: foragers self-sustain + de-jam + div climbs, multi-seed.
run({ name: 'r4 seed3', plants: 18000, foragers: 70, predators: 0, o: { seed: 3 } });
run({ name: 'r4 seed7', plants: 18000, foragers: 70, predators: 0, o: { seed: 7 } });
run({ name: 'r4 seed42', plants: 18000, foragers: 70, predators: 0, o: { seed: 42 } });
// cap/threshold variants in case foragers struggle at the smaller scale.
run({
  name: 'r4 cap3 s3',
  plants: 18000,
  foragers: 70,
  predators: 0,
  o: { seed: 3, crowdDivideCap: 3 },
});
run({
  name: 'r4 repro220 s3',
  plants: 18000,
  foragers: 70,
  predators: 0,
  o: { seed: 3, reproThreshold: 220 },
});
run({ name: 'r4 seed12k s3', plants: 12000, foragers: 70, predators: 0, o: { seed: 3 } });
