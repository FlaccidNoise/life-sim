import { World } from '../core/sim/world';
import { defaultConfig } from '../core/sim/config';

// M2: seed the breathing 2-trophic regime (default 2048² world) and report the
// economy telemetry so a headless run shows the food web is alive, not collapsed.
const world = new World(defaultConfig({ seed: 1, maxCells: 60_000 }));
world.seedLife(20_000);

const ticks = 1000;
const start = performance.now();
for (let i = 0; i < ticks; i++) world.tick();
const ms = performance.now() - start;
const m = world.metrics;

console.log(`shared memory: ${world.cells.soa.shared}`);
console.log(
  `population:    ${m.population}  (photo ${m.photo}, digestive ${m.digestive}, motile ${m.motile}, meat ${m.meat})`,
);
console.log(`mean energy:   ${m.meanEnergy.toFixed(1)}`);
console.log(
  `diversity:     ${m.diversity.toFixed(3)}  (phenotypic Simpson; >0 ⇒ 2nd trophic level alive)`,
);
console.log(`last tick b/d: ${world.lastBirths}/${world.lastDeaths}`);
console.log(`ticks:         ${world.tickCount}`);
// rebuildLive scans full capacity each tick; this line surfaces whether that
// O(maxCells) scan dominates in the realised (possibly sparse) population regime.
console.log(
  `elapsed:       ${ms.toFixed(1)} ms (${(ticks / (ms / 1000)).toFixed(0)} ticks/s)` +
    `  [rebuildLive scans ${world.config.maxCells} slots/tick]`,
);
