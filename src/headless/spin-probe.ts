/**
 * SPIN PROBE — measure how much of the population is "spinning in a circle" and WHY.
 *
 * A spinner = over a WINDOW-tick window, |net heading change| ≥ MIN_ROT full rotations AND net toroidal
 * displacement < MAX_DISP body lengths (body length = 2·SIZE gene). Both come free from the store: brain.ts
 * sets `heading[i] = h + turn` with NO wrap (brain.ts:330-331), so heading[t] − heading[t−1] IS this tick's
 * turn output exactly — no instrumentation of src/core needed.
 *
 * It also DECOMPOSES turnRaw. The sense arrays (senseX/sightX/wallSenseX/flowSenseX/glowSenseX/scentSenseX)
 * are filled immediately before steer() inside world.step() (world.ts:365-378) and are not touched again, so
 * after step() they still hold exactly what steer() read. Combined with heading_before = heading_after(t−1)
 * we can rebuild every term of turnRaw (brain.ts:165-262) and attribute the turn to:
 *   bias      — the constant-input TURN_BIAS synapse (brain.ts:175)
 *   hidden    — Σ_j tanh(hidden_j)·W2[j][turn]  (brain.ts:296)
 *   hiddenCst — the part of `hidden` that survives when EVERY sense input is 0 (the hidden BIAS unit,
 *               HiddenInput.BIAS = 23, brain.ts:285) — i.e. a second constant-input path into turn
 *   sense     — everything actually driven by perception
 * The residual (reconstructed turn vs observed turn) is reported as a self-check.
 *
 * Run:  npx tsx src/headless/spin-probe.ts [ticks] [seeds] [k=v ...]
 * e.g.  npx tsx src/headless/spin-probe.ts 4000 3 learningEnabled=false
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import {
  Brain,
  BRAIN_GENES,
  HIDDEN_UNITS,
  HIDDEN_INPUTS,
  HIDDEN_OUTPUTS,
  HIDDEN_W1,
  HIDDEN_W2,
  GLOW_SENSE_LAT_TURN,
  GLOW_SENSE_FWD_TURN,
  HiddenInput,
  ScalarGene,
  SCALAR_GENE_COUNT,
} from '../core/genome';
import { SCENT_CHANNELS } from '../core/scent-field';
import { satiatedBar } from '../core/economy';
import { DEMO_OVERRIDES } from './life-history';

const WINDOW = 60; // ticks per spin window
const MIN_ROT = 1.5; // ≥1.5 full rotations of NET heading change
const MAX_DISP = 1.0; // net displacement < 1 body length (2·SIZE)
const SAT_FRAC = 0.9; // |turn| ≥ 0.9·MAX_TURN counts as "saturated"

const TICKS = Number(process.argv[2] ?? 4000);
const SEEDS = Number(process.argv[3] ?? 3);
const extra: Record<string, unknown> = {};
// `pin=turnbias|hiddenbias|both` is a PROBE-SIDE intervention, not a config knob: after every step it
// forces the named constant-input weights back to 0 in brain + learnedBrain, so the next tick's steer sees
// them as 0. It breaks determinism on purpose — it is the causal test for "a constant-input synapse, not
// perception, is driving the turn". Nothing in src/core is modified.
let pin = '';
for (const a of process.argv.slice(4)) {
  const [k, v] = a.split('=');
  if (!k || v === undefined) continue;
  if (k === 'pin') {
    pin = v;
    continue;
  }
  extra[k] = v === 'true' ? true : v === 'false' ? false : isNaN(Number(v)) ? v : Number(v);
}
const pinTurnBias = pin === 'turnbias' || pin === 'both';
const pinHiddenBias = pin === 'hiddenbias' || pin === 'both';

/** Every brain weight that feeds turnRaw (brain.ts:165-176, 200, 212, 222, 235, 251-260, 296). Scaling all
 *  of them by `turnscale` is algebraically identical to widening the motor squash's gain: with motorSquash
 *  on, `maxTurn·tanh(k·raw/maxTurn)` = the squash evaluated at gain maxTurn/k. It is the probe-side test of
 *  "the turn command's dynamic range is several times the turn ceiling, so the squash runs flat". */
const TURN_WEIGHTS: number[] = [
  Brain.LAT_TURN,
  Brain.FWD_TURN,
  Brain.TURN_BIAS,
  Brain.SIGHT_LAT_TURN,
  Brain.SIGHT_FWD_TURN,
  Brain.WALL_LAT_TURN,
  Brain.WALL_FWD_TURN,
  Brain.FLOW_LAT_TURN,
  Brain.FLOW_FWD_TURN,
  Brain.HUNGER_TURN,
  Brain.AGE_TURN,
  Brain.READINESS_TURN,
  Brain.SIZE_TURN,
  Brain.DIET_TURN,
  Brain.CROWD_TURN,
  Brain.FERT_TURN,
  GLOW_SENSE_LAT_TURN,
  GLOW_SENSE_FWD_TURN,
];
for (let c = 0; c < SCENT_CHANNELS; c++) {
  TURN_WEIGHTS.push(Brain.PHERO_C0_LAT_TURN + c * 4, Brain.PHERO_C0_FWD_TURN + c * 4);
}
for (let j = 0; j < HIDDEN_UNITS; j++) TURN_WEIGHTS.push(HIDDEN_W2 + j * HIDDEN_OUTPUTS + 0);
const turnScale = Number(extra.turnscale ?? 1);
delete extra.turnscale;
if (!Number.isFinite(turnScale)) {
  console.error(
    `spin-probe: turnscale must be a finite number, got ${JSON.stringify(extra.turnscale)}. ` +
      `Pass each override as its OWN argv token (zsh does not word-split an unquoted variable), ` +
      `e.g. npx tsx src/headless/spin-probe.ts 4000 3 turnscale=0.25 photosynthStillnessK=0`,
  );
  process.exit(1);
}

function wrapDelta(d: number, size: number): number {
  const h = size * 0.5;
  if (d > h) return d - size;
  if (d < -h) return d + size;
  return d;
}

interface Track {
  gen: number; // store genId at window start (detects slot recycling)
  h0: number;
  x0: number;
  y0: number;
  satTicks: number;
  absTurn: number;
  speed: number;
  n: number;
}

interface Acc {
  n: number;
  spin: number;
  spinSpeed: number;
  nonSpinSpeed: number;
  satTickFrac: number; // mean over all windows
  spinSatTickFrac: number;
  // spinner breakdowns (counts)
  hungry: number; // hunger > 0.5
  fed: number; // hunger <= 0.2
  seeking: number;
  inPocket: number; // food biomass under body > 0.05·foodCap
  young: number; // age < 200
  // population baselines for the same predicates (so the breakdown is a RATE, not a raw count)
  popHungry: number;
  popFed: number;
  popSeeking: number;
  popInPocket: number;
  popYoung: number;
  // turnRaw decomposition, |contribution| averaged over live creatures
  dBias: number;
  dHidden: number;
  dHiddenCst: number;
  dSense: number;
  dResid: number;
  dN: number;
  // same, restricted to creatures currently inside a spin window that ended as a spinner
  sBias: number;
  sHidden: number;
  sHiddenCst: number;
  sSense: number;
  sN: number;
  // TURN_BIAS gene stats
  tbAbs: number;
  tbN: number;
  maxTurnMean: number;
  // end-of-run ecology, so a steering change that quietly kills the population cannot look like a win
  pop: number;
  predFrac: number; // fraction with DIET > 0.5
  dietSigma: number;
}

function newAcc(): Acc {
  return {
    n: 0,
    spin: 0,
    spinSpeed: 0,
    nonSpinSpeed: 0,
    satTickFrac: 0,
    spinSatTickFrac: 0,
    hungry: 0,
    fed: 0,
    seeking: 0,
    inPocket: 0,
    young: 0,
    popHungry: 0,
    popFed: 0,
    popSeeking: 0,
    popInPocket: 0,
    popYoung: 0,
    dBias: 0,
    dHidden: 0,
    dHiddenCst: 0,
    dSense: 0,
    dResid: 0,
    dN: 0,
    sBias: 0,
    sHidden: 0,
    sHiddenCst: 0,
    sSense: 0,
    sN: 0,
    tbAbs: 0,
    tbN: 0,
    maxTurnMean: 0,
    pop: 0,
    predFrac: 0,
    dietSigma: 0,
  };
}

/** Reconstruct this tick's turnRaw for creature i and split it into bias / hidden / hiddenConst / sense.
 *  `hPrev` is the heading BEFORE steer ran (= last tick's stored heading). */
function decomposeTurn(
  world: World,
  cfg: Config,
  i: number,
  hPrev: number,
): { bias: number; hidden: number; hiddenCst: number; sense: number; raw: number } {
  const s = world.store;
  const lb = s.learnedBrain;
  const b = i * BRAIN_GENES;
  const sg = i * SCALAR_GENE_COUNT;
  const dx = Math.cos(hPrev);
  const dy = Math.sin(hPrev);

  let fwd = s.senseX[i]! * dx + s.senseY[i]! * dy;
  let lat = -s.senseX[i]! * dy + s.senseY[i]! * dx;
  let hunger = 0;
  if (cfg.hungerSense || cfg.hungerGatesFood) {
    const bar = satiatedBar(s.scalarGenes, i, cfg);
    hunger = bar > 0 ? 1 - s.energy[i]! / bar : 1;
    if (hunger < 0) hunger = 0;
    else if (hunger > 1) hunger = 1;
  }
  if (cfg.hungerGatesFood) {
    const floor = Math.min(1, Math.max(0, cfg.foodDriveFloor));
    let drive = cfg.foodGateThreshold > 0 ? hunger / cfg.foodGateThreshold : hunger;
    if (drive > 1) drive = 1;
    else if (drive < floor) drive = floor;
    fwd *= drive;
    lat *= drive;
  }
  const sFwd = s.sightX[i]! * dx + s.sightY[i]! * dy;
  const sLat = -s.sightX[i]! * dy + s.sightY[i]! * dx;
  const wFwd = s.wallSenseX[i]! * dx + s.wallSenseY[i]! * dy;
  const wLat = -s.wallSenseX[i]! * dy + s.wallSenseY[i]! * dx;
  const flFwd = s.flowSenseX[i]! * dx + s.flowSenseY[i]! * dy;
  const flLat = -s.flowSenseX[i]! * dy + s.flowSenseY[i]! * dx;
  const glFwd = s.glowSenseX[i]! * dx + s.glowSenseY[i]! * dy;
  const glLat = -s.glowSenseX[i]! * dy + s.glowSenseY[i]! * dx;

  const bias = lb[b + Brain.TURN_BIAS]!;
  let sense =
    lb[b + Brain.LAT_TURN]! * lat +
    lb[b + Brain.FWD_TURN]! * fwd +
    lb[b + Brain.SIGHT_LAT_TURN]! * sLat +
    lb[b + Brain.SIGHT_FWD_TURN]! * sFwd +
    lb[b + Brain.WALL_LAT_TURN]! * wLat +
    lb[b + Brain.WALL_FWD_TURN]! * wFwd +
    lb[b + Brain.FLOW_LAT_TURN]! * flLat +
    lb[b + Brain.FLOW_FWD_TURN]! * flFwd +
    lb[b + GLOW_SENSE_LAT_TURN]! * glLat +
    lb[b + GLOW_SENSE_FWD_TURN]! * glFwd;

  const sb = i * SCENT_CHANNELS;
  const cF: number[] = [];
  const cL: number[] = [];
  for (let c = 0; c < SCENT_CHANNELS; c++) {
    const cvx = s.scentSenseX[sb + c]!;
    const cvy = s.scentSenseY[sb + c]!;
    const f = cvx * dx + cvy * dy;
    const l = -cvx * dy + cvy * dx;
    cF.push(f);
    cL.push(l);
    const pb = b + Brain.PHERO_C0_LAT_TURN + c * 4;
    sense += lb[pb]! * l + lb[pb + 1]! * f;
  }
  if (cfg.hungerSense) sense += lb[b + Brain.HUNGER_TURN]! * hunger;

  let aged = 0;
  if (cfg.ageSense) {
    aged = Math.min(s.age[i]! / cfg.ageNorm, 1);
    sense += lb[b + Brain.AGE_TURN]! * aged;
  }
  let readiness = 0;
  if (cfg.readinessSense) {
    const bar = satiatedBar(s.scalarGenes, i, cfg);
    const rt = s.scalarGenes[sg + ScalarGene.REPRO_THRESHOLD]!;
    const band = bar - rt;
    readiness = band > 0 ? (s.energy[i]! - rt) / band : 0;
    if (readiness < 0) readiness = 0;
    else if (readiness > 1) readiness = 1;
    sense += lb[b + Brain.READINESS_TURN]! * readiness;
  }
  let sizeN = 0;
  let dietN = 0;
  let crowdN = 0;
  let fertN = 0;
  if (cfg.bodySense) {
    sizeN = s.scalarGenes[sg + ScalarGene.SIZE]! / (2 * cfg.cellRadius);
    dietN = s.scalarGenes[sg + ScalarGene.DIET]!;
    crowdN = Math.min(s.crowding[i]! / cfg.crowdSenseNorm, 1);
    fertN = Math.min(s.fertHere[i]! / cfg.foodCap, 1);
    sense +=
      lb[b + Brain.SIZE_TURN]! * sizeN +
      lb[b + Brain.DIET_TURN]! * dietN +
      lb[b + Brain.CROWD_TURN]! * crowdN +
      lb[b + Brain.FERT_TURN]! * fertN;
  }

  let hidden = 0;
  let hiddenCst = 0;
  if (cfg.hiddenLayer) {
    const hin = new Float64Array(HIDDEN_INPUTS);
    hin[HiddenInput.FOOD_FWD] = fwd;
    hin[HiddenInput.FOOD_LAT] = lat;
    hin[HiddenInput.SIGHT_FWD] = sFwd;
    hin[HiddenInput.SIGHT_LAT] = sLat;
    hin[HiddenInput.WALL_FWD] = wFwd;
    hin[HiddenInput.WALL_LAT] = wLat;
    hin[HiddenInput.FLOW_FWD] = flFwd;
    hin[HiddenInput.FLOW_LAT] = flLat;
    for (let c = 0; c < SCENT_CHANNELS; c++) {
      hin[HiddenInput.SCENT_C0_FWD + c * 2] = cF[c]!;
      hin[HiddenInput.SCENT_C0_LAT + c * 2] = cL[c]!;
    }
    hin[HiddenInput.HUNGER] = hunger;
    hin[HiddenInput.AGE] = aged;
    hin[HiddenInput.READINESS] = readiness;
    hin[HiddenInput.SIZE] = sizeN;
    hin[HiddenInput.DIET] = dietN;
    hin[HiddenInput.CROWD] = crowdN;
    hin[HiddenInput.FERT] = fertN;
    hin[HiddenInput.BIAS] = 1;
    const w1 = b + HIDDEN_W1;
    const w2 = b + HIDDEN_W2;
    for (let j = 0; j < HIDDEN_UNITS; j++) {
      let acc = 0;
      for (let ii = 0; ii < HIDDEN_INPUTS; ii++) acc += hin[ii]! * lb[w1 + ii * HIDDEN_UNITS + j]!;
      const wOut = lb[w2 + j * HIDDEN_OUTPUTS + 0]!;
      hidden += Math.tanh(acc) * wOut;
      // The same unit with EVERY sense input zeroed — only HiddenInput.BIAS (=1) survives.
      hiddenCst += Math.tanh(lb[w1 + HiddenInput.BIAS * HIDDEN_UNITS + j]!) * wOut;
    }
  }
  return { bias, hidden, hiddenCst, sense, raw: bias + hidden + sense };
}

function runSeed(seed: number): Acc {
  const cfg: Config = defaultConfig({ seed, ...(DEMO_OVERRIDES as Partial<Config>), ...extra });
  const world = new World(cfg);
  const s = world.store;
  const cap = s.capacity;
  const tracks: Track[] = Array.from({ length: cap }, () => ({
    gen: -1,
    h0: 0,
    x0: 0,
    y0: 0,
    satTicks: 0,
    absTurn: 0,
    speed: 0,
    n: 0,
  }));
  const prevHeading = new Float64Array(cap);
  const lastTurn = new Float64Array(cap); // this tick's turn output, so heading_before = heading − lastTurn
  const prevGen = new Int32Array(cap).fill(-1);
  // Speed as steer() saw it, snapshotted before step() on decomposition ticks (integrate() runs after
  // steer(), so the post-step vx/vy is a tick too late for the turn-cap reconstruction).
  const preSpeed = new Float64Array(cap);
  const acc = newAcc();

  /** Force the constant-input turn synapses to 0 for every slot (see `pin` above). */
  const applyPin = (): void => {
    if (!pinTurnBias && !pinHiddenBias) return;
    for (let i = 0; i < cap; i++) {
      const b = i * BRAIN_GENES;
      if (pinTurnBias) {
        s.brain[b + Brain.TURN_BIAS] = 0;
        s.learnedBrain[b + Brain.TURN_BIAS] = 0;
      }
      if (pinHiddenBias) {
        for (let j = 0; j < HIDDEN_UNITS; j++) {
          s.brain[b + HIDDEN_W1 + HiddenInput.BIAS * HIDDEN_UNITS + j] = 0;
          s.learnedBrain[b + HIDDEN_W1 + HiddenInput.BIAS * HIDDEN_UNITS + j] = 0;
        }
      }
    }
  };
  applyPin(); // founders, before the first steer

  const WARMUP = Math.floor(TICKS * 0.25); // let the ecology settle before measuring
  for (let t = 1; t <= TICKS; t++) {
    if (t % 200 === 0) {
      for (let k = 0; k < s.liveCount; k++) {
        const i = s.liveIndices[k]!;
        preSpeed[i] = Math.hypot(s.vx[i]!, s.vy[i]!);
      }
    }
    world.step();
    applyPin(); // newborns inherit a mutated bias each birth — re-zero before the next steer
    const { liveIndices, liveCount, heading, x, y, vx, vy, scalarGenes, genId } = s;
    const measure = t > WARMUP;
    for (let k = 0; k < liveCount; k++) {
      const i = liveIndices[k]!;
      const g = genId[i]!;
      const tr = tracks[i]!;
      const fresh = prevGen[i] !== g;
      prevGen[i] = g;
      if (fresh) {
        // New occupant of this slot: no valid previous heading → start a fresh window.
        // turnscale is applied ONCE per individual (at birth) to both the genome and the runtime copy, so
        // it does not compound across ticks and learning still anchors to the scaled genome.
        if (turnScale !== 1) {
          const b = i * BRAIN_GENES;
          for (const g of TURN_WEIGHTS) {
            s.brain[b + g] = s.brain[b + g]! * turnScale;
            s.learnedBrain[b + g] = s.brain[b + g]!;
          }
        }
        prevHeading[i] = heading[i]!;
        tr.gen = g;
        tr.h0 = heading[i]!;
        tr.x0 = x[i]!;
        tr.y0 = y[i]!;
        tr.satTicks = 0;
        tr.absTurn = 0;
        tr.speed = 0;
        tr.n = 0;
        lastTurn[i] = 0;
        continue;
      }
      const turn = heading[i]! - prevHeading[i]!; // exact: brain.ts:330 heading = h + turn (no wrap)
      prevHeading[i] = heading[i]!;
      lastTurn[i] = turn;
      const maxTurn = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.MAX_TURN]!;
      if (Math.abs(turn) >= SAT_FRAC * maxTurn) tr.satTicks++;
      tr.absTurn += Math.abs(turn);
      tr.speed += Math.hypot(vx[i]!, vy[i]!);
      tr.n++;

      if (measure && tr.n >= WINDOW) {
        const netRot = Math.abs(heading[i]! - tr.h0) / (2 * Math.PI);
        const size = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SIZE]!;
        const ddx = wrapDelta(x[i]! - tr.x0, cfg.worldWidth);
        const ddy = wrapDelta(y[i]! - tr.y0, cfg.worldHeight);
        const disp = Math.hypot(ddx, ddy) / (2 * size);
        const isSpinner = netRot >= MIN_ROT && disp < MAX_DISP;
        const meanSpeed = tr.speed / tr.n;
        acc.n++;
        acc.satTickFrac += tr.satTicks / tr.n;
        if (isSpinner) {
          acc.spin++;
          acc.spinSpeed += meanSpeed;
          acc.spinSatTickFrac += tr.satTicks / tr.n;
          // breakdowns, evaluated at window end
          const bar = satiatedBar(scalarGenes, i, cfg);
          const hunger = bar > 0 ? Math.max(0, Math.min(1, 1 - s.energy[i]! / bar)) : 1;
          if (hunger > 0.5) acc.hungry++;
          if (hunger <= 0.2) acc.fed++;
          if (s.seeking[i]! === 1) acc.seeking++;
          const fh =
            world.food.sampleAt(x[i]!, y[i]!) +
            world.food.sampleAt2(x[i]!, y[i]!) +
            world.food.sampleAt3(x[i]!, y[i]!);
          if (fh > 0.05 * cfg.foodCap) acc.inPocket++;
          if (s.age[i]! < 200) acc.young++;
          const d = decomposeTurn(world, cfg, i, heading[i]! - turn);
          acc.sBias += Math.abs(d.bias);
          acc.sHidden += Math.abs(d.hidden);
          acc.sHiddenCst += Math.abs(d.hiddenCst);
          acc.sSense += Math.abs(d.sense);
          acc.sN++;
        } else {
          acc.nonSpinSpeed += meanSpeed;
        }
        // start the next window
        tr.h0 = heading[i]!;
        tr.x0 = x[i]!;
        tr.y0 = y[i]!;
        tr.satTicks = 0;
        tr.absTurn = 0;
        tr.speed = 0;
        tr.n = 0;
      }
    }

    // Population-wide predicate baselines + turnRaw decomposition, sampled every 200 ticks.
    if (measure && t % 200 === 0) {
      for (let k = 0; k < liveCount; k++) {
        const i = liveIndices[k]!;
        const bar = satiatedBar(scalarGenes, i, cfg);
        const hunger = bar > 0 ? Math.max(0, Math.min(1, 1 - s.energy[i]! / bar)) : 1;
        if (hunger > 0.5) acc.popHungry++;
        if (hunger <= 0.2) acc.popFed++;
        if (s.seeking[i]! === 1) acc.popSeeking++;
        const fh =
          world.food.sampleAt(x[i]!, y[i]!) +
          world.food.sampleAt2(x[i]!, y[i]!) +
          world.food.sampleAt3(x[i]!, y[i]!);
        if (fh > 0.05 * cfg.foodCap) acc.popInPocket++;
        if (s.age[i]! < 200) acc.popYoung++;
        acc.tbAbs += Math.abs(s.learnedBrain[i * BRAIN_GENES + Brain.TURN_BIAS]!);
        acc.maxTurnMean += scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.MAX_TURN]!;
        acc.tbN++;
        // The heading steer() read this tick = the stored heading minus the turn it just applied.
        const hPrev = heading[i]! - lastTurn[i]!;
        const d = decomposeTurn(world, cfg, i, hPrev);
        acc.dBias += Math.abs(d.bias);
        acc.dHidden += Math.abs(d.hidden);
        acc.dHiddenCst += Math.abs(d.hiddenCst);
        acc.dSense += Math.abs(d.sense);
        // Self-check: does the reconstruction reproduce the observed turn? (motorSquash tanh path)
        const mt = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.MAX_TURN]!;
        let predicted = cfg.motorSquash
          ? mt > 0
            ? mt * Math.tanh(d.raw / (mt * (cfg.turnGainRatio > 0 ? cfg.turnGainRatio : 1)))
            : 0
          : Math.max(-mt, Math.min(mt, d.raw));
        // Mirror brain.ts's minimum-turning-radius bound. steer() read the PRE-step velocity, so use the
        // snapshot taken before world.step() rather than the post-integrate vx/vy.
        if (cfg.minTurnRadius > 0) {
          const turnCap = Math.max(Math.max(0, cfg.turnFloor), preSpeed[i]! / cfg.minTurnRadius);
          predicted = Math.max(-turnCap, Math.min(turnCap, predicted));
        }
        acc.dResid += Math.abs(predicted - lastTurn[i]!);
        acc.dN++;
      }
    }
  }
  {
    const { liveIndices, liveCount, scalarGenes } = s;
    acc.pop = liveCount;
    let sum = 0;
    for (let k = 0; k < liveCount; k++) {
      const d = scalarGenes[liveIndices[k]! * SCALAR_GENE_COUNT + ScalarGene.DIET]!;
      sum += d;
      if (d > 0.5) acc.predFrac++;
    }
    const mean = liveCount > 0 ? sum / liveCount : 0;
    let v = 0;
    for (let k = 0; k < liveCount; k++) {
      const d = scalarGenes[liveIndices[k]! * SCALAR_GENE_COUNT + ScalarGene.DIET]! - mean;
      v += d * d;
    }
    acc.dietSigma = liveCount > 0 ? Math.sqrt(v / liveCount) : 0;
    acc.predFrac = liveCount > 0 ? acc.predFrac / liveCount : 0;
  }
  acc.popHungry /= Math.max(1, acc.dN);
  acc.popFed /= Math.max(1, acc.dN);
  acc.popSeeking /= Math.max(1, acc.dN);
  acc.popInPocket /= Math.max(1, acc.dN);
  acc.popYoung /= Math.max(1, acc.dN);
  return acc;
}

const pct = (a: number, b: number) => (b > 0 ? ((100 * a) / b).toFixed(1) : 'n/a');

console.log(
  `spin-probe: ticks=${TICKS} seeds=${SEEDS} window=${WINDOW} minRot=${MIN_ROT} maxDisp=${MAX_DISP} bodyLen` +
    (Object.keys(extra).length ? ` overrides=${JSON.stringify(extra)}` : '') +
    (pin ? ` PIN=${pin}` : ''),
);
let totSpin = 0;
let totN = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  const a = runSeed(seed);
  totSpin += a.spin;
  totN += a.n;
  const nonSpin = a.n - a.spin;
  console.log(
    `\nseed ${seed}: windows=${a.n}  SPINNERS=${pct(a.spin, a.n)}%  ` +
      `pop=${a.pop} pred=${(100 * a.predFrac).toFixed(1)}% σDIET=${a.dietSigma.toFixed(3)}  ` +
      `meanSpeed spinner=${(a.spinSpeed / Math.max(1, a.spin)).toFixed(3)} ` +
      `non-spinner=${(a.nonSpinSpeed / Math.max(1, nonSpin)).toFixed(3)}`,
  );
  console.log(
    `  |turn| saturation (≥${SAT_FRAC}·MAX_TURN): all=${pct(a.satTickFrac, a.n)}% of ticks · ` +
      `spinners=${pct(a.spinSatTickFrac, a.spin)}% of ticks · ` +
      `mean MAX_TURN gene=${(a.maxTurnMean / Math.max(1, a.tbN)).toFixed(3)} rad/tick`,
  );
  console.log(
    `  spinner breakdown (spinner-rate vs population-rate):` +
      ` hungry ${pct(a.hungry, a.spin)}% vs ${(100 * a.popHungry).toFixed(1)}%` +
      ` · fed ${pct(a.fed, a.spin)}% vs ${(100 * a.popFed).toFixed(1)}%` +
      ` · mate-seeking ${pct(a.seeking, a.spin)}% vs ${(100 * a.popSeeking).toFixed(1)}%` +
      ` · in-pocket ${pct(a.inPocket, a.spin)}% vs ${(100 * a.popInPocket).toFixed(1)}%` +
      ` · juvenile ${pct(a.young, a.spin)}% vs ${(100 * a.popYoung).toFixed(1)}%`,
  );
  const dn = Math.max(1, a.dN);
  console.log(
    `  turnRaw decomposition, mean |term| over population: ` +
      `TURN_BIAS=${(a.dBias / dn).toFixed(3)} · hidden=${(a.dHidden / dn).toFixed(3)} ` +
      `(of which const-input=${(a.dHiddenCst / dn).toFixed(3)}) · senses=${(a.dSense / dn).toFixed(3)} ` +
      `| mean |TURN_BIAS| gene=${(a.tbAbs / Math.max(1, a.tbN)).toFixed(3)} ` +
      `| reconstruction residual=${(a.dResid / dn).toFixed(5)} rad (should be ≈0)`,
  );
  const sn = Math.max(1, a.sN);
  console.log(
    `  turnRaw decomposition, SPINNERS only: ` +
      `TURN_BIAS=${(a.sBias / sn).toFixed(3)} · hidden=${(a.sHidden / sn).toFixed(3)} ` +
      `(of which const-input=${(a.sHiddenCst / sn).toFixed(3)}) · senses=${(a.sSense / sn).toFixed(3)}`,
  );
}
console.log(`\nOVERALL spinner fraction: ${pct(totSpin, totN)}%  (${totSpin}/${totN} windows)`);
