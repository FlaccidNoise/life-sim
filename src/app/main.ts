import { World } from '../core/sim/world';
import { defaultConfig } from '../core/sim/config';
import { wrapDelta } from '../core/math/vec2';
import { Renderer, type Camera } from '../render/webgl-renderer';
import { LightOverlay } from '../render/light-overlay';
import { FoodOverlay } from '../render/food-overlay';
import { BondOverlay } from '../render/bond-overlay';
import { TelemetryDashboard } from './telemetry';
import { inspectAt } from './inspect';
import { mountControls } from './controls';
import { BrainInspector } from './brain-inspector';
import { spawnSwimmer } from '../core/sim/critter';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const hud = document.getElementById('hud');

const config = defaultConfig({ maxCells: 100_000 });
const world = new World(config);
world.seedLife(20_000);

// M4 demo: a few hand-wired swimmer critters whose brains chase food. Remember the
// first critter's organism so the brain inspector can scope to a single, legible network.
const demoCritter = spawnSwimmer(
  world,
  world.config.worldWidth * 0.5,
  world.config.worldHeight * 0.5,
  0,
);
spawnSwimmer(world, world.config.worldWidth * 0.5 + 120, world.config.worldHeight * 0.5, Math.PI);

const f = world.cells.fields;

function createRenderer(): Renderer {
  try {
    return new Renderer(canvas, config.maxCells, config.cellRadius * 2);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (hud) hud.textContent = `Viewer needs WebGL2 — initialisation failed: ${msg}`;
    throw err;
  }
}
const renderer = createRenderer();
const camera: Camera = { x: config.worldWidth / 2, y: config.worldHeight / 2, scale: 1 };

// Light-field heatmap overlay (toggled with `L`). Shares the renderer's GL context.
const overlay = new LightOverlay(renderer.gl, world.light);
let showLight = false;

// Food/smell-gradient heatmap overlay (toggled with `F`). Shares the GL context.
const foodOverlay = new FoodOverlay(renderer.gl, world.food);
let showFood = false;
const FOOD_DISPLAY_MAX = 8; // smell scale for the heatmap; tune to taste

// Bond-network + energy-flow overlay (toggled with `O`): a 2D canvas layered over the
// WebGL viewport, drawing each live bond as a segment coloured by its energy gap.
const bondsCanvas = document.getElementById('bonds') as HTMLCanvasElement;
const bondOverlay = new BondOverlay(bondsCanvas);
let showBonds = false;

// Brain inspector overlay (toggled with `B`): live neuron-cell network of a critter.
const brainCanvas = document.getElementById('brain') as HTMLCanvasElement;
const brain = new BrainInspector(brainCanvas);
let showBrain = false;

// Legend / "what am I seeing" overlay (toggled with `H`); shown by default.
const legend = document.getElementById('legend');

// Telemetry dashboard + inspect panel + live economy knobs.
const dash = new TelemetryDashboard(document.getElementById('telemetry') as HTMLCanvasElement);
const inspectPanel = document.getElementById('inspect') as HTMLElement;
mountControls(document.getElementById('controls') as HTMLElement, config);

// Previous-step snapshots for render interpolation (smooth motion at any speed).
// NaN marks a slot we have no previous position for — a never-snapshotted newborn,
// including a division child placed in a pristine (never-freed) slot; the renderer
// draws those statically so they don't streak from the world origin. prevGen catches
// the other newborn case: a corpse slot recycled into a child the same tick.
const prevX = new Float64Array(config.maxCells);
const prevY = new Float64Array(config.maxCells);
const prevGen = new Uint32Array(config.maxCells);
prevX.fill(NaN);
prevY.fill(NaN);
for (let i = 0; i < config.maxCells; i++) {
  if (world.cells.isAlive(i)) {
    prevX[i] = f.posX[i]!;
    prevY[i] = f.posY[i]!;
    prevGen[i] = f.generation[i]!;
  }
}

// Follow-cam: click locks the camera onto the nearest cell; C / Escape releases.
// followGen pins the generation so the lock auto-releases when that cell dies and
// its slot is recycled into a different cell.
let followId = -1;
let followGen = 0;

function pickNearest(screenX: number, screenY: number): number {
  const wx = camera.x + (screenX - canvas.width / 2) / camera.scale;
  const wy = camera.y + (screenY - canvas.height / 2) / camera.scale;
  const live = world.liveIndices;
  let best = -1;
  let bestD2 = Infinity;
  for (let k = 0; k < world.liveCount; k++) {
    const i = live[k]!;
    // Toroidal nearest — matches inspectAt (inspect.ts), so follow + inspect never disagree.
    const dx = wrapDelta(wx - f.posX[i]!, world.config.worldWidth);
    const dy = wrapDelta(wy - f.posY[i]!, world.config.worldHeight);
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}

function updateFollowCam(): void {
  if (followId < 0) return;
  if (!world.cells.isAlive(followId) || f.generation[followId]! !== followGen) {
    followId = -1;
    return;
  }
  // Centre on the organism centroid for bonded cells; else pin to the single cell.
  const org = f.organismId[followId]!;
  if (org !== 0 && world.organisms.cellCount[org]! > 0) {
    camera.x = world.organisms.centroidX[org]!;
    camera.y = world.organisms.centroidY[org]!;
  } else {
    camera.x = f.posX[followId]!;
    camera.y = f.posY[followId]!;
  }
}

function drawScene(alpha: number): void {
  updateFollowCam();
  renderer.clear();
  if (showLight) {
    overlay.render(camera, world.light, config.lightMax, canvas.width, canvas.height);
  }
  if (showFood) {
    foodOverlay.render(camera, world.food, FOOD_DISPLAY_MAX, canvas.width, canvas.height);
  }
  renderer.render(world, camera, prevX, prevY, prevGen, alpha);
  if (showBonds) {
    bondOverlay.render(world, camera);
  }
  if (showBrain) {
    // Scope to the followed cell's organism if it's a neural critter, else the demo critter.
    const followOrg =
      followId >= 0 && world.cells.isAlive(followId) && f.organismId[followId]! > 0
        ? f.organismId[followId]!
        : demoCritter.organismId;
    brain.render(world, followOrg);
  }
}

function fit(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  renderer.resize(canvas.width, canvas.height);
  bondOverlay.resize(canvas.width, canvas.height);
  camera.scale =
    Math.min(canvas.width / config.worldWidth, canvas.height / config.worldHeight) * 0.95;
}
window.addEventListener('resize', fit);
fit();

// Fixed-timestep state.
let speed = 0.25; // physics ticks advanced per rendered frame (fractional = slow-mo)
let paused = false;
let accumulator = 0;
const MAX_STEPS = 64;

function snapshot(): void {
  // Only update slots that are currently live, so never-live slots keep their NaN
  // sentinel (a pristine slot only gets a real prev once it has held a live cell).
  const live = world.liveIndices;
  const n = world.liveCount;
  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    prevX[i] = f.posX[i]!;
    prevY[i] = f.posY[i]!;
    prevGen[i] = f.generation[i]!;
  }
}

// Pan with mouse drag. A near-stationary press+release (<4px) is a click → inspect.
let dragging = false;
let lastX = 0;
let lastY = 0;
let downX = 0;
let downY = 0;
canvas.addEventListener('mousedown', (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  downX = e.clientX;
  downY = e.clientY;
});
window.addEventListener('mouseup', (e) => {
  if (dragging) {
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (moved < 4) {
      inspectAt(world, camera, e.clientX, e.clientY, canvas.width, canvas.height, inspectPanel);
      const id = pickNearest(e.clientX, e.clientY);
      if (id >= 0) {
        followId = id;
        followGen = f.generation[id]!;
      }
    }
  }
  dragging = false;
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  camera.x -= (e.clientX - lastX) / camera.scale;
  camera.y -= (e.clientY - lastY) / camera.scale;
  lastX = e.clientX;
  lastY = e.clientY;
});

// Zoom with wheel.
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    camera.scale *= Math.exp(-e.deltaY * 0.001);
  },
  { passive: false },
);

// Time controls: space = pause, '.' = single step, ']' / '[' = faster / slower.
window.addEventListener('keydown', (e) => {
  if (e.key === ' ') {
    paused = !paused;
    accumulator = 0;
    e.preventDefault();
  } else if (e.key === '.') {
    snapshot();
    world.tick();
    snapshot(); // prev == cur → render the stepped state statically
  } else if (e.key === ']') {
    speed = Math.min(16, speed * 1.5);
  } else if (e.key === '[') {
    speed = Math.max(0.02, speed / 1.5);
  } else if (e.key === 'l' || e.key === 'L') {
    showLight = !showLight;
  } else if (e.key === 'f' || e.key === 'F') {
    showFood = !showFood;
  } else if (e.key === 'o' || e.key === 'O') {
    showBonds = !showBonds;
    bondsCanvas.style.display = showBonds ? 'block' : 'none';
  } else if (e.key === 'b' || e.key === 'B') {
    showBrain = !showBrain;
    brainCanvas.classList.toggle('hidden', !showBrain);
  } else if (e.key === 'h' || e.key === 'H') {
    legend?.classList.toggle('hidden');
  } else if (e.key === 'c' || e.key === 'C' || e.key === 'Escape') {
    followId = -1;
  }
});

let frames = 0;
let fps = 0;
let lastFpsT = performance.now();

function updateHud(): void {
  if (!hud) return;
  const m = world.metrics;
  const net = world.net;
  hud.textContent =
    `cells ${world.cells.aliveCount}  ·  tick ${world.tickCount}  ·  ${fps} fps  ·  ` +
    `${speed.toFixed(2)}×${paused ? ' paused' : ''}  ·  zoom ${camera.scale.toFixed(2)}\n` +
    `photo ${m.photo}  dig ${m.digestive}  motile ${m.motile}  meat ${m.meat}` +
    `   ·   ⌀energy ${m.meanEnergy.toFixed(0)}  ·  diversity ${m.diversity.toFixed(3)}\n` +
    `brain: ${net.liveNeuronCount} neurons · ${net.liveSynapseCount} synapses` +
    `   ·   light ${showLight ? 'on' : 'off'}  smell ${showFood ? 'on' : 'off'}  bonds ${showBonds ? 'on' : 'off'}` +
    `${followId >= 0 ? `  ·  follow #${followId}` : ''}   ·   ${legend && !legend.classList.contains('hidden') ? 'H hide legend' : 'H legend'}`;
}

function loop(): void {
  if (!paused) {
    accumulator += speed;
    let steps = 0;
    while (accumulator >= 1 && steps < MAX_STEPS) {
      snapshot();
      world.tick();
      accumulator -= 1;
      steps++;
    }
    if (steps === MAX_STEPS) accumulator = 0; // drop backlog rather than spiral
  }

  const alpha = paused ? 1 : Math.min(1, accumulator);
  drawScene(alpha);

  dash.push(world.metrics);
  dash.draw(world.metrics);

  frames++;
  const now = performance.now();
  if (now - lastFpsT >= 500) {
    fps = Math.round((frames * 1000) / (now - lastFpsT));
    frames = 0;
    lastFpsT = now;
    updateHud();
  }
  requestAnimationFrame(loop);
}

updateHud();
requestAnimationFrame(loop);

// Debug/automation handle — also handy from the browser console for live poking.
interface SimHandle {
  world: World;
  camera: Camera;
  setSpeed: (s: number) => void;
}
(globalThis as unknown as { sim: SimHandle }).sim = {
  world,
  camera,
  setSpeed: (s) => {
    speed = s;
  },
};
