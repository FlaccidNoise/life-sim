/**
 * Browser entry — wires the deterministic sim core to the WebGL renderer and the observability shell,
 * and runs the loop. The browser is a renderer + control surface bolted onto the SAME core the
 * headless harness runs; there is never a second sim code path.
 *
 * The loop is fixed-timestep and decoupled from rendering: each animation frame, if running, advances
 * `ticksPerFrame` sim steps then draws. The sim never reads wall-clock (tps is display-only), so
 * speed scales work, not a time delta — determinism holds.
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { Renderer } from '../render/renderer';
import { Controls } from './observability/controls';
import { Knobs } from './observability/knobs';
import { Inspector } from './observability/inspector';
import { TimeSeriesGraph } from './observability/graph';

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
}

const canvas = el<HTMLCanvasElement>('view');
const hudBody = el('hud-body');

let config: Config = defaultConfig();
let world = new World(config);

let renderer: Renderer;
try {
  renderer = new Renderer(canvas, config.worldWidth, config.worldHeight, config.maxOrganisms);
} catch (err) {
  hudBody.textContent = `Renderer init failed: ${err instanceof Error ? err.message : String(err)}`;
  throw err;
}

const graph = new TimeSeriesGraph(el<HTMLCanvasElement>('graph'), [
  { label: 'pop', color: '#8ad9f2' }, // cyan
  { label: 'food', color: '#7fe0a0' }, // green
  { label: 'births', color: '#e8d36b' }, // yellow
  { label: 'deaths', color: '#e08a8a' }, // red
]);
const inspector = new Inspector(el('inspector'));

let running = false;
let speed = 1; // sim ticks per animation frame; <1 = slow-mo (interpolated for fluid motion)
let showFood = true; // food heatmap overlay (toggle with 'f')
let selected: { slot: number; gen: number } | null = null;
// Camera: centre in world units + zoom (1 = whole world fits). Scroll to zoom, drag to pan.
let camX = config.worldWidth / 2;
let camY = config.worldHeight / 2;
let zoom = 1;

const controls = new Controls(el('controls'), config.seed, {
  onPlayToggle: () => {
    running = !running;
    controls.setRunning(running);
  },
  onStep: () => {
    world.step();
  },
  onReset: (seed: number) => {
    config = { ...config, seed };
    rebuild();
  },
  onSpeed: (n: number) => {
    speed = n;
  },
});

new Knobs(el('knobs'), config, {
  // Live knob: mutate the config the world already holds → effect next tick, no reset.
  onLive: (key, value) => {
    (config[key] as number) = value;
  },
  // Seed-time knob: apply and rebuild the world from the seed.
  onReset: (key, value) => {
    config = { ...config, [key]: value };
    rebuild();
  },
  // Live boolean toggle (e.g. learning on/off): mutate config in place → effect next tick, no reset.
  onToggle: (key, value) => {
    (config[key] as boolean) = value;
  },
});

function rebuild(): void {
  world = new World(config);
  selected = null;
  inspector.clear();
  prevBirths = 0;
  prevDeaths = 0;
}

// Inspect: pick the nearest live organism to a screen point.
function selectAt(clientX: number, clientY: number): void {
  const p = renderer.screenToWorld(clientX, clientY);
  const s = world.store;
  let best = -1;
  let bestD = Infinity;
  for (let k = 0; k < s.liveCount; k++) {
    const i = s.liveIndices[k]!;
    const dx = s.x[i]! - p.x;
    const dy = s.y[i]! - p.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best >= 0) {
    selected = { slot: best, gen: s.genId[best]! };
    inspector.select(best, selected.gen);
  }
}

// Scroll to zoom, around the cursor (the world point under the cursor stays put).
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const before = renderer.screenToWorld(e.clientX, e.clientY);
    const newZoom = Math.min(64, Math.max(1, zoom * Math.exp(-e.deltaY * 0.0015)));
    const k = zoom / newZoom;
    camX = before.x - (before.x - camX) * k;
    camY = before.y - (before.y - camY) * k;
    zoom = newZoom;
  },
  { passive: false },
);

// Drag to pan; a press that barely moves is a click → inspect.
let dragging = false;
let lastX = 0;
let lastY = 0;
let dragDist = 0;
canvas.addEventListener('mousedown', (e) => {
  dragging = true;
  dragDist = 0;
  lastX = e.clientX;
  lastY = e.clientY;
});
globalThis.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  dragDist += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
  const a = renderer.screenToWorld(lastX, lastY);
  const b = renderer.screenToWorld(e.clientX, e.clientY);
  camX -= b.x - a.x; // grab-and-drag: the world follows the cursor
  camY -= b.y - a.y;
  lastX = e.clientX;
  lastY = e.clientY;
});
globalThis.addEventListener('mouseup', (e) => {
  if (dragging && dragDist < 5) selectAt(e.clientX, e.clientY); // negligible movement → a click
  dragging = false;
});

globalThis.addEventListener('resize', () => renderer.resize());

// 'f' toggles the food heatmap overlay.
globalThis.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') showFood = !showFood;
});

// tps measurement (display only — never fed back into the sim).
let lastT = performance.now();
let lastTick = 0;
let tps = 0;
// vital-rate deltas for the graph (births/deaths since the last frame).
let prevBirths = 0;
let prevDeaths = 0;

// Render interpolation state: a snapshot of positions BEFORE the most recent step, so the renderer
// can lerp toward the current state for fluid motion at fractional speeds. Sized to capacity.
const prevX = new Float64Array(config.maxOrganisms);
const prevY = new Float64Array(config.maxOrganisms);
const prevGen = new Uint32Array(config.maxOrganisms);
let acc = 0; // fractional-tick accumulator (slow-mo)
const STEP_CAP = 256; // max steps/frame at high speed (avoids spiral-of-death)

function snapshotPrev(): void {
  const s = world.store;
  const { liveIndices, liveCount, x, y, genId } = s;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    prevX[i] = x[i]!;
    prevY[i] = y[i]!;
    prevGen[i] = genId[i]!;
  }
}

function frame(): void {
  let interp: {
    prevX: Float64Array;
    prevY: Float64Array;
    prevGen: Uint32Array;
    alpha: number;
  } | null = null;
  if (running) {
    if (speed < 1) {
      // Slow-mo: advance a fraction of a tick per frame; interpolate between ticks for fluid motion.
      acc += speed;
      if (acc >= 1) {
        snapshotPrev();
        world.step();
        acc -= 1;
      }
      interp = { prevX, prevY, prevGen, alpha: acc };
    } else {
      const steps = Math.min(STEP_CAP, Math.round(speed));
      for (let i = 0; i < steps; i++) world.step();
      acc = 0;
    }
  }
  renderer.setCamera(camX, camY, zoom);
  renderer.draw(world.store, world.food, showFood, interp);
  inspector.render(world.store, config);

  const now = performance.now();
  if (now - lastT >= 500) {
    tps = ((world.tick - lastTick) * 1000) / (now - lastT);
    lastT = now;
    lastTick = world.tick;
  }
  const dB = world.totalBirths - prevBirths;
  const dD = world.totalDeaths - prevDeaths;
  prevBirths = world.totalBirths;
  prevDeaths = world.totalDeaths;
  graph.push(world.tick, [world.population, world.food.total(), dB, dD]);
  graph.render();
  controls.setStatus(world.tick, tps, world.population, world.stateHash());
  // keep the selection panel honest if the dot was recycled
  if (selected && !world.store.isAlive(selected.slot, selected.gen)) inspector.clear();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Console handle for poking the sim (matches the old engine's affordance).
(globalThis as unknown as { sim: unknown }).sim = {
  get world() {
    return world;
  },
  get config() {
    return config;
  },
};
