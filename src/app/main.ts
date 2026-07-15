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
import { scanHealth, type HealthReport } from '../core/health';
import { Renderer, ColorMode, FoodLayer } from '../render/renderer';
import { buildOverlaySegments } from '../render/overlay';
import { DetailOverlay } from '../render/detail-overlay';
import { Controls } from './observability/controls';
import { SettingsModal } from './observability/settings-modal';
import { GuideModal } from './observability/guide-modal';
import { ViewChips } from './observability/view-chips';
import { WorldStats, summarizePopulation } from './observability/world-stats';
import { dietColor, rgbCss } from '../render/palette';
import { Inspector } from './observability/inspector';
import { BrainView } from './observability/brain-view';
import { RadarView, LENSES, DEFAULT_LENS } from './observability/radar-view';
import { Distributions } from './observability/distributions';
import { Legend } from './observability/legend';
import { FollowRecorder } from './observability/follow-recorder';
import { Lineage } from './observability/lineage';
import { LineageModal } from './observability/lineage-modal';
import { TimeSeriesGraph } from './observability/graph';
import { HistoryRecorder, sampleGeneStats, type HistorySample } from './observability/history';

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
}

const canvas = el<HTMLCanvasElement>('view');
const fatal = el('fatal'); // boot-fatal banner (renderer init failure)

// Non-fatal runtime-health banner. A mid-run invariant break (NaN/oob/energy/gene) used to be
// console-only — a silent failure. `scanHealth` runs on the status cadence (below) and surfaces it here;
// the sim keeps running. `lastHealthCount` is the latest violation total, `healthAck` the count the user
// dismissed — re-show when the count changes so a NEW break isn't hidden behind an old dismiss.
const healthWarn = el('health-warn');
let lastHealthCount = 0;
let healthAck = -1;
healthWarn.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).dataset.act === 'dismiss') {
    healthAck = lastHealthCount;
    healthWarn.hidden = true;
  }
});
function showHealthWarn(r: HealthReport): void {
  const v = r.violations[0];
  const detail = v ? ` — ${v.kind} · slot ${v.slot} · ${v.field}=${v.value}` : '';
  const plural = r.violationCount === 1 ? '' : 's';
  healthWarn.innerHTML =
    `<strong>⚠ ${r.violationCount} runtime invariant violation${plural}</strong> at tick ${r.tick}${detail}.` +
    ` Sim continues — inspect with <code>sim.health()</code> in the console.` +
    ` <button data-act="dismiss" style="margin-left:8px;cursor:pointer">dismiss</button>`;
  healthWarn.hidden = false;
}

// Live demo = the FULL LIVING-WORLD PACKAGE. defaultConfig keeps every feature OFF so headless/tests stay
// byte-identical to the pre-feature engine; the demo opts in here. Every knob is live-tunable in the panel:
//   • walls + flow         — spatial structure: 5 vision-occluding/food-damming biome regions + drift current
//   • motorSquash          — legibility: graded tanh steering (kills the motor-saturation spin/vibrate)
//   • foodChannels 3 +     — multi-resource: 3 resources, each grown in its OWN pockets (round-robin), so diet
//     pocketChannelMode 1     couples to PLACE — a specialist must live in its resource's island (allopatry).
//   • pheromoneEnabled     — a 4-channel identity-bearing scent field (role + hue signature, per-tick deposit).
//   • flowPushStrength     — mixing: the current carries bodies between pockets.
//   • bioluminescence      — render glow (set below). NB the 3-channel world runs SPARSER + loses predators
//     vs ch2 (food is segregated); it stays alive on all tested seeds. Tune live across seeds to taste.
let config: Config = defaultConfig(livingWorldOverrides);
let world = new World(config);

// Lineage recorder — fed by the read-only onBirth hook (pure observation, determinism-safe). The
// hook lives on the config object the world holds; the spreads in reset/Knobs preserve the function
// reference, and economy.ts reads cfg.onBirth live, so it survives rebuild().
const lineage = new Lineage();
config.onBirth = lineage.onBirth;
lineage.reset(world.store); // snapshot the seeded population as gen-0 founders

let renderer: Renderer;
try {
  renderer = new Renderer(canvas, config.worldWidth, config.worldHeight, config.maxOrganisms);
} catch (err) {
  fatal.hidden = false;
  fatal.textContent = `Renderer init failed: ${err instanceof Error ? err.message : String(err)}`;
  throw err;
}
// F4 bioluminescence ON by default — the deep-sea aesthetic (creatures glow by activity/role). Pure render,
// zero sim impact; toggle live with 'g'.
renderer.setGlow(true, 1);

const overlay = new DetailOverlay(canvas, config.worldWidth, config.worldHeight);
// Per-creature Canvas2D sprite/detail pass (the zoomed-in detailed bodies). It's O(visible creatures)
// on the CPU and tanks the frame rate in a dense pocket at world zoom, so it's AUTO-managed: on once
// you zoom past ZOOM_DETAIL_MIN AND few enough creatures are in view to stay smooth, off otherwise —
// so "zoom in → animals, zoom out → dots" just works. 'd' takes manual control (auto off) either way.
let detailOn = false;
let detailAuto = true; // auto governs until the user presses 'd'
const ZOOM_DETAIL_MIN = 6; // world fits at zoom 1; bodies only read as animals past ~6× in
const DETAIL_MAX_VISIBLE = 1200; // perf bound: est. in-view creatures (liveCount / zoom²) below this
overlay.setEnabled(detailOn);
// Auto policy: enable detail only when zoomed in enough AND the view holds few enough creatures to stay
// smooth. The visible estimate is liveCount/zoom² (zoom 1 = whole world); high zoom shrinks the view, so
// even a dense pocket stays bounded. A no-op when the state is unchanged (setEnabled is cheap/idempotent).
function updateDetail(): void {
  if (!detailAuto) return;
  const estVisible = world.store.liveCount / (zoom * zoom);
  const want = zoom >= ZOOM_DETAIL_MIN && estVisible <= DETAIL_MAX_VISIBLE;
  if (want !== detailOn) {
    detailOn = want;
    overlay.setEnabled(detailOn);
  }
}

// Population graph: a stacked trophic band (grazer/omnivore/predator — its envelope IS the population,
// its red slice IS the predator layer crashing/recovering) under self-normalized lines for food, the
// vital rates, and diet-σ (the diversity/bimodality signal). Band colors match the diet dot ramp so the
// graph and the world read as one story. Legend renders into the sibling #graph-legend div.
const graph = new TimeSeriesGraph(
  el<HTMLCanvasElement>('graph'),
  [
    { label: 'grazers', color: rgbCss(dietColor(0)), band: true },
    { label: 'omnivores', color: rgbCss(dietColor(0.5)), band: true },
    { label: 'predators', color: rgbCss(dietColor(1)), band: true },
    { label: 'food', color: '#8ad9f2' }, // cyan
    { label: 'births/t', color: '#e8d36b' }, // yellow — 100-tick trailing rate
    { label: 'deaths/t', color: '#e0a06b' }, // orange — 100-tick trailing rate
    { label: 'diet σ', color: '#c98af2' }, // violet — trophic diversity (bimodality)
  ],
  el('graph-legend'),
);
const inspector = new Inspector(el('inspector'));
const brainView = new BrainView(el<HTMLCanvasElement>('brain'));
const radar = new RadarView(el<HTMLCanvasElement>('radar'));
// Lens selector: switches which heritable-trait axis-set the radar draws (Capability overview + the
// per-subsystem genome walk). Options come from the LENSES registry so the list lives in one place.
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
const lineageModal = new LineageModal(el('lineage-panel'), lineage, (slot, gen) =>
  selectCreature(slot, gen),
);
el<HTMLButtonElement>('lineage-open').addEventListener('click', () => lineageModal.setOpen(true));

let running = false;
let speed = 1; // sim ticks per animation frame; <1 = slow-mo (interpolated for fluid motion)
// Food-field overlay layer (cycled with 'f'): off → total → channel A/B/C → scent prey/predator/kin → off, skipping
// layers that don't exist for the current config so the user never lands on a blank.
let foodLayer: FoodLayer = FoodLayer.TOTAL;
let showWalls = true; // wall slate layer (toggle with 'w')
let showOverlay = true; // per-creature debug overlay on the selection (toggle with 'o')
let showFlow = false; // flow-field current arrows (toggle with 'v') — OFF by default; the current's effect reads in the drifting food, the arrow overlay is opt-in
let showCone = false; // vision cones on the detail overlay (toggle with 'e')
// Default = DIET so the trophic story (green grazers ↔ red predators) reads on load without touching a
// knob; LINEAGE is one 'c'-press away (cycle order: diet → lineage → energy → forage).
let colorMode: ColorMode = ColorMode.DIET;
let selected: { slot: number; gen: number } | null = null;

// ── Food-layer + color-mode HUD labels and the 'f' cycle ───────────────────────────────────────────
// Human-readable names for the HUD label (indexed by FoodLayer value).
const FOOD_LAYER_NAMES: Record<number, string> = {
  [FoodLayer.OFF]: 'off',
  [FoodLayer.TOTAL]: 'total',
  [FoodLayer.CHANNEL_A]: 'channel A',
  [FoodLayer.CHANNEL_B]: 'channel B',
  [FoodLayer.CHANNEL_C]: 'channel C',
  [FoodLayer.SCENT_PREY]: 'scent: prey',
  [FoodLayer.SCENT_PRED]: 'scent: predator',
  [FoodLayer.SCENT_KIN_COS]: 'scent: kin (cos)',
  [FoodLayer.SCENT_KIN_SIN]: 'scent: kin (sin)',
};
const COLOR_MODE_NAMES = ['lineage', 'diet', 'energy', 'forage', 'photo', 'parasite', 'scavenger'];

/** The ring of layers that actually have data for the current world, in cycle order. Off is always in
 *  the ring; channels B/C only when foodChannels covers them; the 4 scent channels only when the field exists. */
function availableFoodLayers(): FoodLayer[] {
  const ring: FoodLayer[] = [FoodLayer.OFF, FoodLayer.TOTAL, FoodLayer.CHANNEL_A];
  if (config.foodChannels >= 2) ring.push(FoodLayer.CHANNEL_B);
  if (config.foodChannels >= 3) ring.push(FoodLayer.CHANNEL_C);
  if (world.scent) {
    ring.push(
      FoodLayer.SCENT_PREY,
      FoodLayer.SCENT_PRED,
      FoodLayer.SCENT_KIN_COS,
      FoodLayer.SCENT_KIN_SIN,
    );
  }
  return ring;
}

/** Step foodLayer to the next (dir=+1) or previous (dir=−1) existing layer (skips blanks), then refresh
 *  the HUD label. 'f' steps forward, Shift+F steps backward. */
function cycleFoodLayer(dir = 1): void {
  const ring = availableFoodLayers();
  const cur = ring.indexOf(foodLayer);
  // If the current layer vanished (e.g. a reset dropped a channel), restart the ring at off.
  const next = cur < 0 ? 0 : (cur + dir + ring.length) % ring.length;
  foodLayer = ring[next]!;
}

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
  lineage.commit(world.store, world.tick); // drain this tick's births into the family-tree forest
  if (recorder.isFollowedAlive(world.store))
    pushTrail(world.store.x[recorder.followedSlot]!, world.store.y[recorder.followedSlot]!);
}

// The single sim-stepping unit shared by the visible rAF loop AND the hidden-tab pump. followTick() drains
// the lineage forest every step, so routing BOTH drivers through here makes it impossible to advance the
// world without keeping the family-tree current — the divergence that made meanGen read 0 while hidden.
function stepSim(): void {
  world.step();
  followTick();
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

const controls = new Controls(el('controls'), {
  onPlayToggle: () => setPlaying(!running),
  onStep: () => {
    world.step();
    followTick();
  },
  onSpeed: (n: number) => {
    speed = n;
  },
});

// Trigger a browser download of `csv` text as `filename` (shared by the follow-recording + run-history exports).
function saveCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Save the followed creature's per-tick recording as a CSV file (user-initiated via the ⤓ csv button).
function downloadFollowCsv(): void {
  if (recorder.count === 0) return;
  saveCsv(`follow-${recorder.followedSlot}-${world.tick}.csv`, recorder.toCsv());
}

// Persistent whole-run history (population + gene trajectory), snapshotted every ~200 ticks — the graph
// only keeps a 600-point scrolling window, so this is the log a long run can be analyzed from afterward.
const history = new HistoryRecorder();

// Save the whole-run history as CSV (console: `sim.downloadHistory()`). Analyze evolution over time.
function downloadHistoryCsv(): void {
  if (history.count === 0) return;
  saveCsv(`history-${world.tick}.csv`, history.toCsv());
}

// Between-snapshot vital-rate tracker for the history CSV (independent of the UI's 100-tick window, so the
// same builder works from the rAF frame AND the hidden-tab pump). Updated only when a snapshot is taken.
let histPrevTick = 0;
let histPrevBirths = 0;
let histPrevDeaths = 0;

// One full history snapshot from current world state — everything computed fresh (no reliance on the
// frame's cadence caches), so it's correct whether called from the visible frame or the hidden pump.
function buildHistorySample(): HistorySample {
  const summary = summarizePopulation(world.store, world.tick, config);
  const genes = sampleGeneStats(world.store);
  const dTick = Math.max(1, world.tick - histPrevTick);
  const avgBirths = (world.totalBirths - histPrevBirths) / dTick;
  const avgDeaths = (world.totalDeaths - histPrevDeaths) / dTick;
  histPrevTick = world.tick;
  histPrevBirths = world.totalBirths;
  histPrevDeaths = world.totalDeaths;
  return {
    tick: world.tick,
    pop: summary.n,
    herb: summary.herb,
    omni: summary.omni,
    pred: summary.pred,
    meanAge: summary.meanAge,
    medianAge: summary.medianAge,
    founders: summary.founders,
    satiated: summary.satiated,
    meanEnergy: summary.meanEnergy,
    births: world.totalBirths,
    deaths: world.totalDeaths,
    avgBirths,
    avgDeaths,
    food: world.food.total(),
    meanGen: lineage.liveMeanGeneration(world.store),
    health: scanHealth(world, 5).violationCount,
    geneMean: genes.mean,
    geneStd: genes.std,
  };
}

// Settings modal — the organized tuning surface (categorized knobs + seed + launch-new-world). Same
// config-mutation routing the old flat #knobs panel used, so determinism is untouched.
const settings = new SettingsModal(
  el('settings-overlay'),
  el('settings-tabs'),
  el('settings-body'),
  el<HTMLInputElement>('modal-seed'),
  el<HTMLButtonElement>('launch-world'),
  config,
  {
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
    // Launch a fresh world from the edited seed + current (tuned) config.
    onLaunch: (seed) => {
      config = { ...config, seed };
      rebuild();
    },
    getSeed: () => config.seed,
  },
);
const guide = new GuideModal(el('guide-overlay'), el('guide-body'));
const worldStats = new WorldStats(el('world-stats'));
el<HTMLButtonElement>('open-settings').addEventListener('click', () => settings.setOpen(true));
el<HTMLButtonElement>('open-guide').addEventListener('click', () => guide.setOpen(true));
el<HTMLButtonElement>('mbar-settings').addEventListener('click', () => settings.setOpen(true));

// ── Selected-creature dossier: empty/body toggle + follow/csv controls ────────────────────────────────
const creatureEmpty = el('creature-empty');
const creatureBody = el('creature-body');
const followStatusEl = el('follow-status');
const followBtn = el<HTMLButtonElement>('follow-btn');
function setCreatureVisible(v: boolean): void {
  creatureEmpty.hidden = v;
  creatureBody.hidden = !v;
}
function syncFollowUi(): void {
  followBtn.classList.toggle('active', recorder.following);
  followBtn.textContent = recorder.following ? '🔓 unfollow' : '🔒 follow';
}
function setFollowStatus(slot: number, ticks: number, alive: boolean): void {
  followStatusEl.textContent =
    slot < 0 ? '' : alive ? `🔒 #${slot} · ${ticks}t` : `† #${slot} · ${ticks}t`;
}
// Follow + record the selection — shared by the 'l' key and the dossier button.
function toggleFollow(): void {
  if (recorder.following) {
    recorder.clear();
    clearTrail();
  } else if (selected) {
    recorder.follow(selected.slot, selected.gen);
    clearTrail();
  }
  syncFollowUi();
}
followBtn.addEventListener('click', toggleFollow);
el<HTMLButtonElement>('csv-btn').addEventListener('click', downloadFollowCsv);
syncFollowUi();

// ── View chips (bottom-centre) — clickable mirror of the keyboard view toggles ────────────────────────
function actFood(dir = 1): void {
  cycleFoodLayer(dir);
  syncView();
}
// 'c' cycle order — DIET first (default), LINEAGE next so it's one press from the default view.
const COLOR_CYCLE: ColorMode[] = [
  ColorMode.DIET,
  ColorMode.LINEAGE,
  ColorMode.ENERGY,
  ColorMode.FORAGE,
  ColorMode.PHOTOSYNTH,
  ColorMode.PARASITE,
  ColorMode.SCAVENGER,
];
function actColor(): void {
  const idx = COLOR_CYCLE.indexOf(colorMode);
  colorMode = COLOR_CYCLE[(idx + 1) % COLOR_CYCLE.length]!;
  legend.setColorMode(colorMode);
  syncView();
}
function actFlow(): void {
  showFlow = !showFlow;
  syncView();
}
function actWalls(): void {
  showWalls = !showWalls;
  syncView();
}
function actOverlay(): void {
  showOverlay = !showOverlay;
  syncView();
}
function actGlow(): void {
  renderer.setGlow(!renderer.glow.enabled, 1); // renderer.glow is {enabled,intensity} — toggle the flag
  syncView();
}
const viewChips = new ViewChips(el('view-chips'), {
  onFood: () => actFood(1),
  onColor: actColor,
  onFlow: actFlow,
  onWalls: actWalls,
  onOverlay: actOverlay,
  onGlow: actGlow,
});
// Push the current view state to the chips (called after any toggle, from chip OR keyboard).
function syncView(): void {
  viewChips.update({
    food: FOOD_LAYER_NAMES[foodLayer] ?? 'off',
    foodOn: foodLayer !== FoodLayer.OFF,
    color: COLOR_MODE_NAMES[colorMode] ?? 'lineage',
    flow: showFlow,
    walls: showWalls,
    overlay: showOverlay,
    glow: renderer.glow.enabled,
  });
}
legend.setColorMode(colorMode); // match the legend to the DIET default (its constructor assumes LINEAGE)
syncView();

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
  lineage.reset(world.store); // new world → re-snapshot founders, drop the old forest
  lineageModal.select(-1, 0); // clear the modal's target (it stays open if it was open)
  selected = null;
  inspector.clear();
  brainView.clear();
  radar.clear();
  recorder.clear();
  clearTrail();
  setCreatureVisible(false); // back to the empty state on a fresh world
  setFollowStatus(-1, 0, false);
  syncFollowUi();
  vitalSamples = [];
  // Reset the run-history log + its between-snapshot rate trackers on a fresh world. Without this the
  // recorder's cadence gate keeps the OLD world's tick high-water mark (recording stalls until the new run
  // catches back up) and avgBirths/avgDeaths subtract the old world's large cumulative totals from the new
  // world's small ones → large negative rates baked into the CSV.
  history.clear();
  histPrevTick = 0;
  histPrevBirths = 0;
  histPrevDeaths = 0;
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
  if (best >= 0) selectCreature(best, s.genId[best]!);
}

// Centralized selection: re-roots the whole inspector shell + the lineage modal onto one individual.
// Used by click-to-inspect AND by clicking a live node inside the family-tree modal.
function selectCreature(slot: number, gen: number): void {
  selected = { slot, gen };
  inspector.select(slot, gen);
  brainView.select(slot, gen);
  radar.select(slot, gen);
  lineageModal.select(slot, gen);
  setCreatureVisible(true); // reveal the dossier on first selection
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

globalThis.addEventListener('resize', () => {
  renderer.resize();
  overlay.resize();
});

// 'f' cycle food/field layer · 'w' wall layer · 'o' creature overlay · 'v' flow arrows · 'e' vision cones · 'c' cycle dot color-mode · 'l' lock follow-cam + record.
globalThis.addEventListener('keydown', (e) => {
  // Ignore shortcuts while typing in a field (the settings seed input, speed select, etc.).
  const tgt = e.target as HTMLElement | null;
  if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'SELECT' || tgt.tagName === 'TEXTAREA'))
    return;
  if (e.key === 'f' || e.key === 'F') actFood(e.shiftKey ? -1 : 1); // Shift+F steps backward
  if (e.key === 'w' || e.key === 'W') actWalls();
  if (e.key === 'o' || e.key === 'O') actOverlay();
  if (e.key === 'v' || e.key === 'V') actFlow();
  if (e.key === 'e' || e.key === 'E') {
    showCone = !showCone;
    overlay.setShowCone(showCone);
  }
  if (e.key === 'g' || e.key === 'G') actGlow(); // bioluminescence
  if (e.key === 'c' || e.key === 'C') actColor();
  if (e.key === 'l' || e.key === 'L') toggleFollow();
  if (e.key === 't' || e.key === 'T') lineageModal.toggle(); // family tree of the selection
  if (e.key === 'd' || e.key === 'D') {
    detailAuto = false; // manual takeover — 'd' owns the overlay from here (no more auto zoom-flipping)
    detailOn = !detailOn;
    overlay.setEnabled(detailOn); // toggle the zoomed-in sprite/detail rendering
  }
});

// tps measurement (display only — never fed back into the sim).
let lastT = performance.now();
let lastTick = 0;
let tps = 0;
// perf: EMA of wall-clock cost per sim tick + the steps taken last frame (display only).
let stepMsEma = 0;
let lastStepsPerFrame = 0;
// Status-line determinism digest. stateHash() is O(pop) and walks every heritable gene, so recompute it
// on the 500ms status cadence (not every frame) and reuse the cached value for the per-frame setStatus.
let lastHash = '';
// Mean lineage generation over the live set — the "generations elapsed" turnover readout. O(live) map
// lookups, so (like the hash) it's recomputed on the 500ms status cadence and reused each frame.
let meanGen = 0;
// Trailing 100-tick vital window: samples of cumulative {tick, totalBirths, totalDeaths}. The trailing
// per-tick rate = Δcumulative / Δticks against the oldest sample still spanning ≥100 ticks.
const VITAL_WINDOW_TICKS = 100;
let vitalSamples: { tick: number; b: number; d: number }[] = [];

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
        stepSim();
        stepped = 1;
        acc -= 1;
      }
      interp = { prevX, prevY, prevGen, alpha: acc };
    } else {
      const steps = Math.min(STEP_CAP, Math.round(speed));
      for (let i = 0; i < steps; i++) {
        stepSim(); // step + per-TICK dump/trail + lineage drain, even at high speed
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
    world.scent, // the renderer picks the channel from the active SCENT_* foodLayer
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
  updateDetail(); // auto-enable bodies once zoomed in (bounded by visible count for perf)
  overlay.setCamera(camX, camY, zoom);
  overlay.draw(world.store);
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
  // line pairs, each a dim-tail→bright-head comet so the current's direction reads. Opt-in (off by default).
  if (showFlow && world.flow) {
    const flow = world.flow;
    const cellW = config.worldWidth / flow.cols;
    const cellH = config.worldHeight / flow.rows;
    // Auto-scale the arrows to the field's ACTUAL peak magnitude, not the CFL ceiling: the tuned current
    // sits ~1000× below CFL-max, so a fixed scale renders every arrow sub-pixel (invisible). One cheap
    // pass over the sampled sub-grid finds the peak; the longest arrow is then drawn at ~1.6 cells so the
    // current's pattern reads at any flowStrength. Pure render — no sim/determinism impact.
    let peak = 1e-9;
    for (let r = 0; r < flow.rows; r += FLOW_STRIDE) {
      const cy = (r + 0.5) * cellH;
      for (let c = 0; c < flow.cols; c += FLOW_STRIDE) {
        const cx = (c + 0.5) * cellW;
        const m = Math.hypot(flow.sampleX(cx, cy), flow.sampleY(cx, cy));
        if (m > peak) peak = m;
      }
    }
    const scale = (1.6 * cellW) / peak;
    let v = 0;
    for (let r = 0; r < flow.rows; r += FLOW_STRIDE) {
      const cy = (r + 0.5) * cellH;
      for (let c = 0; c < flow.cols; c += FLOW_STRIDE) {
        const cx = (c + 0.5) * cellW;
        const vx = flow.sampleX(cx, cy);
        const vy = flow.sampleY(cx, cy);
        // Tail dim, head bright → a comet gradient that shows flow DIRECTION (a bare line wouldn't).
        flowScratch[v * 5] = cx;
        flowScratch[v * 5 + 1] = cy;
        flowScratch[v * 5 + 2] = 0.1;
        flowScratch[v * 5 + 3] = 0.34;
        flowScratch[v * 5 + 4] = 0.4;
        v++;
        flowScratch[v * 5] = cx + vx * scale;
        flowScratch[v * 5 + 1] = cy + vy * scale;
        flowScratch[v * 5 + 2] = 0.42;
        flowScratch[v * 5 + 3] = 0.92;
        flowScratch[v * 5 + 4] = 1.0;
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
  lineageModal.render(world.store); // family-tree modal (no-op while closed)

  const now = performance.now();
  if (now - lastT >= 500) {
    tps = ((world.tick - lastTick) * 1000) / (now - lastT);
    lastT = now;
    lastTick = world.tick;
    // Perf line + determinism digest updated on the same cadence (both are O(pop)/bucket scans — too
    // costly per frame).
    controls.setPerf(stepMsEma, lastStepsPerFrame, world.hash.stats());
    lastHash = world.stateHash();
    meanGen = lineage.liveMeanGeneration(world.store);
    // Runtime-health sweep (same O(pop) cadence as the hash): surface any invariant break, don't swallow it.
    const health = scanHealth(world, 5);
    lastHealthCount = health.violationCount;
    if (!health.ok) {
      if (health.violationCount !== healthAck) showHealthWarn(health);
    } else {
      healthWarn.hidden = true;
      healthAck = -1;
    }
    setFollowStatus(
      recorder.following ? recorder.followedSlot : -1,
      recorder.count,
      recorder.isFollowedAlive(world.store),
    );
  }
  // Trailing 100-tick rates: append this frame's cumulative sample, drop samples beyond the window
  // (keeping the one that still spans it), then average per tick over the covered span. Dedupe by
  // tick: a paused (or sub-1×) frame doesn't advance world.tick, so re-pushing would grow the buffer
  // without bound (the window-drop test never fires when every sample shares the frozen tick).
  if (vitalSamples.length === 0 || vitalSamples[vitalSamples.length - 1]!.tick !== world.tick)
    vitalSamples.push({ tick: world.tick, b: world.totalBirths, d: world.totalDeaths });
  while (vitalSamples.length > 2 && world.tick - vitalSamples[1]!.tick >= VITAL_WINDOW_TICKS) {
    vitalSamples.shift();
  }
  const head = vitalSamples[0]!;
  const span = Math.max(1, world.tick - head.tick);
  const avgB = (world.totalBirths - head.b) / span;
  const avgD = (world.totalDeaths - head.d) / span;
  const summary = summarizePopulation(world.store, world.tick, config); // one pass, shared by graph + stats
  graph.push(world.tick, [
    summary.herb,
    summary.omni,
    summary.pred,
    world.food.total(),
    avgB,
    avgD,
    summary.dietSigma,
  ]);
  graph.render();
  distributions.render(world.store, summary, config);
  worldStats.render(summary, avgB, avgD, world.tick, meanGen);
  // Append to the persistent run history (gated to every ~200 ticks; the gene pass runs only when it fires).
  // Same builder feeds the hidden-tab pump, so the log has no gap when the sim is driven off-screen.
  history.maybeRecord(world.tick, buildHistorySample);
  controls.setStatus(world.tick, tps, world.population, lastHash);
  // keep the selection panel honest if the dot was recycled
  if (selected && !world.store.isAlive(selected.slot, selected.gen)) {
    inspector.clear();
    brainView.clear();
    radar.clear();
    // Not following it (so nothing to export) → drop back to the clean "click a dot" prompt rather
    // than leaving the dossier open on placeholders. Following keeps it up so ⤓ csv stays reachable.
    if (!recorder.following) {
      selected = null;
      setCreatureVisible(false);
    }
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Hidden-tab pump: Chrome suspends requestAnimationFrame when the tab isn't visible, freezing the rAF-driven
// sim. For a long unattended run we instead advance the sim from a timer while hidden + running, recording
// history on the same 200-tick cadence (buildHistorySample) so the log has NO gap off-screen. When visible,
// rAF drives and this no-ops (no double-step). Pair with `caffeinate` — OS sleep halts timers too. Determinism
// is per-tick, so driving via timer vs rAF doesn't change the state at any given tick.
//
// Fixed, conservative batch per fire. NOT a time budget: a hidden tab coarsens performance.now()/Date.now()
// (Chrome buckets them to ~100ms–1s for anti-fingerprinting) and clamps setInterval to ~1s, so a
// `while (performance.now() < deadline)` loop can't measure its own runtime — the clock jumps in coarse steps
// and the loop overruns by orders of magnitude, pinning the main thread (the sim, repaints, and devtools all
// starve). A fixed iteration count is bounded no matter what the clock does. 400 steps is well under the
// interval even at a large population; with the hidden-tab ~1s clamp that's a few hundred ticks/sec — ample
// for an overnight run, and it leaves the thread idle time to stay responsive.
const PUMP_BATCH = 400;
setInterval(() => {
  if (!running || !document.hidden) return;
  for (let i = 0; i < PUMP_BATCH; i++) {
    stepSim(); // same per-step contract as the visible frame (incl. lineage.commit) → meanGen stays correct
    history.maybeRecord(world.tick, buildHistorySample); // O(1) no-op until the 200-tick gate fires
  }
}, 250);

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
  // Whole-run history: `sim.history()` snapshots, `sim.historyCsv()` the CSV, `sim.downloadHistory()` saves it.
  history: () => history.all(),
  historyCsv: () => history.toCsv(),
  historyCount: () => history.count,
  downloadHistory: () => downloadHistoryCsv(),
};
