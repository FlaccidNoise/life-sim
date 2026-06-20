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
  renderer = new Renderer(
    canvas,
    config.worldWidth,
    config.worldHeight,
    config.cellRadius,
    config.maxOrganisms,
  );
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
let ticksPerFrame = 1;
let selected: { slot: number; gen: number } | null = null;

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
    ticksPerFrame = n;
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
});

function rebuild(): void {
  world = new World(config);
  selected = null;
  inspector.clear();
  prevBirths = 0;
  prevDeaths = 0;
}

// Click to inspect: pick the nearest live organism to the click point.
canvas.addEventListener('click', (e) => {
  const p = renderer.screenToWorld(e.clientX, e.clientY);
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
});

globalThis.addEventListener('resize', () => renderer.resize());

// tps measurement (display only — never fed back into the sim).
let lastT = performance.now();
let lastTick = 0;
let tps = 0;
// vital-rate deltas for the graph (births/deaths since the last frame).
let prevBirths = 0;
let prevDeaths = 0;

function frame(): void {
  if (running) {
    for (let i = 0; i < ticksPerFrame; i++) world.step();
  }
  renderer.draw(world.store);
  inspector.render(world.store);

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
