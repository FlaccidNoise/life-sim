import { World } from '../core/sim/world';
import { defaultConfig } from '../core/sim/config';
import { develop } from '../core/genome/develop';
import { buildCritterGenome, buildAutotrophGenome } from '../core/genome/critter-genome';
import { instantiateBody } from '../core/organism/instantiate';

// (1) Development acceptance, headless: the hand-authored genome → the M5 critter wiring.
const critter = develop(buildCritterGenome(6), 256, 16);
console.log('=== critter genome → developed body ===');
console.log(`cells:    ${critter.count} (expect 7)`);
console.log(`bonds:    ${critter.bonds.length} (expect 15)`);
console.log(`synapses: ${critter.synapses.length} (expect 5)`);
console.log(`motors:   ${critter.motors.length} (expect 1)  truncated: ${critter.truncated}`);

// (2) Reproduction world: autotrophs on a bright field accumulate energy + reproduce.
const cfg = defaultConfig({
  seed: 1,
  maxCells: 20_000,
  worldWidth: 1024,
  worldHeight: 1024,
  lightPatchCount: 64,
  lightMax: 2,
  photoGain: 0.2,
  reproThreshold: 500,
  reproParentFloor: 150,
});
const world = new World(cfg, false);
const scratch = world.instantiateScratch;
for (let k = 0; k < 8; k++) {
  const ref = world.genomes.register(buildAutotrophGenome(cfg.cellRadius));
  const body = develop(
    buildAutotrophGenome(cfg.cellRadius),
    cfg.maxCellsPerOrganism,
    cfg.maxRecursionDepth,
  );
  instantiateBody(
    body,
    world.cells,
    world.net,
    world.bonds,
    world.organisms,
    ref,
    200 + k * 80,
    512,
    0,
    cfg.worldWidth,
    cfg.worldHeight,
    scratch,
  );
}

let totalBirths = 0;
let totalDeaths = 0;
for (let t = 0; t < 3000; t++) {
  world.tick();
  totalBirths += world.lastOrganismBirths;
  totalDeaths += world.lastOrganismDeaths;
}
let maxGen = 0;
for (const e of world.genomes.list()) maxGen = Math.max(maxGen, e.genome.generation);

console.log('\n=== reproduction run (3000 ticks) ===');
console.log(`organism births:        ${totalBirths}`);
console.log(`organism deaths:        ${totalDeaths}`);
console.log(`genomes in library:     ${world.genomes.size}`);
console.log(`max lineage generation: ${maxGen}`);
console.log(`births→adulthood:       ${world.birthsReachedAdulthood}`);
console.log(`live organisms:         ${world.metrics.liveOrganisms}`);
console.log(`population:             ${world.metrics.population}`);
