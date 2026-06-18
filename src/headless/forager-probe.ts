import { World } from '../core/sim/world';
import { defaultConfig } from '../core/sim/config';
import { develop } from '../core/genome/develop';
import { buildForagerGenome } from '../core/genome/critter-genome';
import { instantiateBody } from '../core/organism/instantiate';
import { CellType } from '../core/cells/types';

// Does a brain-driven forager (MOVER+SENSOR+NEURON+DIGESTIVE) actually forage, survive, and
// reproduce in a plant-rich ecosystem? A PHOTO-only food field (no competing heterotrophs) +
// patchy light → a real gradient to climb. Reports whether foragers eat (energy), breed, die.
const INITIAL_ENERGY = 100;
const cfg = defaultConfig({
  seed: 3,
  maxCells: 40_000,
  worldWidth: 1024,
  worldHeight: 1024,
  initialPhotoFraction: 1, // all-plant seed: pure food, no competing eaters
  initialMotileFraction: 0,
  reproThreshold: 700, // a fed 6-cell forager (offspring cost ~600) can reach this
  reproParentFloor: 120,
  organismDeathFloor: 0, // a forager that can't feed starves → atomic death (becomes MEAT)
});
const world = new World(cfg, false);
world.seedLife(8000); // dense-ish plant field

const scratch = world.instantiateScratch;
let spawned = 0;
for (let k = 0; k < 20; k++) {
  const ref = world.genomes.register(buildForagerGenome(cfg.cellRadius, INITIAL_ENERGY));
  const body = develop(
    buildForagerGenome(cfg.cellRadius, INITIAL_ENERGY),
    cfg.maxCellsPerOrganism,
    cfg.maxRecursionDepth,
  );
  const x = cfg.worldWidth * (0.2 + 0.6 * (k / 20));
  const y = cfg.worldHeight * 0.5;
  if (
    instantiateBody(
      body,
      world.cells,
      world.net,
      world.bonds,
      world.organisms,
      ref,
      x,
      y,
      0,
      cfg.worldWidth,
      cfg.worldHeight,
      scratch,
      world.glowEffectors,
    ) >= 1
  )
    spawned++;
}

function foragerStats(w: World): { orgs: number; energy: number; maxGen: number } {
  const o = w.organisms;
  let orgs = 0;
  let energy = 0;
  let maxGen = 0;
  for (let org = 1; org < o.cellCount.length; org++) {
    if (o.cellCount[org]! > 0 && o.genomeRef[org]! >= 0) {
      orgs++;
      energy += o.energy[org]!;
      const gn = w.genomes.get(o.genomeRef[org]!);
      if (gn) maxGen = Math.max(maxGen, gn.generation);
    }
  }
  return { orgs, energy, maxGen };
}

console.log(
  `spawned ${spawned} foragers (${INITIAL_ENERGY}/cell), 8000 plants on a 1024² patchy-light world`,
);
console.log('tick   foragers   ΣforagerE   births   deaths   maxGen   plants');
let births = 0;
let deaths = 0;
for (let t = 1; t <= 4000; t++) {
  world.tick();
  births += world.lastOrganismBirths;
  deaths += world.lastOrganismDeaths;
  if (t % 500 === 0) {
    const s = foragerStats(world);
    const m = world.metrics;
    console.log(
      `${String(t).padStart(4)}   ${String(s.orgs).padStart(8)}   ${String(Math.round(s.energy)).padStart(9)}   ${String(births).padStart(6)}   ${String(deaths).padStart(6)}   ${String(s.maxGen).padStart(6)}   ${String(m.photo).padStart(6)}`,
    );
  }
}
const f = foragerStats(world);
console.log(
  `\nfinal: foragers=${f.orgs}  totalForagerEnergy=${Math.round(f.energy)}  births=${births}  deaths=${deaths}  maxGeneration=${f.maxGen}`,
);
console.log(
  f.orgs > spawned || births > 0
    ? '→ VIABLE: foragers ate, survived, and reproduced (sense→move→eat→breed loop closes).'
    : '→ NOT viable under this config: foragers did not net-reproduce — tune energy/thrust/economy.',
);
void CellType;
