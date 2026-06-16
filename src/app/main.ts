import { World } from '../core/sim/world';
import { defaultConfig } from '../core/sim/config';

const world = new World(defaultConfig({ maxCells: 1000 }));
world.spawn(500);
for (let i = 0; i < 10; i++) world.tick();

const el = document.getElementById('status');
if (el) {
  el.textContent = [
    `crossOriginIsolated: ${globalThis.crossOriginIsolated}`,
    `shared memory: ${world.cells.soa.shared}`,
    `alive cells: ${world.cells.aliveCount}`,
    `tick: ${world.tickCount}`,
  ].join('\n');
}
