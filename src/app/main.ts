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
import { scanHealth } from '../core/health';
import { Renderer } from '../render/renderer';
import { buildOverlaySegments } from '../render/overlay';
import { Controls } from './observability/controls';
import { Knobs } from './observability/knobs';
import { Inspector } from './observability/inspector';
import { BrainView } from './observability/brain-view';
import { RadarView } from './observability/radar-view';
import { Distributions } from './observability/distributions';
import { FollowRecorder } from './observability/follow-recorder';
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
const brainView = new BrainView(el<HTMLCanvasElement>('brain'));
const radar = new RadarView(el<HTMLCanvasElement>('radar'));
const distributions = new Distributions(el<HTMLCanvasElement>('dist'));
const recorder = new FollowRecorder();

let running = false;
let speed = 1; // sim ticks per animation frame; <1 = slow-mo (interpolated for fluid motion)
let showFood = true; // food heatmap overlay (toggle with 'f')
let showOverlay = true; // per-creature debug overlay on the selection (toggle with 'o')
let selected: { slot: number; gen: number } | null = null;
// Scratch for the selected creature's overlay line vertices ([x,y,r,g,b] per vertex; gl.LINES).
const overlayScratch = new Float32Array(2048);
// Path trail of the FOLLOWED creature: recent positions drawn as a fading polyline, so spin-in-place
// (a tight loop) reads instantly different from foraging (a directed path). Captured per tick.
const TRAIL_LEN = 400;
const trailX: number[] = [];
const trailY: number[] = [];
const trailScratch = new Float32Array(TRAIL_LEN * 2 * 5);
function pushTrail(x: number, y: number): void {
  trailX.push(x);
  trailY.push(y);
  if (trailX.length > TRAIL_LEN) {
    trailX.shift();
    trailY.shift();
  }
}
function clearTrail(): void {
  trailX.length = 0;
  trailY.length = 0;
}
// Advance the per-tick follow recording + trail together (called once per sim tick).
function followTick(): void {
  recorder.record(world.store, config, world.tick);
  if (recorder.isFollowedAlive(world.store))
    pushTrail(world.store.x[recorder.followedSlot]!, world.store.y[recorder.followedSlot]!);
}
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
    followTick();
  },
  onReset: (seed: number) => {
    config = { ...config, seed };
    rebuild();
  },
  onSpeed: (n: number) => {
    speed = n;
  },
  onDumpCsv: () => downloadFollowCsv(),
});

// Save the followed creature's per-tick recording as a CSV file (user-initiated via the ⤓ csv button).
function downloadFollowCsv(): void {
  if (recorder.count === 0) return;
  const blob = new Blob([recorder.toCsv()], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `follow-${recorder.followedSlot}-${world.tick}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

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

controls.setFollow(-1, 0, false); // show the 'l = follow' hint before the first play

function rebuild(): void {
  world = new World(config);
  selected = null;
  inspector.clear();
  brainView.clear();
  radar.clear();
  recorder.clear();
  clearTrail();
  controls.setFollow(-1, 0, false);
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
    brainView.select(best, selected.gen);
    radar.select(best, selected.gen);
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

// 'f' food heatmap · 'o' creature overlay · 'l' lock follow-cam + record the selected creature.
globalThis.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') showFood = !showFood;
  if (e.key === 'o' || e.key === 'O') showOverlay = !showOverlay;
  if (e.key === 'l' || e.key === 'L') {
    if (recorder.following) {
      recorder.clear();
      clearTrail();
      controls.setFollow(-1, 0, false);
    } else if (selected) {
      recorder.follow(selected.slot, selected.gen);
      clearTrail();
    }
  }
});

// tps measurement (display only — never fed back into the sim).
let lastT = performance.now();
let lastTick = 0;
let tps = 0;
// perf: EMA of wall-clock cost per sim tick + the steps taken last frame (display only).
let stepMsEma = 0;
let lastStepsPerFrame = 0;
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
    const t0 = performance.now();
    let stepped = 0;
    if (speed < 1) {
      // Slow-mo: advance a fraction of a tick per frame; interpolate between ticks for fluid motion.
      acc += speed;
      if (acc >= 1) {
        snapshotPrev();
        world.step();
        followTick();
        stepped = 1;
        acc -= 1;
      }
      interp = { prevX, prevY, prevGen, alpha: acc };
    } else {
      const steps = Math.min(STEP_CAP, Math.round(speed));
      for (let i = 0; i < steps; i++) {
        world.step();
        followTick(); // per-TICK dump + trail, even at high speed
      }
      stepped = steps;
      acc = 0;
    }
    if (stepped > 0) {
      const perTick = (performance.now() - t0) / stepped;
      stepMsEma = stepMsEma === 0 ? perTick : stepMsEma * 0.9 + perTick * 0.1;
      lastStepsPerFrame = stepped;
    }
  }
  // Follow-cam: while the followed INDIVIDUAL is alive, center the camera on it (genId-checked, so a
  // recycled slot doesn't hijack the camera). On its death the camera releases but the recording is
  // kept — you can still dump the dead creature's full life as CSV. Zoom is untouched (scroll still works).
  if (recorder.isFollowedAlive(world.store)) {
    camX = world.store.x[recorder.followedSlot]!;
    camY = world.store.y[recorder.followedSlot]!;
  }
  renderer.setCamera(camX, camY, zoom);
  renderer.draw(world.store, world.food, showFood, interp);
  // Path trail of the followed creature (fading old→new; seam-crossing segments skipped so toroidal
  // wraps don't streak). A tight loop = spinning in place; a directed line = foraging.
  if (showOverlay && recorder.following && trailX.length > 1) {
    const ww = config.worldWidth;
    const wh = config.worldHeight;
    let v = 0;
    for (let k = 0; k < trailX.length - 1; k++) {
      const ax = trailX[k]!;
      const ay = trailY[k]!;
      const bx = trailX[k + 1]!;
      const by = trailY[k + 1]!;
      if (Math.abs(bx - ax) > ww * 0.5 || Math.abs(by - ay) > wh * 0.5) continue; // seam crossing
      const br = 0.15 + 0.85 * (k / (trailX.length - 1)); // fade oldest→newest
      for (const [px, py] of [
        [ax, ay],
        [bx, by],
      ] as const) {
        trailScratch[v * 5] = px;
        trailScratch[v * 5 + 1] = py;
        trailScratch[v * 5 + 2] = 0.4 * br;
        trailScratch[v * 5 + 3] = 0.85 * br;
        trailScratch[v * 5 + 4] = 0.95 * br;
        v++;
      }
    }
    renderer.drawLines(trailScratch, v);
  }
  // Per-creature debug overlay on the live selection (drawn on top; reads true current state, so at
  // slow-mo it sits at the un-interpolated position — a non-issue at speed ≥ 1).
  if (showOverlay && selected && world.store.isAlive(selected.slot, selected.gen)) {
    const vc = buildOverlaySegments(world.store, selected.slot, config, overlayScratch);
    renderer.drawLines(overlayScratch, vc);
  }
  inspector.render(world.store, config);
  brainView.render(world.store, config);
  radar.render(world.store, config);

  const now = performance.now();
  if (now - lastT >= 500) {
    tps = ((world.tick - lastTick) * 1000) / (now - lastT);
    lastT = now;
    lastTick = world.tick;
    // Perf line updated on the same cadence (hash.stats() scans every bucket — too costly per frame).
    controls.setPerf(stepMsEma, lastStepsPerFrame, world.hash.stats());
    controls.setFollow(
      recorder.following ? recorder.followedSlot : -1,
      recorder.count,
      recorder.isFollowedAlive(world.store),
    );
  }
  const dB = world.totalBirths - prevBirths;
  const dD = world.totalDeaths - prevDeaths;
  prevBirths = world.totalBirths;
  prevDeaths = world.totalDeaths;
  graph.push(world.tick, [world.population, world.food.total(), dB, dD]);
  graph.render();
  distributions.render(world.store);
  controls.setStatus(world.tick, tps, world.population, world.stateHash());
  // keep the selection panel honest if the dot was recycled
  if (selected && !world.store.isAlive(selected.slot, selected.gen)) {
    inspector.clear();
    brainView.clear();
    radar.clear();
  }

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
  // Invariant scan from the console: `sim.health()` → NaN/oob/energy/gene violations + summary stats.
  health: (maxViolations?: number) => scanHealth(world, maxViolations),
  // The followed creature's recording as CSV text (for the console; the ⤓ csv button downloads it).
  followCsv: () => recorder.toCsv(),
};
