/**
 * Brain view — a live node-link diagram of a selected creature's controller, so you can WATCH it think.
 * The brain is a single-layer LINEAR map (genome.ts / brain.ts): sensory inputs in the heading frame —
 * forward & lateral food gradient, forward & lateral sight, forward & lateral wall-avoidance (when walls
 * are on), forward & lateral flow (when flow is on), a constant bias, and (when the hungerSense lever is
 * on) an interoceptive hunger drive — fan out to two motor outputs (turn, thrust). This panel draws the
 * inputs (lit by their live value), the weighted edges (sign = color, |weight| = thickness, live activity
 * = brightness), and the resulting outputs, updating every frame.
 *
 * computeBrainState() recomputes the inputs/outputs with the SAME math as steer(); a test pins it to an
 * actual steer() run so the picture can never drift from what the sim really does. BrainView only draws.
 */
import { type OrganismStore } from '../../core/store';
import { type Config } from '../../core/config';
import { satiatedBar } from '../../core/economy';
import {
  Brain,
  BRAIN_GENES,
  ScalarGene,
  SCALAR_GENE_COUNT,
  HiddenInput,
  HIDDEN_UNITS,
  HIDDEN_INPUTS,
  HIDDEN_OUTPUTS,
  HIDDEN_W1,
  HIDDEN_W2,
  GLOW_BIAS,
  GLOW_HID,
} from '../../core/genome';

export interface BrainInputNode {
  label: string;
  value: number; // live sensory value (heading frame)
  turnW: number; // learned weight → turn
  thrustW: number; // learned weight → thrust
  eatW: number; // learned weight → eat-gate (0 for inputs the eat-gate doesn't read)
  hidIdx: number; // this input's row in the hidden layer's W1 block (HiddenInput index)
  turnInst: number; // genome instinct weight → turn
  thrustInst: number; // genome instinct weight → thrust
}

export interface BrainState {
  // fixed order: food fwd/lat, sight fwd/lat, wall fwd/lat (walls on), flow fwd/lat (flow on), bias,
  // (+ hunger when hungerSense)
  inputs: BrainInputNode[];
  turnRaw: number; // pre-clamp network sum → turn
  thrustRaw: number; // pre-clamp network sum → thrust
  turn: number; // applied turn (clamped to ±maxTurn gene)
  thrust: number; // applied thrust (reverse floor … maxThrust, ×metabolic efficiency, ×eat-gate penalty)
  eatGate: number; // eat-gate output 0..1 (slice B): 1 = head-down eating (slow), 0 = head-up (full speed)
  hidden: number[]; // hidden-unit activations (slice E), one per HIDDEN_UNITS; empty when hiddenLayer off
  glow: number; // mood-glow output 0..1 (slice F): bioluminescence read from the hidden layer; 0 when moodGlow off
  drift: number; // Σ|learned − instinct| over all brain weights (within-life learning so far)
}

/** Recompute one creature's brain I/O with steer()'s exact math (read-only). */
export function computeBrainState(store: OrganismStore, cfg: Config, slot: number): BrainState {
  const sg = slot * SCALAR_GENE_COUNT;
  const b = slot * BRAIN_GENES;
  const lb = store.learnedBrain;
  const ib = store.brain;
  const h = store.heading[slot]!;
  const dx = Math.cos(h);
  const dy = Math.sin(h);
  const gx = store.senseX[slot]!;
  const gy = store.senseY[slot]!;
  const fwd = gx * dx + gy * dy;
  const lat = -gx * dy + gy * dx;
  const vx = store.sightX[slot]!;
  const vy = store.sightY[slot]!;
  const sFwd = vx * dx + vy * dy;
  const sLat = -vx * dy + vy * dx;
  const wx = store.wallSenseX[slot]!;
  const wy = store.wallSenseY[slot]!;
  const wFwd = wx * dx + wy * dy;
  const wLat = -wx * dy + wy * dx;
  const fx = store.flowSenseX[slot]!;
  const fy = store.flowSenseY[slot]!;
  const flFwd = fx * dx + fy * dy;
  const flLat = -fx * dy + fy * dx;
  // Phero gradient — not shown as an input node, but the hidden layer reads it (must match steer's 14 inputs).
  const px = store.pheroSenseX[slot]!;
  const py = store.pheroSenseY[slot]!;
  const pFwd = px * dx + py * dy;
  const pLat = -px * dy + py * dx;

  const node = (
    label: string,
    value: number,
    turnG: number,
    thrustG: number,
    hidIdx: number, // this input's HiddenInput row (for the input→hidden W1 edges)
    eatG: number | null = null, // eat-gate gene index, or null when this input doesn't feed the eat-gate
  ): BrainInputNode => ({
    label,
    value,
    turnW: lb[b + turnG]!,
    thrustW: lb[b + thrustG]!,
    eatW: eatG !== null ? lb[b + eatG]! : 0,
    hidIdx,
    turnInst: ib[b + turnG]!,
    thrustInst: ib[b + thrustG]!,
  });

  const inputs: BrainInputNode[] = [
    node(
      'food fwd',
      fwd,
      Brain.FWD_TURN,
      Brain.FWD_THRUST,
      HiddenInput.FOOD_FWD,
      Brain.EAT_GATE_FWD,
    ),
    node(
      'food lat',
      lat,
      Brain.LAT_TURN,
      Brain.LAT_THRUST,
      HiddenInput.FOOD_LAT,
      Brain.EAT_GATE_LAT,
    ),
    node(
      'sight fwd',
      sFwd,
      Brain.SIGHT_FWD_TURN,
      Brain.SIGHT_FWD_THRUST,
      HiddenInput.SIGHT_FWD,
      Brain.EAT_GATE_SIGHT_FWD,
    ),
    node(
      'sight lat',
      sLat,
      Brain.SIGHT_LAT_TURN,
      Brain.SIGHT_LAT_THRUST,
      HiddenInput.SIGHT_LAT,
      Brain.EAT_GATE_SIGHT_LAT,
    ),
    node('wall fwd', wFwd, Brain.WALL_FWD_TURN, Brain.WALL_FWD_THRUST, HiddenInput.WALL_FWD),
    node('wall lat', wLat, Brain.WALL_LAT_TURN, Brain.WALL_LAT_THRUST, HiddenInput.WALL_LAT),
    node('flow fwd', flFwd, Brain.FLOW_FWD_TURN, Brain.FLOW_FWD_THRUST, HiddenInput.FLOW_FWD),
    node('flow lat', flLat, Brain.FLOW_LAT_TURN, Brain.FLOW_LAT_THRUST, HiddenInput.FLOW_LAT),
    node('bias', 1, Brain.TURN_BIAS, Brain.THRUST_BIAS, HiddenInput.BIAS, Brain.EAT_GATE_BIAS),
  ];
  // Interoceptive scalars — hoisted to function scope so the hidden layer below can read them (steer parity).
  // Each is 0 unless its lever is on, exactly mirroring steer().
  let hunger = 0;
  let aged = 0;
  let readiness = 0;
  // Hunger input only exists when the lever is on — mirror steer()'s gate so the picture matches the
  // sim (off: the term isn't summed at all, exactly as in steer()).
  if (cfg.hungerSense) {
    const sb = satiatedBar(store.scalarGenes, slot, cfg);
    hunger = sb > 0 ? 1 - store.energy[slot]! / sb : 1;
    if (hunger < 0) hunger = 0;
    else if (hunger > 1) hunger = 1;
    inputs.push(node('hunger', hunger, Brain.HUNGER_TURN, Brain.HUNGER_THRUST, HiddenInput.HUNGER));
  }
  // Age input (slice C): maturity = min(age/ageNorm, 1), mirroring steer()'s gate. Climbs over a life.
  if (cfg.ageSense) {
    aged = cfg.ageNorm > 0 ? store.age[slot]! / cfg.ageNorm : 0; // mirror steer's ageNorm≤0 guard
    if (aged > 1) aged = 1;
    inputs.push(node('age', aged, Brain.AGE_TURN, Brain.AGE_THRUST, HiddenInput.AGE));
  }
  // Repro-readiness input (slice D): clamp((energy − reproThreshold)/(satiatedBar − reproThreshold), 0, 1),
  // mirroring steer()'s gate. Climbs as the creature nears its breeding bar.
  if (cfg.readinessSense) {
    const repro = store.scalarGenes[slot * SCALAR_GENE_COUNT + ScalarGene.REPRO_THRESHOLD]!;
    const band = satiatedBar(store.scalarGenes, slot, cfg) - repro;
    readiness = band > 0 ? (store.energy[slot]! - repro) / band : 0;
    if (readiness < 0) readiness = 0;
    else if (readiness > 1) readiness = 1;
    inputs.push(
      node('ready', readiness, Brain.READINESS_TURN, Brain.READINESS_THRUST, HiddenInput.READINESS),
    );
  }

  let turnRaw = 0;
  let thrustRaw = 0;
  for (const n of inputs) {
    turnRaw += n.value * n.turnW;
    thrustRaw += n.value * n.thrustW;
  }

  // Hidden layer (slice E): the nonlinear correction on top of the linear sum, mirroring steer() exactly —
  // same 14 inputs (HiddenInput order, incl. the unshown phero pair + bias=1), same tanh, same W1/W2 blocks.
  const hidden: number[] = [];
  if (cfg.hiddenLayer) {
    const hin = [
      fwd,
      lat,
      sFwd,
      sLat,
      wFwd,
      wLat,
      flFwd,
      flLat,
      pFwd,
      pLat,
      hunger,
      aged,
      readiness,
      1,
    ];
    for (let j = 0; j < HIDDEN_UNITS; j++) {
      let s = 0;
      for (let ii = 0; ii < HIDDEN_INPUTS; ii++)
        s += hin[ii]! * lb[b + HIDDEN_W1 + ii * HIDDEN_UNITS + j]!;
      hidden.push(Math.tanh(s));
    }
    for (let j = 0; j < HIDDEN_UNITS; j++) {
      turnRaw += hidden[j]! * lb[b + HIDDEN_W2 + j * HIDDEN_OUTPUTS + 0]!;
      thrustRaw += hidden[j]! * lb[b + HIDDEN_W2 + j * HIDDEN_OUTPUTS + 1]!;
    }
  }

  const maxTurn = store.scalarGenes[sg + ScalarGene.MAX_TURN]!;
  const maxThrust = store.scalarGenes[sg + ScalarGene.MAX_THRUST]!;
  const eff = store.scalarGenes[sg + ScalarGene.METAB_EFF]!;
  // Same saturation branch as steer() (brain.ts) so the picture matches the sim under either mode, including
  // the reverse floor (slice A) and the eat-gate thrust penalty (slice B).
  const reverseFloor = cfg.reverseThrustFraction > 0 ? -cfg.reverseThrustFraction * maxThrust : 0;
  let turn: number;
  let thrust: number;
  if (cfg.motorSquash) {
    turn = maxTurn > 0 ? maxTurn * Math.tanh(turnRaw / maxTurn) : 0;
    thrust = maxThrust > 0 ? maxThrust * Math.tanh(thrustRaw / maxThrust) : 0;
    if (thrust < reverseFloor) thrust = reverseFloor;
  } else {
    turn = turnRaw;
    if (turn > maxTurn) turn = maxTurn;
    else if (turn < -maxTurn) turn = -maxTurn;
    thrust = thrustRaw;
    if (thrust < reverseFloor) thrust = reverseFloor;
    else if (thrust > maxThrust) thrust = maxThrust;
  }
  thrust *= eff;
  // Eat-gate (slice B): mirror steer() — eating throttles the body. Sigmoid gate from food + sight + bias.
  let eatGate = 1;
  if (cfg.brainGatedEating) {
    let eatGateRaw =
      lb[b + Brain.EAT_GATE_BIAS]! +
      lb[b + Brain.EAT_GATE_FWD]! * fwd +
      lb[b + Brain.EAT_GATE_LAT]! * lat +
      lb[b + Brain.EAT_GATE_SIGHT_FWD]! * sFwd +
      lb[b + Brain.EAT_GATE_SIGHT_LAT]! * sLat;
    if (cfg.hiddenLayer) {
      for (let j = 0; j < HIDDEN_UNITS; j++)
        eatGateRaw += hidden[j]! * lb[b + HIDDEN_W2 + j * HIDDEN_OUTPUTS + 2]!;
    }
    eatGate = 1 / (1 + Math.exp(-eatGateRaw));
    thrust *= 1 - eatGate * cfg.eatMovePenalty;
  }

  // Mood-glow (slice F): mirror steer() — glow = sigmoid(GLOW_BIAS + Σ_j hidden_j·GLOW_HID_j) from the
  // hidden "mood" layer. Display-only; 0 when off.
  let glow = 0;
  if (cfg.moodGlow) {
    let glowRaw = lb[b + GLOW_BIAS]!;
    if (cfg.hiddenLayer) {
      for (let j = 0; j < hidden.length; j++) glowRaw += hidden[j]! * lb[b + GLOW_HID + j]!;
    }
    glow = 1 / (1 + Math.exp(-glowRaw));
  }

  let drift = 0;
  for (let g = 0; g < BRAIN_GENES; g++) drift += Math.abs(lb[b + g]! - ib[b + g]!);

  return { inputs, turnRaw, thrustRaw, turn, thrust, eatGate, hidden, glow, drift };
}

// Edge thickness maps |weight| → [0,1] against this reference (weights are O(1–2)); purely cosmetic.
const EDGE_WEIGHT_SCALE = 2;

const POS = (r: number, g: number, bl: number, a: number): string => `rgba(${r},${g},${bl},${a})`;

export class BrainView {
  private readonly ctx: CanvasRenderingContext2D;
  private slot = -1;
  private gen = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable for the brain view');
    this.ctx = ctx;
  }

  select(slot: number, gen: number): void {
    this.slot = slot;
    this.gen = gen;
  }

  clear(): void {
    this.slot = -1;
  }

  render(store: OrganismStore | null, cfg: Config | null): void {
    const dpr = globalThis.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(120,170,210,0.06)';
    ctx.fillRect(0, 0, w, h);

    if (!store || !cfg || this.slot < 0 || !store.isAlive(this.slot, this.gen)) {
      ctx.fillStyle = 'rgba(140,160,180,0.6)';
      ctx.font = `${Math.round(11 * dpr)}px ui-monospace, monospace`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText('click a dot to watch its brain', w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }

    const st = computeBrainState(store, cfg, this.slot);
    const hasHidden = st.hidden.length > 0; // 3-layer view when the hidden layer is on
    // Keep inputs/outputs at the positions whose labels fit the panel; the hidden column sits BETWEEN them
    // (not by widening the span, which would push the output value labels off the panel's right edge).
    const inX = 0.3 * w;
    const hidX = 0.52 * w;
    const outX = 0.74 * w;
    const top = 26 * dpr;
    const bot = h - 12 * dpr;
    const inN = st.inputs.length;
    const inY = (i: number): number => top + ((bot - top) * i) / (inN - 1);
    const outY = (o: number): number => top + ((bot - top) * (o + 1)) / 5; // 4 outputs: turn, thrust, eat, glow
    const hidN = st.hidden.length;
    const hidY = (j: number): number => top + ((bot - top) * (j + 0.5)) / Math.max(1, hidN); // centered cells
    const nodeR = 5 * dpr;
    // Hidden-layer weights (read directly; the activations are in st.hidden) for the input→hidden + hidden→output edges.
    const hb = this.slot * BRAIN_GENES;
    const lbw = store.learnedBrain;

    // Normalize edge activity so the most-active synapse this frame reads full-bright.
    let maxAct = 1e-6;
    for (const n of st.inputs) {
      maxAct = Math.max(
        maxAct,
        Math.abs(n.value * n.turnW),
        Math.abs(n.value * n.thrustW),
        Math.abs(n.value * n.eatW),
      );
    }
    const edge = (
      ix: number,
      iy: number,
      ox: number,
      oy: number,
      weight: number,
      act: number,
    ): void => {
      const mag = Math.min(1, Math.abs(weight) / EDGE_WEIGHT_SCALE);
      const alpha = 0.18 + 0.82 * Math.min(1, Math.abs(act) / maxAct);
      ctx.lineWidth = Math.max(0.5 * dpr, mag * 4 * dpr);
      ctx.strokeStyle = weight >= 0 ? POS(120, 200, 240, alpha) : POS(240, 150, 90, alpha); // cyan + / orange −
      ctx.beginPath();
      ctx.moveTo(ix, iy);
      ctx.lineTo(ox, oy);
      ctx.stroke();
    };

    // Edges (behind nodes). With a hidden layer: input→hidden (W1) then hidden→output (W2) — a clean 3-layer
    // view. The direct linear skip edges are omitted to keep it legible (the output VALUES still include them).
    // Without it: the linear input→output map.
    if (hasHidden) {
      for (let i = 0; i < inN; i++) {
        const n = st.inputs[i]!;
        const iy = inY(i);
        for (let j = 0; j < hidN; j++) {
          const wgt = lbw[hb + HIDDEN_W1 + n.hidIdx * HIDDEN_UNITS + j]!;
          edge(inX, iy, hidX, hidY(j), wgt, n.value * wgt);
        }
      }
      for (let j = 0; j < hidN; j++) {
        const a = st.hidden[j]!;
        for (let o = 0; o < HIDDEN_OUTPUTS; o++) {
          const wgt = lbw[hb + HIDDEN_W2 + j * HIDDEN_OUTPUTS + o]!;
          edge(hidX, hidY(j), outX, outY(o), wgt, a * wgt);
        }
        // hidden→glow (slice F): glow is a 4th output (index 3) reading the hidden layer via the GLOW_HID block.
        const gwgt = lbw[hb + GLOW_HID + j]!;
        edge(hidX, hidY(j), outX, outY(3), gwgt, a * gwgt);
      }
    } else {
      for (let i = 0; i < inN; i++) {
        const n = st.inputs[i]!;
        const iy = inY(i);
        edge(inX, iy, outX, outY(0), n.turnW, n.value * n.turnW);
        edge(inX, iy, outX, outY(1), n.thrustW, n.value * n.thrustW);
        if (n.eatW !== 0) edge(inX, iy, outX, outY(2), n.eatW, n.value * n.eatW); // eat-gate edges (subset)
      }
    }

    ctx.font = `${Math.round(10 * dpr)}px ui-monospace, monospace`;
    ctx.textBaseline = 'middle';

    // Input nodes: fill by sign/strength of the live value; label on the left, value on the node.
    for (let i = 0; i < inN; i++) {
      const n = st.inputs[i]!;
      const iy = inY(i);
      const v = Math.tanh(n.value); // squash for fill intensity (values span orders of magnitude)
      ctx.fillStyle =
        n.value >= 0
          ? POS(120, 200, 240, 0.25 + 0.6 * Math.abs(v))
          : POS(240, 150, 90, 0.25 + 0.6 * Math.abs(v));
      ctx.beginPath();
      ctx.arc(inX, iy, nodeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(180,200,220,0.85)';
      ctx.textAlign = 'right';
      ctx.fillText(n.label, inX - nodeR - 4 * dpr, iy);
    }

    // Hidden nodes (slice E): the middle layer, filled violet by tanh activation (distinct from the input
    // cyan and output green). Watch them swing as the senses change — this is the conditional-logic layer.
    for (let j = 0; j < hidN; j++) {
      const a = st.hidden[j]!;
      const hy = hidY(j);
      ctx.fillStyle =
        a >= 0
          ? POS(190, 160, 230, 0.25 + 0.6 * Math.abs(a))
          : POS(240, 150, 90, 0.25 + 0.6 * Math.abs(a));
      ctx.beginPath();
      ctx.arc(hidX, hy, nodeR * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Output nodes.
    const drawOut = (o: number, label: string, value: number): void => {
      const oy = outY(o);
      const v = Math.tanh(value);
      ctx.fillStyle =
        value >= 0
          ? POS(140, 230, 170, 0.3 + 0.6 * Math.abs(v))
          : POS(240, 150, 90, 0.3 + 0.6 * Math.abs(v));
      ctx.beginPath();
      ctx.arc(outX, oy, nodeR * 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,220,235,0.9)';
      ctx.textAlign = 'left';
      ctx.fillText(`${label} ${value.toFixed(2)}`, outX + nodeR + 5 * dpr, oy);
    };
    drawOut(0, 'turn', st.turn);
    drawOut(1, 'thrust', st.thrust);
    drawOut(2, 'eat', st.eatGate); // eat-gate output (slice B): 1 = head-down eating, 0 = head-up fleeing
    drawOut(3, 'glow', st.glow); // mood-glow output (slice F): bioluminescence from the hidden mood layer

    // Header: raw outputs + learning drift.
    ctx.fillStyle = 'rgba(150,170,190,0.8)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `turn ${st.turnRaw.toFixed(2)}→${st.turn.toFixed(2)}  thrust ${st.thrustRaw.toFixed(2)}→${st.thrust.toFixed(2)}  eat ${st.eatGate.toFixed(2)}  glow ${st.glow.toFixed(2)}  drift ${st.drift.toFixed(2)}`,
      6 * dpr,
      6 * dpr,
    );
  }
}
