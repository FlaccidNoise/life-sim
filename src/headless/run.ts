import { World } from '../core/sim/world';
import { defaultConfig } from '../core/sim/config';

const world = new World(defaultConfig({ seed: 1, maxCells: 100_000 }));
world.spawn(100_000);

const ticks = 1000;
const start = performance.now();
for (let i = 0; i < ticks; i++) world.tick();
const ms = performance.now() - start;

console.log(`shared memory: ${world.cells.soa.shared}`);
console.log(`alive cells:   ${world.cells.aliveCount}`);
console.log(`ticks:         ${world.tickCount}`);
console.log(`elapsed:       ${ms.toFixed(1)} ms (${(ticks / (ms / 1000)).toFixed(0)} ticks/s)`);
