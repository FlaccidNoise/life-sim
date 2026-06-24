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
import { livingWorldOverrides } from './living-world-config';
import { scanHealth } from '../core/health';
import { Renderer, ColorMode, FoodLayer } from '../render/renderer';
import { buildOverlaySegments } from '../render/overlay';
import { Controls } from './observability/controls';
import { Knobs } from './observability/knobs';
import { Inspector } from './observability/inspector';
import { BrainView } from './observability/brain-view';
import { RadarView, LENSES, DEFAULT_LENS } from './observability/radar-view';
import { Distributions } from './observability/distributions';
import { Legend } from './observability/legend';
import { FollowRecorder } from './observability/follow-recorder';
import { TimeSeriesGraph } from './observability/graph';

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
}

const canvas = el<HTMLCanvasElement>('view');
const hudBody = el('hud-body');

// Live demo = the FULL LIVING-WORLD PACKAGE. defaultConfig keeps every feature OFF so headless/tests stay
// byte-identical to the pre-feature engine; the demo opts in via livingWorldOverrides (shared with the
// headless census probe so the two can't drift). Every knob is live-tunable in the panel:
//   • walls + flow         — spatial structure: 5 vision-occluding/food-damming biome regions + drift current
//   • motorSquash          — legibility: graded tanh steering (kills the motor-saturation spin/vibrate)
//   • foodChannels +       — multi-resource: each resource grown in its OWN pockets (round-robin), so diet
//     pocketChannelMode 1     couples to PLACE — a specialist must live in its resource's island (allopatry).
//   • pheromoneEnabled     — a diffusing deposit-and-sense field (on-graze); the delayed-feedback substrate.
//   • flowPushStrength     — mixing: the current carries bodies between pockets.
//   • bioluminescence      — render glow (set below). Tune live across seeds to taste.
let config: Config = defaultConfig(livingWorldOverrides);
let world = new World(config);

let renderer: Renderer;
try {
  renderer = new Renderer(canvas, config.worldWidth, config.worldHeight, config.maxOrganisms);
} catch (err) {
  hudBody.textContent = `Renderer init failed: ${err instanceof Error ? err.message : String(err)}`;
  throw err;
}
// F4 bioluminescence ON by default — the deep-sea aesthetic (creatures glow by activity/role). Pure render,
// zero sim impact; toggle live with 'g'.
renderer.setGlow(true, 1);

const graph = new TimeSeriesGraph(el<HTMLCanvasElement>('graph'), [
  { label: 'pop', color: '#8ad9f2' }, // cyan
  { label: 'food', color: '#7fe0a0' }, // green
  { label: 'births', color: '#e8d36b' }, // yellow
  { label: 'deaths', color: '#e08a8a' }, // red
]);
const inspector = new Inspector(el('inspector'));
const brainView = new BrainView(el<HTMLCanvasElement>('brain'));
const radar = new RadarView(el<HTMLCanvasElement>('radar'));
// Lens selector: switches which heritable-trait axis-set the radar draws (Capability / Senses & Social
// / Life-history). Options come from the LENSES registry so the list lives in one place.
const lensSelect = el<HTMLSelectElement>('radar-lens');
for (const lens of LENSES) {
  const opt = document.createElement('option');
  opt.value = lens.key;
  opt.textContent = lens.name;
  lensSelect.appendChild(opt);
}
lensSelect.value = DEFAULT_LENS;
lensSelect.addEventListener('change', () => radar.setLens(lensSelect.value));
const distributions = new Distributions(el<HTMLCanvasElement>('dist'));
distributions.mountPicker(el('dist-fields'));
const legend = new Legend(el('legend-panel'), el('legend-pill'));
const recorder = new FollowRecorder();

let running = false;
let speed = 1; // sim ticks per animation frame; <1 = slow-mo (interpolated for fluid motion)
// Food-field overlay layer (cycled with 'f'): off → total → channel A/B/C → pheromone → off, skipping
// layers that don't exist for the current config so the user never lands on a blank.
let foodLayer: FoodLayer = FoodLayer.TOTAL;
let showWalls = true; // wall slate layer (toggle with 'w')
let showOverlay = true; // per-creature debug overlay on the selection (toggle with 'o')
let showFlow = false; // flow-field current arrows (toggle with 'v')
let colorMode: ColorMode = ColorMode.LINEAGE; // dot hue source (cycle with 'c'): lineage → diet → energy → forage
let selected: { slot: number; gen: number } | null = null;

// ── Food-layer + color-mode HUD labels and the 'f' cycle ───────────────────────────────────────────
// Human-readable names for the HUD label (indexed by FoodLayer value).
const FOOD_LAYER_NAMES: Record<number, string> = {
  [FoodLayer.OFF]: 'off',
  [FoodLayer.TOTAL]: 'total',
  [FoodLayer.CHANNEL_A]: 'channel A',
  [FoodLayer.CHANNEL_B]: 'channel B',
  [FoodLayer.CHANNEL_C]: 'channel C',
  [FoodLayer.PHEROMONE]: 'pheromone',
};
const COLOR_MODE_NAMES = ['lineage', 'diet', 'energy', 'forage'];
const foodLayerLabel = el('food-layer-label');
const colorModeLabel = el('color-mode-label');

/** The ring of layers that actually have data for the current world, in cycle order. Off is always in
 *  the ring; channels B/C only when foodChannels covers them; pheromone only when the field exists. */
function availableFoodLayers(): FoodLayer[] {
  const ring: FoodLayer[] = [FoodLayer.OFF, FoodLayer.TOTAL, FoodLayer.CHANNEL_A];
  if (config.foodChannels >= 2) ring.push(FoodLayer.CHANNEL_B);
  if (config.foodChannels >= 3) ring.push(FoodLayer.CHANNEL_C);
  if (world.phero) ring.push(FoodLayer.PHEROMONE);
  return ring;
}

/** Advance foodLayer to the next existing layer (skips blanks), then refresh the HUD label. */
function cycleFoodLayer(): void {
  const ring = availableFoodLayers();
  const cur = ring.indexOf(foodLayer);
  // If the current layer vanished (e.g. a reset dropped a channel), restart the ring at off.
  foodLayer = ring[(cur < 0 ? 0 : cur + 1) % ring.length]!;
  foodLayerLabel.textContent = FOOD_LAYER_NAMES[foodLayer] ?? 'off';
}
foodLayerLabel.textContent = FOOD_LAYER_NAMES[foodLayer] ?? 'off';

// Scratch for the selected creature's overlay line vertices ([x,y,r,g,b] per vertex; gl.LINES).
const overlayScratch = new Float32Array(2048);
// Sight-only food parcels drawn as small bright cyan crosses (a glowing mote) — 4 vertices (2 lines) ×
// 5 floats per parcel. Sized to the pool capacity so it never reallocates.
const parcelScratch = new Float32Array(Math.max(1, config.parcelCapacity) * 4 * 5);
const PARCEL_R = 10; // cross half-extent in world units
// Path trail of the FOLLOWED creature: recent positions drawn as a fading polyline, so spin-in-place
// (a tight loop) reads instantly different from foraging (a directed path). Captured per tick.
const TRAIL_LEN = 400;
const trailX: number[] = [];
const trailY: number[] = [];
const trailScratch = new Float32Array(TRAIL_LEN * 2 * 5);
// Flow-field current arrows ('v'): one line per sampled flow cell on a coarse sub-grid. Sized once for
// the worst case (every cell of the largest flow grid) so it never reallocates across resets.
const FLOW_STRIDE = 4; // sample every Nth flow cell → ~32×32 arrows over a 128² grid (legible, not saturated)
const flowScratch = new Float32Array(world.flow.cols * world.flow.rows * 2 * 5);
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

// Single source of truth for play state, so the desktop play button AND the mobile action-bar play
// button (wired below) stay in sync. `syncMobileBar` is defined with the mobile UI block at the bottom.
function setPlaying(v: boolean): void {
  running = v;
  controls.setRunning(running);
  syncMobileBar();
}

const controls = new Controls(el('controls'), config.seed, {
  onPlayToggle: () => setPlaying(!running),
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

// ── Manual mobile / desktop UI mode (no auto-detect) + the mobile action bar ─────────────────────────
// The user explicitly flips modes; the choice is remembered. Desktop keeps the floating side panels;
// mobile turns them into bottom sheets summoned from a fixed bar, keeping the canvas the full-screen hero.
const modeToggle = el<HTMLButtonElement>('mode-toggle');
const mbarPlay = el<HTMLButtonElement>('mbar-play');
const mbarControls = el<HTMLButtonElement>('mbar-controls');
const mbarStats = el<HTMLButtonElement>('mbar-stats');
const leftPanel = el('left');
const rightPanel = el('right');

function syncMobileBar(): void {
  mbarPlay.textContent = running ? '⏸ pause' : '▶ play';
  mbarPlay.classList.toggle('active', running);
  mbarPlay.setAttribute('aria-pressed', String(running));
}

// Open at most one sheet at a time (or none); the other closes so the canvas is never double-covered.
function openSheet(which: 'left' | 'right' | null): void {
  const lOpen = which === 'left';
  const rOpen = which === 'right';
  leftPanel.classList.toggle('sheet-open', lOpen);
  rightPanel.classList.toggle('sheet-open', rOpen);
  mbarControls.classList.toggle('active', lOpen);
  mbarControls.setAttribute('aria-pressed', String(lOpen));
  mbarStats.classList.toggle('active', rOpen);
  mbarStats.setAttribute('aria-pressed', String(rOpen));
}

function applyMode(mobile: boolean): void {
  document.body.classList.toggle('mode-mobile', mobile);
  modeToggle.textContent = mobile ? '🖥 desktop' : '📱 mobile';
  if (!mobile) openSheet(null); // leaving mobile clears any open sheet so the desktop panels show normally
  syncMobileBar();
}

let mobileMode = localStorage.getItem('ecosim-ui-mode') === 'mobile';
applyMode(mobileMode);

modeToggle.addEventListener('click', () => {
  mobileMode = !mobileMode;
  localStorage.setItem('ecosim-ui-mode', mobileMode ? 'mobile' : 'desktop');
  applyMode(mobileMode);
});
mbarPlay.addEventListener('click', () => setPlaying(!running));
mbarControls.addEventListener('click', () =>
  openSheet(leftPanel.classList.contains('sheet-open') ? null : 'left'),
);
mbarStats.addEventListener('click', () =>
  openSheet(rightPanel.classList.contains('sheet-open') ? null : 'right'),
);

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

// 'f' cycle food/field layer · 'w' wall layer · 'o' creature overlay · 'v' flow arrows · 'c' cycle dot color-mode · 'l' lock follow-cam + record.
globalThis.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') cycleFoodLayer();
  if (e.key === 'w' || e.key === 'W') showWalls = !showWalls;
  if (e.key === 'o' || e.key === 'O') showOverlay = !showOverlay;
  if (e.key === 'v' || e.key === 'V') showFlow = !showFlow;
  if (e.key === 'g' || e.key === 'G') renderer.setGlow(!renderer.glow, 1); // bioluminescence
  if (e.key === 'c' || e.key === 'C') {
    colorMode = ((colorMode + 1) % 4) as ColorMode;
    legend.setColorMode(colorMode);
    colorModeLabel.textContent = COLOR_MODE_NAMES[colorMode] ?? 'lineage';
  }
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
  renderer.draw(
    world.store,
    world.food,
    world.phero,
    world.walls,
    foodLayer,
    showWalls,
    interp,
    colorMode,
  );
  // Sight-only food parcels: bright cyan crosses that drift on the current (a creature with eyes chases
  // them; they emit no smell). Drawn as gl.LINES plus-signs so they read as glowing motes.
  if (world.parcels) {
    const p = world.parcels;
    let v = 0;
    for (let i = 0; i < p.capacity; i++) {
      if (p.alive[i] !== 1) continue;
      const px = p.x[i]!;
      const py = p.y[i]!;
      // horizontal then vertical segment (4 vertices)
      const pts = [
        [px - PARCEL_R, py],
        [px + PARCEL_R, py],
        [px, py - PARCEL_R],
        [px, py + PARCEL_R],
      ] as const;
      for (const [vx, vy] of pts) {
        parcelScratch[v * 5] = vx;
        parcelScratch[v * 5 + 1] = vy;
        parcelScratch[v * 5 + 2] = 0.6; // bright cyan-white
        parcelScratch[v * 5 + 3] = 1.0;
        parcelScratch[v * 5 + 4] = 1.0;
        v++;
      }
    }
    if (v >= 2) renderer.drawLines(parcelScratch, v);
  }
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
  // Flow-field current arrows ('v'): coarse sub-grid sample of world.flow drawn as cell-centre→centre+v·scale
  // line pairs (dim cyan). scale=8·dt maps the CFL-max velocity (0.25·cellW/dt) to a ~2-cell arrow, so the
  // arrows stay visibly sized whatever the flow strength. Pure render — no sim/determinism impact.
  if (showFlow && world.flow) {
    const flow = world.flow;
    const cellW = config.worldWidth / flow.cols;
    const cellH = config.worldHeight / flow.rows;
    const scale = 8 * config.dt;
    let v = 0;
    for (let r = 0; r < flow.rows; r += FLOW_STRIDE) {
      const cy = (r + 0.5) * cellH;
      for (let c = 0; c < flow.cols; c += FLOW_STRIDE) {
        const cx = (c + 0.5) * cellW;
        const vx = flow.sampleX(cx, cy);
        const vy = flow.sampleY(cx, cy);
        flowScratch[v * 5] = cx;
        flowScratch[v * 5 + 1] = cy;
        flowScratch[v * 5 + 2] = 0.2;
        flowScratch[v * 5 + 3] = 0.7;
        flowScratch[v * 5 + 4] = 0.8;
        v++;
        flowScratch[v * 5] = cx + vx * scale;
        flowScratch[v * 5 + 1] = cy + vy * scale;
        flowScratch[v * 5 + 2] = 0.2;
        flowScratch[v * 5 + 3] = 0.7;
        flowScratch[v * 5 + 4] = 0.8;
        v++;
      }
    }
    renderer.drawLines(flowScratch, v);
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
