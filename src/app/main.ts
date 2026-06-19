import { World } from '../core/sim/world';
import { defaultConfig } from '../core/sim/config';
import { wrapDelta } from '../core/math/vec2';
import { Renderer, type Camera } from '../render/webgl-renderer';
import { LightOverlay } from '../render/light-overlay';
import { FoodOverlay } from '../render/food-overlay';
import { BondOverlay } from '../render/bond-overlay';
import { RockOverlay } from '../render/rock-overlay';
import { TempOverlay } from '../render/temp-overlay';
import { GlowOverlay } from '../render/glow-overlay';
import { ToxinOverlay } from '../render/toxin-overlay';
import { CurrentOverlay } from '../render/current-overlay';
import { lightMultiplier } from '../core/environment/cycle';
import { TelemetryDashboard } from './telemetry';
import { inspectAt } from './inspect';
import { mountControls } from './controls';
import { BrainInspector } from './brain-inspector';
import { renderGenomeInspector } from './genome-inspector';
import { renderHallOfFame } from './hall-of-fame';
import { renderPhylogeny } from './phylogeny-panel';
import { renderMenagerie } from './menagerie-panel';
import {
  buildCritterGenome,
  buildAutotrophGenome,
  buildForagerGenome,
  buildNightForagerGenome,
  buildToxinAvoiderGenome,
  buildPredatorGenome,
} from '../core/genome/critter-genome';
import { CellType } from '../core/cells/types';
import { cloneGenome, type Genome } from '../core/genome/genome';
import type { LineageSummary } from '../core/sim/lineage-board';
import type { SpeciesSummary } from '../core/sim/species-board';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const hud = document.getElementById('hud');

// ARCHIPELAGO ECOLOGY (grander scale): an 8192² ocean dotted with ~20 isolated COMMUNITIES, one per
// bright light pocket, each its own little ecosystem — a tough anchored PHOTO plant base that grows a
// bonded chain to maturity then emits drifting spores, plus a couple of brain-driven FORAGERS that
// GRAZE-LATCH the chain (drain a cell gradually; draining it empty SEVERS it → cut-off cells fall to
// MEAT) and one ambush PREDATOR (red) that latches + drains foragers (foragers FLEE the predator-scent).
// Light is sharp pockets with vast dark gaps between, so plants survive only on their island and spores
// drifting into the void starve. Free-clone PHOTO division is OFF (sessilePlants) → the only free PHOTO
// is a spore. THE VISION: communities form, and over time slowburn-extended creatures cross the empty
// gaps to colonise neighbours. THRIVE STATUS (honest, co-owned tuning): plants thrive per island and
// creatures persist much longer under SLOWBURN (basalCost/moveCost down — the headless sweep's clear
// winner; piling on food made it worse), but foragers do NOT yet reproduce enough to overflow + cross
// gaps — that reproduction balance is the next tuning pass (beads life-sim-61v).
// NOTE on MASS (an earlier open question): lowering genome mass DOES raise terminal speed (mass 2→1
// gave 0.37→0.88 u/tick) but FRAGMENTS the body at the live thrust (11→5 bonds at mass 1, 0 at 0.5),
// breaking cohesion — so the prior "no usable speed gain" finding stands; mass stays 2, survival leans
// on basal/move (slowburn), exactly as directed.
const FORAGER_INIT_E = 40; // CHEAP OFFSPRING (was 70): the real breeding bar is offspringCost(6·FE)+parentFloor, NOT reproThreshold. At 40 a forager breeds after banking ~255 (vs 480 at 70) — r-selected prey that actually multiplies. (headless: foragers go from never-breeding to a stable 66/archipelago)
const PRED_INIT_E = 560; // predator reserve, decoupled from FORAGER_INIT_E so cheap forager offspring doesn't starve the predators' own provisioning
const config = defaultConfig({
  seed: 3,
  maxCells: 400_000,
  maxBonds: 262_144,
  maxOrganisms: 131_072,
  // GRANDER SCALE — an 8192² archipelago. Isolated little communities (one per light pocket) sit far
  // apart in vast empty water; the hope is that over time creatures cross the gaps to colonise new
  // islands. Performance holds (validated headless ~3ms/tick) because the per-tick work is O(live),
  // not O(area), so the mostly-empty ocean is nearly free. Cells stay r4 so individuals are legible.
  cellRadius: 4,
  worldWidth: 8192,
  worldHeight: 8192,
  initialPhotoFraction: 1, // all-plant seed: pure food, no competing single-cell eaters
  initialMotileFraction: 0,
  // De-jam the plant field: a PHOTO cell whose 32-unit density bucket is over the cap skips division
  // → a logistic carrying capacity that pins density (not regrowth), so the food web breathes.
  crowdDivideCap: 4,
  crowdGridSize: 32,
  // Economy: the 3-trophic ECOLOGY-validated base (feel-probe.ts LOCKED) — cheaper upkeep + lower
  // repro give foragers the slack to withstand predation AND the sparse-2048² distance between meals.
  // NOTE (M7.5 merge): now also carries the env load below (temp penalty, night dimming, toxin). The
  // combined economy is RE-VALIDATED headlessly before merge; retune basal/repro here if a level dies.
  divideThreshold: 70, // plant division threshold (rescaled from 150 @ r6 by area ratio)
  reproThreshold: 150, // eligibility floor; the BINDING breeding gate is offspringCost(6·FE=240)+reproParentFloor below
  reproParentFloor: 15, // energy the parent keeps after provisioning — low so a fed forager can afford to split
  organismDeathFloor: 0, // an unfed creature starves to MEAT, feeding the next trophic level
  basalCost: 0.0008, // SLOWBURN (headless sweep winner — the dominant thrive lever): basal is ~90% of creature bleed, so slowing it is what lets foragers live long enough to breed AND survive a swim across the empty gaps between communities. NOT a food lever. (was 0.0015)
  cruiseThrust: 1, // friskier roam so a searching forager visibly explores the open water
  // ~2× faster swim (live-feel layer). Terminal speed ≈ thrust/mass, so we lift the neural thrust
  // output + cap and quicken turning. moveCost (energy = moveCost·thrust²) is HALVED so the ~2×
  // thrust doesn't ~4× the energy burn — keeps foragers fed and the 3-trophic ecology alive.
  // carnivoreThrustMult is a multiplier, so predators stay 2× forager speed automatically.
  maxThrust: 14,
  thrustScale: 5, // neural thrust per motor activation (probe default 3)
  thrustBias: 3, // baseline cruise term (probe default 2)
  turnScale: 0.45, // faster steering so they don't overshoot at the higher speed (default 0.3)
  moveCost: 0.0015, // SLOWBURN: cheaper to search the larger ocean — covers more water per joule between meals/communities (was 0.003)
  // PREDATION + FLEEING (the validated 3-trophic balance — feel-probe.ts LOCKED):
  preyDeposit: 5, // forager flesh emits the prey-scent gradient predators hunt
  predDigestRate: 40, // energy a PREDATOR cell drains from held prey per tick (richer kills)
  predDigestEfficiency: 0.9,
  predReach: 1.5, // strike from just beyond contact (a gradient-follower lags equal-speed prey)
  predLatchRange: 2.5, // LATCH hold range — keep draining the struck organism each tick
  predLatchStiffness: 1.0, // rest-length tether drags the predator along so prey can't outswim the drain
  carnivoreThrustMult: 2.0, // carnivore speed edge — reposition/close faster than equal-speed prey
  predScentDeposit: 5, // P4: carnivore flesh emits the flee-scent gradient (mirror of preyDeposit)
  predFleeWeight: 1.0, // P4: foragers steer down the predScent gradient (the two-way arms race)
  // HERBIVORE GRAZE-LATCH: a forager mouth latches onto a PHOTO chain cell and grazes it gradually
  // (grazeRate/tick) instead of the instant-kill bite — a brief brush no longer severs the cell and
  // feeding is sustained. NOTE (open tuning, co-owned): gradual grazing alone does NOT yet make
  // foragers THRIVE in this sparse 10-pocket world — headless sweep shows foragers peak ~4-9 then
  // decline at every grazeRate (low rate starves them, high rate is instant-kill again). The real
  // lever is the food ECONOMY (pocket density/count, repro cost, harvestable plant energy), tuned
  // next. grazeRate 4 = a visibly GRADUAL graze (a ~15-energy cell takes ~5 ticks) for the feel.
  herbivoreLatch: true,
  grazeRate: 4, // gradual drain (was 1.0 = too slow, starved foragers); pending economy co-tuning
  grazeLatchRange: 2.5, // acquire+hold radius ×(ri+rj)
  grazeLatchStiffness: 20, // STRONG hold — the breakthrough: at 1.0 a forager's cruise thrust towed it off food after one nibble (graze→swim into void→starve, the boom-bust crash). A firm tether makes it STAY and feed until banked, which is what lets the population sustain instead of crash. Latch still releases when the cell is eaten/gone.
  // M7: mutation ON so both heterotrophs ADAPT and DIVERSIFY live (library defaults stay 0).
  mutationWeightRate: 0.25,
  mutationWeightSigma: 0.1,
  mutationParamRate: 0.1,
  mutationParamSigma: 0.1,
  // One structural operator, ON small, gives OPEN-ENDED emergence: weight/param mutation only
  // tunes a FIXED body plan (genotypic diversity stays 0), so changeType lets body plans actually
  // diverge → the `geno-div` HUD readout climbs and holds. Tuned at 0.015 via headless sweep.
  mutationChangeTypeRate: 0.015,
  // Sensor-channel mutation: lets evolution DISCOVER the new env sensors (AMBIENT_LIGHT/TEMP/TOXIN/
  // GLOW). Small rate so the seeded variants (below) don't instantly lose their channels but new
  // lineages can acquire them. paramRate also nudges gene.glowGain so NEURONs can discover glow.
  mutationSensorChannelRate: 0.01,
  // ── Environmental features (10) ──
  // Gentler day/night: night dims to ~0.5 so plants keep trickle-producing.
  dayNightDepth: 0.5,
  dayLength: 800,
  seasonLength: 10000,
  seasonDepth: 0.2,
  // Rocks: static obstacles for shelter / chokepoints.
  rockCount: 80, // more obstacles for the larger ocean
  rockRadiusMin: 8,
  rockRadiusMax: 20,
  rockRepulsion: 4,
  rockGridSize: 64,
  // Temperature: patchy heatmap. Penalty GENTLED to 0.25 (probe showed 0.5 was the dominant
  // forager stressor — crashed the boom; 0.25 keeps it a selection pressure without starving).
  tempPatchCount: 24, // scale patch count with the 16× larger world
  tempMin: 0,
  tempMax: 1,
  tempComfortLow: 0.3,
  tempComfortHigh: 0.7,
  tempColdPenalty: 0.25,
  tempHeatPenalty: 0.25,
  // Bioluminescence ON: NEURON glow effectors emit into the GlowField (warm additive overlay at
  // night). glowCost is small so glowing is affordable; the seeded glow-foragers pay it actively.
  glowGridCols: 64, // scale field grids with the 8192² world to keep patch resolution
  glowGridRows: 64,
  glowDiffuse: 0.2,
  glowDecay: 0.05,
  glowGain: 1,
  glowCost: 0.02,
  // Toxin ON, GENTLE: accumulates around decaying MEAT (corpse fields) and lightly damages cells.
  // At toxinDamage 0.5 the probe EXTINCTS foragers by tick 679; 0.04 is a mild pressure that the
  // toxin-avoider variant can exploit without collapsing the ecosystem.
  toxinGridCols: 128,
  toxinGridRows: 128,
  toxinDiffuse: 0.2,
  toxinDecay: 0.03,
  toxinDamage: 0.04,
  toxinDepositOnMeatDecay: 0.1,
  // Current OFF: spore dispersal IS the plant drift, so the spec keeps the vector drift dormant
  // (currentStrength 0 → applyCurrent + current.step both skipped). Shift+U can still toggle it on.
  currentGridCols: 64,
  currentGridRows: 64,
  currentPatchCount: 16,
  currentPatchRadius: 6,
  currentStrength: 0,
  currentEvolveRate: 0.05,
  // ── SESSILE CHAIN PLANTS (the demo's food base) ──
  // A plant is an ORGANISM of PHOTO cells: an anchored tough base + a bonded chain that grows one
  // tip cell at a time to maturity, then emits drifting spores that re-root into new pockets.
  // Grazing a chain cell to empty severs it; cut-off cells fall to MEAT. Free-clone PHOTO division
  // is gated OFF (sessilePlants) so the ONLY free PHOTO is a spore.
  sessilePlants: true,
  // r4 economy (area=16): thresholds > costs so a grow/spore never starves the base, and a
  // marginal-light plant stalls instead of limping to maturity (the spatial light filter).
  plantGrowthThreshold: 12,
  plantGrowthCost: 8,
  plantBondLen: 10, // 2.5·cellRadius at r4
  // SPORE CONTAINMENT (GOAL A): pockets now sit ~500–680 units apart (jittered macro-grid below), so
  // spores are reined to stay INSIDE the parent pocket — they fill it but don't bridge to a neighbour.
  // A spore that drifts into the dark gap settles in darkness and starves (pockets self-select).
  // Fewer, costlier, shorter-drift, sooner-settling spores → densify, not spread. Cost < threshold so
  // emitting a spore never starves the base below maturity.
  plantSporeThreshold: 90,
  plantSporeCost: 55,
  plantSporeImpulse: 8, // halved drift (was 16) — keeps offspring within the parent pocket's lit zone
  plantSettleSpeed: 1.0, // anchor sooner (was 0.5) so a spore re-roots near the parent, not mid-gap
  // ── LIGHT POCKETS: ~10 small sharp patches with dark gaps so spores in the dark starve ──
  // Background between pockets must stay below the basal/photoGain ≈ 0.08 break-even, so diffuse is
  // tiny; regen stays high so each pocket holds near full light. Pockets select plants spatially.
  lightGridCols: 64, // scale the light grid with the 8192² world → ~128-unit cells keep pockets sharp
  lightGridRows: 64,
  lightPatchCount: 20, // ~20 communities scattered across the archipelago
  lightPatchRadius: 2, // grid cells (~256-unit sharp pockets over the 128-unit grid)
  lightDiffuse: 0.02,
});
const world = new World(config);

// M6 demo: organisms DEVELOPED from a genome (proves the encoding drives the live demo).
function developInto(genome: Genome, x: number, y: number, heading: number): number {
  return world.spawnOrganism(genome, x, y, heading);
}

// ── ARCHIPELAGO FOUNDER SCENE ──
// ~20 isolated COMMUNITIES, one per bright light pocket, scattered across the 8192² ocean. The light
// patches are SPREAD on a jittered macro-grid (World.initSpread), so we READ BACK the seeded field to
// find the pocket centres (brightest grid cells, kept ≥2 grid cells apart so communities are distinct).
// Each community is a SELF-SUFFICIENT little ecosystem (headless-validated stable to 4000+ ticks): a
// THICKET of 3 tough anchored plant bases (they grow chains + spore → dense local food), ~5 brain-driven
// foragers that GRAZE-LATCH and BREED on the island, and one ambush predator — all three trophic levels
// sustain locally (≈66 foragers / 20 predators archipelago-wide, dead stable). Dense local food + enough
// founders are what make an island survive in isolation at this grand scale. The empty water between
// islands is the frontier slowburn-extended foragers may, in time, cross to colonise an empty pocket.
const COMMUNITY_COUNT = 20;
const PLANT_BASES_PER_ISLAND = 3; // a thicket of dense local food — the key to island self-sufficiency
const FORAGERS_PER_ISLAND = 5; // a viable founding group that breeds and sustains
const lf = world.light;
const patchW = config.worldWidth / lf.cols;
const patchH = config.worldHeight / lf.rows;
const ranked = Array.from(lf.field, (v, i) => ({
  v,
  col: i % lf.cols,
  row: (i / lf.cols) | 0,
})).sort((a, b) => b.v - a.v);
const pockets: { x: number; y: number }[] = [];
for (const cell of ranked) {
  if (pockets.length >= COMMUNITY_COUNT) break;
  const x = cell.col * patchW + patchW / 2;
  const y = cell.row * patchH + patchH / 2;
  // ≥2 grid cells apart → genuinely separate islands with empty gaps between.
  const far = pockets.every(
    (p) => Math.abs(p.x - x) > 2 * patchW || Math.abs(p.y - y) > 2 * patchH,
  );
  if (far) pockets.push({ x, y });
}

// Per-island seeding: a 3-base plant thicket + 5 foragers + 1 predator. Genome builders unchanged;
// rotate the forager variants so the env-sensor channels stay ecologically live across the archipelago.
let firstForagerOrg = -1;
const CREATURE_OFFSET = 90;
const foragerVariants = [buildForagerGenome, buildNightForagerGenome, buildToxinAvoiderGenome];
let fIdx = 0;
for (let c = 0; c < pockets.length; c++) {
  const p = pockets[c]!;
  // a thicket of anchored plant bases — dense local food that grows chains + spores to fill the pocket.
  for (let b = 0; b < PLANT_BASES_PER_ISLAND; b++) {
    const a = (b / PLANT_BASES_PER_ISLAND) * Math.PI * 2;
    world.seedPlantBase(p.x + Math.cos(a) * 50 * b, p.y + Math.sin(a) * 50 * b);
  }
  for (let k = 0; k < FORAGERS_PER_ISLAND; k++) {
    const a = (fIdx * 2.39996) % (Math.PI * 2);
    const org = developInto(
      foragerVariants[fIdx % foragerVariants.length]!(world.config.cellRadius, FORAGER_INIT_E),
      p.x + Math.cos(a) * CREATURE_OFFSET,
      p.y + Math.sin(a) * CREATURE_OFFSET,
      a,
    );
    if (firstForagerOrg < 0) firstForagerOrg = org;
    fIdx++;
  }
  // one ambush predator per island (red) — latches onto a forager and drains it.
  developInto(
    buildPredatorGenome(world.config.cellRadius, PRED_INIT_E, -1.5),
    p.x + CREATURE_OFFSET,
    p.y + CREATURE_OFFSET,
    1.0,
  );
}

const f = world.cells.fields;

function createRenderer(): Renderer {
  try {
    // Draw cells smaller than their physics radius (×1.3, not ×2) — purely visual: shrinks the
    // on-screen dot without touching the radius²-based economy or collision geometry.
    return new Renderer(canvas, config.maxCells, config.cellRadius * 1.3);
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

// Rock overlay (toggled with `R`): canvas-2D discs with outlines.
const rocksCanvas = document.getElementById('rocks') as HTMLCanvasElement;
const rockOverlay = new RockOverlay(rocksCanvas);
let showRocks = true;

// Temperature heatmap overlay (toggled with `T`): WebGL quad, shares GL context.
const tempOverlay = new TempOverlay(renderer.gl, world.temperature);
let showTemp = false;

// Bioluminescence heatmap (toggled with `N`): WebGL ADDITIVE quad — warm glow over the scene,
// most legible at night. Drawn AFTER the points so it sits on top of cells.
const glowOverlay = new GlowOverlay(renderer.gl, world.glow);
let showGlow = true;
const GLOW_DISPLAY_MAX = 4; // smell scale for the heatmap; tune to taste

// Toxin heatmap (toggled with `X`): WebGL alpha-scaled quad — highlights corpse-field toxin.
const toxinOverlay = new ToxinOverlay(renderer.gl, world.toxin);
let showToxin = false;
const TOXIN_DISPLAY_MAX = 2;

// Current arrows overlay (toggled with `U`): canvas-2D vector arrows.
// Current arrows overlay (toggled with `U`): canvas-2D vector arrows. OFF by default.
// The drift FORCE itself is a separate live toggle (Shift+U) — toggling it off sets
// config.currentStrength to 0, so applyCurrent + current.step are both skipped next tick
// (fully dormant, no rebuild). The field keeps its last state; re-enabling resumes.
const CURRENT_STRENGTH = config.currentStrength; // remember the configured value for re-enable
let currentForceOn = config.currentStrength > 0;
const currentCanvas = document.getElementById('current') as HTMLCanvasElement;
const currentOverlay = new CurrentOverlay(currentCanvas);
let showCurrent = false;

// Night dimming overlay div.
const nightDiv = document.getElementById('night') as HTMLElement;

// Brain inspector overlay (toggled with `B`): live neuron-cell network of a critter.
const brainCanvas = document.getElementById('brain') as HTMLCanvasElement;
const brain = new BrainInspector(brainCanvas);
let showBrain = false;

// Genome inspector overlay (toggled with `G`): the followed organism's genome + lineage.
const genomePanel = document.getElementById('genome') as HTMLElement;
let showGenome = false;

// Hall-of-fame overlay (toggled with `J`): ranked board of the largest live lineages.
const hallPanel = document.getElementById('hall-of-fame') as HTMLElement;
let showHall = false;

// Phylogeny overlay (toggled with `Y`): indented text tree of the live lineage.
const phyloPanel = document.getElementById('phylogeny') as HTMLElement;
let showPhylo = false;

// Menagerie overlay (toggled with `K`): text board of the live species.
const menagPanel = document.getElementById('menagerie') as HTMLElement;
let showMenag = false;

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
// Start locked onto a forager so the first thing you see is a creature swimming/eating, not a
// distant field. The follow auto-releases when it dies (generation check below); press C/Escape to
// release, or click any cell to follow it. Centering on the organism uses its centroid (updateFollow).
{
  const mover = firstForagerOrg >= 0 ? world.organisms.mover[firstForagerOrg]! : -1;
  if (mover >= 0 && world.cells.isAlive(mover)) {
    followId = mover;
    followGen = f.generation[mover]!;
    camera.x = f.posX[mover]!;
    camera.y = f.posY[mover]!;
  }
}

// The brain inspector's default subject when you aren't following anyone: the first live
// organism that owns a NEURON cell (a forager). Returns 0 (nothing to draw) if none are alive.
function firstNeuralOrg(): number {
  const live = world.liveIndices;
  for (let k = 0; k < world.liveCount; k++) {
    const i = live[k]!;
    if (f.cellType[i] === CellType.NEURON && f.organismId[i]! > 0) return f.organismId[i]!;
  }
  return 0;
}

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
  if (showTemp) {
    tempOverlay.render(
      camera,
      world.temperature,
      config.tempMin,
      config.tempMax,
      canvas.width,
      canvas.height,
    );
  }
  if (showToxin) {
    toxinOverlay.render(camera, world.toxin, TOXIN_DISPLAY_MAX, canvas.width, canvas.height);
  }
  renderer.render(world, camera, prevX, prevY, prevGen, alpha);
  if (showRocks) {
    rockOverlay.render(world, camera);
  }
  if (showCurrent) {
    currentOverlay.render(world, camera);
  }
  if (showBonds) {
    bondOverlay.render(world, camera);
  }
  if (showGlow) {
    glowOverlay.render(camera, world.glow, GLOW_DISPLAY_MAX, canvas.width, canvas.height);
  }
  if (showBrain) {
    // Scope to the followed cell's organism if it's neural, else the first live forager brain.
    const followOrg =
      followId >= 0 && world.cells.isAlive(followId) && f.organismId[followId]! > 0
        ? f.organismId[followId]!
        : firstNeuralOrg();
    brain.render(world, followOrg);
  }
  if (showGenome) {
    const org = followId >= 0 && world.cells.isAlive(followId) ? f.organismId[followId]! : 0;
    renderGenomeInspector(world, org, genomePanel);
  }
  if (showHall) renderHallOfFame(world, hallPanel);
  if (showPhylo) renderPhylogeny(world, phyloPanel);
  if (showMenag) renderMenagerie(world, menagPanel);
}

// Default view spans ~520 world units across the smaller screen axis (~6 cell-diameters of detail),
// so individual foragers are legible from the start instead of specks in a whole-world fit. The
// wheel zooms out to the full ecosystem; resize preserves the user's current zoom.
const DEFAULT_VIEW_SPAN = 520;
function fit(initial: boolean): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  renderer.resize(canvas.width, canvas.height);
  bondOverlay.resize(canvas.width, canvas.height);
  rockOverlay.resize(canvas.width, canvas.height);
  currentOverlay.resize(canvas.width, canvas.height);
  if (initial) camera.scale = Math.min(canvas.width, canvas.height) / DEFAULT_VIEW_SPAN;
}
window.addEventListener('resize', () => fit(false));
fit(true);

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
      // shift+click = drop a forager at the cursor (hand-of-god, §11); alt+click = autotroph.
      if (e.shiftKey || e.altKey) {
        const wx = camera.x + (e.clientX - canvas.width / 2) / camera.scale;
        const wy = camera.y + (e.clientY - canvas.height / 2) / camera.scale;
        if (e.altKey) developInto(buildAutotrophGenome(world.config.cellRadius), wx, wy, 0);
        else developInto(buildForagerGenome(world.config.cellRadius), wx, wy, Math.random() * 6.28);
      } else {
        inspectAt(world, camera, e.clientX, e.clientY, canvas.width, canvas.height, inspectPanel);
        const id = pickNearest(e.clientX, e.clientY);
        if (id >= 0) {
          followId = id;
          followGen = f.generation[id]!;
        }
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
// Jump the follow-cam to the live carnivore nearest the current camera centre (key X). Predators are
// few and fast, so hunting for one by eye is hard — this snaps you onto the hunt. Scans organisms by
// the structural carnivore flag (never lineage); picks the nearest live MOVER, toroidal distance.
function followNearestCarnivore(): void {
  const cc = world.organisms.cellCount;
  const carn = world.organisms.carnivore;
  const mover = world.organisms.mover;
  let best = -1;
  let bestD = Infinity;
  for (let org = 1; org < cc.length; org++) {
    if (cc[org]! === 0 || carn[org] !== 1) continue;
    const mv = mover[org]!;
    if (mv < 0 || !world.cells.isAlive(mv)) continue;
    const dx = wrapDelta(f.posX[mv]! - camera.x, world.config.worldWidth);
    const dy = wrapDelta(f.posY[mv]! - camera.y, world.config.worldHeight);
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = mv;
    }
  }
  if (best >= 0) {
    followId = best;
    followGen = f.generation[best]!;
    camera.x = f.posX[best]!;
    camera.y = f.posY[best]!;
  }
}

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
  } else if (e.key === 'g' || e.key === 'G') {
    showGenome = !showGenome;
    genomePanel.classList.toggle('hidden', !showGenome);
  } else if (e.key === 'h' || e.key === 'H') {
    legend?.classList.toggle('hidden');
  } else if (e.key === 'j' || e.key === 'J') {
    showHall = !showHall;
    hallPanel.classList.toggle('hidden', !showHall);
  } else if (e.key === 'y' || e.key === 'Y') {
    showPhylo = !showPhylo;
    phyloPanel.classList.toggle('hidden', !showPhylo);
  } else if (e.key === 'k' || e.key === 'K') {
    showMenag = !showMenag;
    menagPanel.classList.toggle('hidden', !showMenag);
  } else if (e.key === 'r' || e.key === 'R') {
    showRocks = !showRocks;
    rocksCanvas.style.display = showRocks ? 'block' : 'none';
  } else if (e.key === 't' || e.key === 'T') {
    showTemp = !showTemp;
  } else if (e.key === 'n' || e.key === 'N') {
    showGlow = !showGlow;
  } else if (e.key === 'p' || e.key === 'P') {
    // P (poison): toxin overlay. Moved off X — X now follows the nearest predator (ecology demo).
    showToxin = !showToxin;
  } else if (e.shiftKey && (e.key === 'u' || e.key === 'U')) {
    // Shift+U: toggle the current drift FORCE (physics) on/off live, no rebuild.
    currentForceOn = !currentForceOn;
    config.currentStrength = currentForceOn ? CURRENT_STRENGTH : 0;
  } else if (e.key === 'u' || e.key === 'U') {
    showCurrent = !showCurrent;
    currentCanvas.style.display = showCurrent ? 'block' : 'none';
  } else if (e.key === 'x' || e.key === 'X') {
    followNearestCarnivore();
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
  const lm = lightMultiplier(
    world.tickCount,
    config.dayLength,
    config.dayNightDepth,
    config.seasonLength,
    config.seasonDepth,
  );
  hud.textContent =
    `cells ${world.cells.aliveCount}  ·  tick ${world.tickCount}  ·  ${fps} fps  ·  ` +
    `${speed.toFixed(2)}×${paused ? ' paused' : ''}  ·  zoom ${camera.scale.toFixed(2)}` +
    `  ·  day ${(lm * 100).toFixed(0)}%\n` +
    `photo ${m.photo}  dig ${m.digestive}  motile ${m.motile}  meat ${m.meat}` +
    `   ·   ⌀energy ${m.meanEnergy.toFixed(0)}  ·  diversity ${m.diversity.toFixed(3)}\n` +
    `evolve: geno-div ${m.genotypicDiversity.toFixed(3)}  ·  gen ${m.maxGeneration}  ·  ⌀genome ${m.meanGenomeSize.toFixed(1)} cells/org ${m.meanCellsPerOrganism.toFixed(1)}\n` +
    `brain: ${net.liveNeuronCount} neurons · ${net.liveSynapseCount} synapses` +
    `   ·   light ${showLight ? 'on' : 'off'}  smell ${showFood ? 'on' : 'off'}  bonds ${showBonds ? 'on' : 'off'}  rocks ${showRocks ? 'on' : 'off'}  temp ${showTemp ? 'on' : 'off'}  glow ${showGlow ? 'on' : 'off'}  toxin ${showToxin ? 'on' : 'off'}  curr-force ${currentForceOn ? 'on' : 'off'}${showCurrent ? '▸' : ''}` +
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

  // Night dimming: dark overlay fades with (1 - lightMultiplier).
  const night =
    1 -
    lightMultiplier(
      world.tickCount,
      config.dayLength,
      config.dayNightDepth,
      config.seasonLength,
      config.seasonDepth,
    );
  nightDiv.style.opacity = String(night * 0.55);

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

// Debug / "hand of god" handle — drive it from the browser console (§11). Coords default to the
// camera centre, so `sim.spawnForager()` drops one where you're looking. shift+click also spawns
// a forager at the cursor (see the mouseup handler).
interface SimHandle {
  world: World;
  camera: Camera;
  setSpeed: (s: number) => void;
  /** Develop+instantiate a brain-driven FORAGER (senses→swims→eats→breeds). Returns its org id. */
  spawnForager: (x?: number, y?: number, n?: number) => number;
  /** Develop+instantiate a photosynthetic AUTOTROPH organism. */
  spawnAutotroph: (x?: number, y?: number, n?: number) => number;
  /** Develop+instantiate the hand-authored CRITTER (brain, no mouth — the encoding demo). */
  spawnCritter: (x?: number, y?: number) => number;
  /** Atomic-kill the nearest genome organism to (x,y) → its cells become MEAT. */
  killNearestOrganism: (x?: number, y?: number) => number;
  /** Top every live genome organism's cells up to `e` energy (watch them all reproduce). */
  feedAll: (e?: number) => number;
  /** Print/return live genome organisms with cell-count, energy, genome ref + generation. */
  organisms: () => { org: number; cells: number; energy: number; gen: number; ref: number }[];
  /** Current champion board: top live founding lineages by member count (M7 telemetry). */
  champions: () => LineageSummary[];
  /** Current species board: live genome population greedily clustered by genomeDistance (M7
   * telemetry, ranked by liveCount desc). */
  species: () => SpeciesSummary[];
  /** Manual debug spawn of champion `k`'s representative genome (clone keeps its founderId). */
  spawnChampion: (k?: number) => number;
  /** Toggle the current drift force on/off live (no rebuild). Returns the new on-state. */
  toggleCurrent: () => boolean;
}
const cx0 = () => world.config.worldWidth * 0.5;
const cy0 = () => world.config.worldHeight * 0.5;
const fld = world.cells.fields;
const spawnMany = (
  make: (x: number, y: number) => number,
  x: number,
  y: number,
  n: number,
): number => {
  let last = -1;
  for (let i = 0; i < Math.max(1, n); i++) {
    const a = (i * 2.39996) % (Math.PI * 2);
    const rad = i === 0 ? 0 : 18 + i * 6;
    last = make(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  return last;
};
function nearestGenomeOrg(x: number, y: number): number {
  const o = world.organisms;
  let best = -1;
  let bestD = Infinity;
  for (let org = 1; org < o.cellCount.length; org++) {
    if (o.cellCount[org]! > 0 && o.genomeRef[org]! >= 0) {
      const dx = o.centroidX[org]! - x;
      const dy = o.centroidY[org]! - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = org;
      }
    }
  }
  return best;
}
(globalThis as unknown as { sim: SimHandle }).sim = {
  world,
  camera,
  setSpeed: (s) => {
    speed = s;
  },
  spawnForager: (x = cx0(), y = cy0(), n = 1) =>
    spawnMany(
      (px, py) =>
        developInto(buildForagerGenome(world.config.cellRadius), px, py, Math.random() * 6.28),
      x,
      y,
      n,
    ),
  spawnAutotroph: (x = cx0(), y = cy0(), n = 1) =>
    spawnMany(
      (px, py) => developInto(buildAutotrophGenome(world.config.cellRadius), px, py, 0),
      x,
      y,
      n,
    ),
  spawnCritter: (x = cx0(), y = cy0()) =>
    developInto(buildCritterGenome(world.config.cellRadius), x, y, 0),
  killNearestOrganism: (x = camera.x, y = camera.y) => {
    const org = nearestGenomeOrg(x, y);
    if (org >= 0) world.organisms.energy[org] = -1e9; // next tick's atomic-death scan reaps it
    return org;
  },
  feedAll: (e = 900) => {
    const o = world.organisms;
    let n = 0;
    for (let i = 0; i < world.cells.capacity; i++) {
      const org = fld.organismId[i]!;
      if (world.cells.isAlive(i) && org !== 0 && o.genomeRef[org]! >= 0) {
        fld.energy[i] = e;
        n++;
      }
    }
    return n;
  },
  organisms: () => {
    const o = world.organisms;
    const out: { org: number; cells: number; energy: number; gen: number; ref: number }[] = [];
    for (let org = 1; org < o.cellCount.length; org++) {
      if (o.cellCount[org]! > 0 && o.genomeRef[org]! >= 0) {
        const g = world.genomes.get(o.genomeRef[org]!);
        out.push({
          org,
          cells: o.cellCount[org]!,
          energy: Math.round(o.energy[org]!),
          gen: g ? g.generation : -1,
          ref: o.genomeRef[org]!,
        });
      }
    }
    return out;
  },
  champions: () => world.lineageBoard.slice(),
  species: () => world.speciesBoard.slice(),
  spawnChampion: (k = 0) => {
    const board = world.lineageBoard;
    if (k < 0 || k >= board.length) return -1;
    const g = world.genomes.get(board[k]!.representativeRef);
    if (g === undefined) return -1;
    // Clone keeps founderId → the spawned champion joins its own dynasty (a member, not a new founder).
    return developInto(cloneGenome(g), cx0(), cy0(), 0);
  },
  toggleCurrent: () => {
    currentForceOn = !currentForceOn;
    config.currentStrength = currentForceOn ? CURRENT_STRENGTH : 0;
    return currentForceOn;
  },
};
