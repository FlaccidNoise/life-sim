import { type World } from '../core/sim/world';
import { type Camera } from '../render/webgl-renderer';
import { wrapDelta } from '../core/math/vec2';
import { isNeural } from '../core/cells/types';

const NAMES = ['PHOTO', 'DIGESTIVE', 'MEAT', 'MOTILE', 'SENSOR', 'NEURON', 'MOVER'];

/** Pick the nearest live cell to a screen click and render its details. */
export function inspectAt(
  world: World,
  camera: Camera,
  screenX: number,
  screenY: number,
  viewW: number,
  viewH: number,
  panel: HTMLElement,
): void {
  const wx = camera.x + (screenX - viewW / 2) / camera.scale;
  const wy = camera.y + (screenY - viewH / 2) / camera.scale;
  const f = world.cells.fields;
  const live = world.liveIndices;
  let best = -1;
  let bestD2 = Infinity;
  for (let k = 0; k < world.liveCount; k++) {
    const i = live[k]!;
    const dx = wrapDelta(wx - f.posX[i]!, world.config.worldWidth);
    const dy = wrapDelta(wy - f.posY[i]!, world.config.worldHeight);
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  if (best < 0) {
    panel.textContent = 'no cells';
    return;
  }
  const t = f.cellType[best]!;
  const act = world.net.actCur[best]!;
  const neural = isNeural(t) ? ` | act ${act.toFixed(3)}` : '';
  const org = f.organismId[best]!;
  let orgInfo = '';
  if (org !== 0) {
    const ref = world.organisms.genomeRef[org]!;
    const gen = ref >= 0 ? world.genomes.get(ref) : undefined;
    const genTag = ref >= 0 ? ` g#${ref}${gen ? ` gen${gen.generation}` : ''}` : '';
    orgInfo = ` | org #${org} cells ${world.organisms.cellCount[org]} E ${world.organisms.energy[org]!.toFixed(0)}${genTag}`;
  }
  panel.textContent =
    `#${best} ${NAMES[t] ?? t} | energy ${f.energy[best]!.toFixed(1)} | ` +
    `age ${f.age[best]} | pos ${f.posX[best]!.toFixed(0)},${f.posY[best]!.toFixed(0)}${neural}${orgInfo}`;
}
