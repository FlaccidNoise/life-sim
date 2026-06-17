/**
 * Carrying-capacity tuning probe. Mirrors the live demo (src/app/main.ts) and sweeps the
 * density-dependent PHOTO divide cap (crowdDivideCap) + world/movement knobs to find a
 * de-jammed regime where the predator-prey cycle still BREATHES (births AND deaths sustained,
 * no extinction, no frozen plateau). Run: pnpm exec tsx src/headless/feel-probe.ts
 */
import { World } from '../core/sim/world';
import { defaultConfig, type Config } from '../core/sim/config';
import { develop } from '../core/genome/develop';
import { instantiateBody } from '../core/organism/instantiate';
import { buildForagerGenome } from '../core/genome/critter-genome';

function countLiveOrganisms(w: World): number {
  const cc = w.organisms.cellCount;
  let n = 0;
  for (let org = 1; org < cc.length; org++) if (cc[org]! > 0) n++;
  return n;
}

// THE LOCKED DEMO CONFIG (to be wired into src/app/main.ts). Verify long-horizon stability
// + print a time series of the predator-prey cycle.
const DEMO: Partial<Config> = {
  seed: 3,
  worldWidth: 1536,
  worldHeight: 1536,
  crowdDivideCap: 2,
  crowdGridSize: 32,
  basalCost: 0.012,
  reproThreshold: 600,
  cruiseThrust: 1,
  maxThrust: 8,
};

function trace(
  label: string,
  seedPhoto: number,
  foragers: number,
  cap: number,
  extra: Partial<Config> = {},
): void {
  const config = defaultConfig({
    maxCells: 100_000,
    initialPhotoFraction: 1,
    initialMotileFraction: 0,
    reproParentFloor: 120,
    organismDeathFloor: 0,
    mutationWeightRate: 0.25,
    mutationWeightSigma: 0.1,
    mutationParamRate: 0.1,
    mutationParamSigma: 0.1,
    mutationChangeTypeRate: 0.015,
    ...DEMO,
    crowdDivideCap: cap,
    ...extra,
  });
  const world = new World(config);
  world.seedLife(seedPhoto);
  for (let k = 0; k < foragers; k++) {
    const genome = buildForagerGenome(world.config.cellRadius);
    const ref = world.genomes.register(genome);
    const body = develop(genome, world.config.maxCellsPerOrganism, world.config.maxRecursionDepth);
    instantiateBody(
      body,
      world.cells,
      world.net,
      world.bonds,
      world.organisms,
      ref,
      world.config.worldWidth * (0.1 + (0.8 * ((k * 7) % 20)) / 20),
      world.config.worldHeight * (0.1 + (0.8 * ((k * 13) % 20)) / 20),
      (k * 2.39996) % (Math.PI * 2),
      world.config.worldWidth,
      world.config.worldHeight,
      world.instantiateScratch,
    );
  }
  const worldArea = config.worldWidth * config.worldHeight;
  const cellArea = Math.PI * config.cellRadius * config.cellRadius;
  let extinctAt = -1;
  let last = '';
  for (let t = 1; t <= 16000; t++) {
    world.tick();
    const orgs0 = countLiveOrganisms(world);
    if (orgs0 === 0 && extinctAt < 0 && t > 100) extinctAt = t;
    if (t % 2000 === 0) {
      const m = world.metrics;
      const orgs = countLiveOrganisms(world);
      const packing = ((m.population * cellArea) / worldArea) * 100;
      last += `[t${t / 1000}k o${orgs} pk${packing.toFixed(0)}% d${m.diversity.toFixed(2)}] `;
    }
  }
  console.log(`${label.padEnd(20)}:\n  ${last}${extinctAt > 0 ? `EXTINCT@${extinctAt}` : ''}`);
}

// Final confirmation of the LOCKED demo config (DEMO above) over 16k ticks, across seeds.
console.log(
  '=== LOCKED demo config: 1536² cap2/g32 basal.012 repro600 frisky, 6500 plants, 40 foragers ===',
);
trace('demo seed3', 6500, 40, 2, { seed: 3 });
trace('demo seed7', 6500, 40, 2, { seed: 7 });
trace('demo seed42', 6500, 40, 2, { seed: 42 });
