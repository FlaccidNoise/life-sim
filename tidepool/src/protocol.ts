// Constants and layouts shared by the page and the worker. The frame layout mirrors
// crates/sim/src/frame.rs. tests/abi.test.ts fails if the two disagree.

export const ABI_VERSION = 7;
export const TICK_HZ = 20;
export const FRAME_HEADER_WORDS = 50;
export const CREATURE_STRIDE = 25;
export const PLANT_STRIDE = 4;
// A debris record: x, y, and its energy as a share of the capacity of the reference body.
export const DEBRIS_STRIDE = 3;
// A cloud record: x, y, radius, and its ticks left as a share of `toxin_ticks`.
export const CLOUD_STRIDE = 4;
export const PART_WORDS = 12;
export const MAX_EYES = 8;
export const MAX_FRAME_KILLS = 4;
export const NO_SLOT = 0xffffffff;

// Word offsets in a frame header. A cone is CONE_WORDS floats: its direction in world radians, the
// cosine of its half angle, and its range in world units. After the cones: the debris and cloud
// records, the `hurt_side` of the possessed body as a float, and the kills in view since the last
// frame, their count and then MAX_FRAME_KILLS places of KILL_WORDS: x and y as floats and the slot
// of the killer.
const F_LINEAGE_ALIVE = 7,
  F_BUDS = 8,
  F_CONE_COUNT = 9,
  F_CONES = 10,
  F_DEBRIS_COUNT = 34,
  F_CLOUD_COUNT = 35,
  F_HURT_SIDE = 36,
  F_KILL_COUNT = 37,
  F_KILLS = 38;
const CONE_WORDS = 3;
const KILL_WORDS = 3;

// Word offsets in a creature record. The first seven are floats, the next four are integers, and
// PART_WORDS part words follow from C_PARTS. The word at C_BRAIN is `hidden | conns << 16`: the
// hidden neurons and the connections that the brain of the body expresses. The word at C_GROWTH is
// a float: the share of its full size that the body has grown. The length and the width are as the
// body is now, so the length over the growth is the length gene. The last word, at C_AGE, is a
// float: the share of its life that the body has lived.
export const C_X = 0,
  C_Y = 1,
  C_HEADING = 2,
  C_LENGTH = 3,
  C_WIDTH = 4,
  C_HUE = 5,
  C_ENERGY = 6;
export const C_UID = 7,
  C_SLOT = 8,
  C_FLAGS = 9,
  C_BRAIN = 10;
export const C_PARTS = 11;
export const C_GROWTH = 23;
export const C_AGE = 24;
export const FLAG_LINEAGE = 1,
  FLAG_POSSESSED = 2,
  FLAG_JUVENILE = 4,
  FLAG_BUDDED = 8, // the body budded a short time ago
  FLAG_MIXED = 16, // the body was born of a cross
  FLAG_WILLING = 32, // the body accepts a mate now
  FLAG_DONOR = 64, // the body holds the genes of a partner for its next bud
  FLAG_BIT = 128, // a bite of the body took energy a short time ago
  FLAG_HURT = 256, // the body lost energy to a hit a short time ago
  FLAG_DASH = 512; // the body dashed or lunged a short time ago

// The kinds of part. They mirror the `KIND_` constants in crates/sim/src/genome.rs.
export const KIND_FLAGELLUM = 1,
  KIND_CILIA = 2,
  KIND_FILTER = 3,
  KIND_CHEMO = 4,
  KIND_FIN = 5,
  KIND_EYE = 6,
  KIND_JAW = 7,
  KIND_SPIKE = 8,
  KIND_SHELL = 9,
  KIND_TOXIN = 10;

// The bits of the abilities mask of the `input` message. They mirror `ABILITY_` in
// crates/sim/src/control.rs.
export const ABILITY_DASH = 1,
  ABILITY_LUNGE = 2,
  ABILITY_TOXIN = 4;

/** One part of a body. `anchor`, `size`, and `extra` are 0 to 1 each, in steps of 1/255. */
export interface Part {
  kind: number;
  anchor: number; // 0 at the nose, 1 at the tail
  size: number;
  extra: number; // an eye's cone width
}

/** A part word of a creature record. Null for a place with no part. */
export function unpackPart(word: number): Part | null {
  const kind = word & 0xff;
  if (kind === 0) return null;
  return {
    kind,
    anchor: ((word >>> 8) & 0xff) / 255,
    size: ((word >>> 16) & 0xff) / 255,
    extra: (word >>> 24) / 255,
  };
}

/**
 * One body of a frame, copied out of it: the buffer of a frame goes back to the worker. A parent or
 * a child at a bud.
 */
export interface Kin {
  uid: number;
  x: number;
  y: number;
  length: number; // as it is now. A body that is not full-grown is shorter than its genes make it.
  width: number;
  hue: number;
  growth: number; // the share of its full size that it has grown. 0 when the frame does not give it.
  flags: number;
  hidden: number; // hidden neurons
  conns: number; // connections
  parts: Part[]; // in gene order
}

/** A death with a killer, in view, since the last frame. */
export interface Kill {
  x: number;
  y: number;
  killerSlot: number; // the slot of the killer at the kill
}

/** An eye cone of the possessed body, in world space. */
export interface Cone {
  dir: number; // radians
  cosHalf: number; // the cosine of the half angle
  range: number;
}

export interface FrameView {
  readonly buffer: ArrayBuffer;
  readonly f32: Float32Array;
  readonly u32: Uint32Array;
  readonly tick: number;
  readonly creatureCount: number;
  readonly plantCount: number;
  readonly creaturesAlive: number;
  readonly plantsAlive: number;
  readonly possessedSlot: number;
  readonly brainDriving: boolean;
  readonly lineageAlive: number; // living creatures with the lineage mark
  readonly buds: number; // buds of the possessed body since it was possessed
  readonly cones: Cone[]; // of the possessed body. Empty with nothing possessed.
  readonly debrisCount: number;
  readonly cloudCount: number;
  // The side of the last hit on the possessed body: -1 to 1, negative on the side of negative angles.
  readonly hurtSide: number;
  readonly kills: Kill[];
  readonly creatureBase: number; // word index of the first creature record
  readonly plantBase: number;
  readonly debrisBase: number;
  readonly cloudBase: number;
}

export function viewFrame(buffer: ArrayBuffer): FrameView {
  const u32 = new Uint32Array(buffer);
  const f32 = new Float32Array(buffer);
  const word = (i: number): number => u32[i] ?? 0;
  const creatureCount = word(1);
  const plantBase = FRAME_HEADER_WORDS + creatureCount * CREATURE_STRIDE;
  const debrisBase = plantBase + word(2) * PLANT_STRIDE;
  const kills: Kill[] = [];
  for (let k = 0; k < Math.min(word(F_KILL_COUNT), MAX_FRAME_KILLS); k++) {
    const o = F_KILLS + k * KILL_WORDS;
    kills.push({ x: f32[o] ?? 0, y: f32[o + 1] ?? 0, killerSlot: word(o + 2) });
  }
  const cones: Cone[] = [];
  for (let k = 0; k < Math.min(word(F_CONE_COUNT), MAX_EYES); k++) {
    const o = F_CONES + k * CONE_WORDS;
    cones.push({ dir: f32[o] ?? 0, cosHalf: f32[o + 1] ?? 0, range: f32[o + 2] ?? 0 });
  }
  return {
    buffer,
    f32,
    u32,
    tick: word(0),
    creatureCount,
    plantCount: word(2),
    creaturesAlive: word(3),
    plantsAlive: word(4),
    possessedSlot: word(5),
    brainDriving: word(6) === 1,
    lineageAlive: word(F_LINEAGE_ALIVE),
    buds: word(F_BUDS),
    cones,
    debrisCount: word(F_DEBRIS_COUNT),
    cloudCount: word(F_CLOUD_COUNT),
    hurtSide: f32[F_HURT_SIDE] ?? 0,
    kills,
    creatureBase: FRAME_HEADER_WORDS,
    plantBase,
    debrisBase,
    cloudBase: debrisBase + word(F_DEBRIS_COUNT) * DEBRIS_STRIDE,
  };
}

// The layout of a brain readout. It mirrors `brain::readout` in crates/sim/src/brain.rs.
// tests/abi.test.ts fails if the two disagree.
export const BRAIN_HEADER_WORDS = 6;
export const BRAIN_NEURON_WORDS = 6;
export const BRAIN_CONN_WORDS = 3;
// The kind of a hidden neuron. A neuron of the body has kind 0. Another kind is the kind of the part
// that owns the port.
export const KIND_HIDDEN = 255;

export interface BrainNeuron {
  owner: number; // the history id of the part, or 0 for the body
  port: number;
  kind: number; // 0 for the body, KIND_HIDDEN for a hidden neuron, else the kind of the part
  gene: number; // the index of the hidden gene or of the part gene
  activation: number;
  bias: number;
  alpha: number;
}

export interface BrainConn {
  src: number; // an index into `neurons`
  dst: number; // an index into `neurons`
  weight: number;
  history: number;
}

/** The brain of one body. The neurons are in block order: inputs, then hidden, then outputs. */
export interface BrainView {
  uid: number;
  inputs: number;
  hidden: number;
  outputs: number;
  manual: boolean; // the player steers this body
  neurons: BrainNeuron[];
  connections: BrainConn[];
}

/** Reads the words of a `brain` message. Null for 0 words: no body is possessed. */
export function readBrain(words: Uint32Array): BrainView | null {
  if (words.length === 0) return null;
  const word = (i: number): number => words[i] ?? 0;
  const [uid, inputs, hidden, outputs, conns] = [word(0), word(1), word(2), word(3), word(4)];
  const count = inputs + hidden + outputs;
  const expected = BRAIN_HEADER_WORDS + count * BRAIN_NEURON_WORDS + conns * BRAIN_CONN_WORDS;
  if (words.length < BRAIN_HEADER_WORDS || words.length !== expected) {
    throw new Error(
      `a brain readout of ${words.length} words does not fit its header, which needs ${expected}. Fix: pass the words of one \`brain\` message whole, and keep BRAIN_* in src/protocol.ts equal to crates/sim/src/brain.rs.`,
    );
  }
  const f32 = new Float32Array(words.buffer, words.byteOffset, words.length);
  const float = (i: number): number => f32[i] ?? 0;
  const neurons: BrainNeuron[] = [];
  for (let i = 0; i < count; i++) {
    const o = BRAIN_HEADER_WORDS + i * BRAIN_NEURON_WORDS;
    const kind = word(o + 2);
    neurons.push({
      owner: word(o),
      port: word(o + 1),
      kind: kind & 0xff,
      gene: kind >>> 8,
      activation: float(o + 3),
      bias: float(o + 4),
      alpha: float(o + 5),
    });
  }
  const connections: BrainConn[] = [];
  const base = BRAIN_HEADER_WORDS + count * BRAIN_NEURON_WORDS;
  for (let i = 0; i < conns; i++) {
    const o = base + i * BRAIN_CONN_WORDS;
    const ends = word(o);
    connections.push({
      src: ends & 0xffff,
      dst: ends >>> 16,
      weight: float(o + 1),
      history: word(o + 2),
    });
  }
  return { uid, inputs, hidden, outputs, manual: word(5) === 1, neurons, connections };
}

// Word offsets in an heir record (HEIR_STRIDE words). The layout mirrors `write_heirs` in
// crates/sim/src/control.rs.
export const HEIR_STRIDE = 7;
export const H_UID = 0,
  H_SLOT = 1,
  H_X = 2,
  H_Y = 3,
  H_ENERGY = 4,
  H_GENERATION = 5,
  H_HUE = 6;

export const WORLD_W = 1536;
export const WORLD_H = 1024;
export const FOUNDER_CREATURES = 400;
export const FOUNDER_PLANTS = 1200;
// Ticks that a bench runs before it times anything. The same as `--settle` of the benches in
// crates/headless/src/bench.rs and scripts/bench-wasm.mjs.
export const BENCH_SETTLE_TICKS = 12000;
export const FRAME_POOL = 3;
// The pools of the core: creatures, plants, debris, and clouds.
export const MAX_FRAME_BYTES =
  4 *
  (FRAME_HEADER_WORDS +
    4096 * CREATURE_STRIDE +
    8192 * PLANT_STRIDE +
    4096 * DEBRIS_STRIDE +
    256 * CLOUD_STRIDE);

export type DeathCause = 'starved' | 'old age' | 'eaten' | 'poisoned' | 'spiked';

/** One row of the parameter table in crates/sim/src/params.rs. */
export interface ParamInfo {
  index: number;
  name: string;
  value: number;
  default: number;
  min: number;
  max: number;
}

/** A living creature of the player's lineage. */
export interface Heir {
  uid: number;
  slot: number;
  x: number;
  y: number;
  energy01: number;
  generation: number;
  hue: number;
}

export type ToWorker =
  // `params` are set by name before the founders are seeded.
  | {
      type: 'init';
      seed: number;
      snapshot?: ArrayBuffer;
      params?: { name: string; value: number }[];
    }
  | { type: 'view'; x0: number; y0: number; x1: number; y1: number }
  | { type: 'speed'; ticksPerSecond: number } // 0 pauses. TICK_HZ is normal.
  | { type: 'recycle'; buffer: ArrayBuffer }
  | { type: 'bench'; settle: number; ticks: number } // `settle` ticks run first and are not timed
  | { type: 'possessAt'; x: number; y: number; radius: number }
  | { type: 'possess'; uid: number }
  | { type: 'release' }
  // `accept`: the player courts. `abilities`: the abilities held, 1 dash, 2 lunge, 4 toxin; absent
  // for none. The core reads both while `manual` is set.
  | {
      type: 'input';
      manual: boolean;
      thrust: number;
      turn: number;
      accept: boolean;
      abilities?: number;
    }
  | { type: 'param'; index: number; value: number }
  // With `on`, a `brain` message follows each frame while a body is possessed.
  | { type: 'watchBrain'; on: boolean }
  // Answered by one `brainOf` message, at once.
  | { type: 'brainOf'; uid: number };

export type FromWorker =
  | { type: 'ready'; abi: number; worldW: number; worldH: number; params: ParamInfo[] }
  | { type: 'frame'; buffer: ArrayBuffer }
  | { type: 'possessed'; uid: number } // 0: nothing there, or released
  | { type: 'died'; cause: DeathCause; heirs: Heir[] }
  // The readout of the possessed body: see `readBrain`. 0 words when no body is possessed, sent once.
  | { type: 'brain'; words: Uint32Array }
  // The readout of the body `uid`: see `readBrain`. 0 words when no living body has the uid.
  | { type: 'brainOf'; uid: number; words: Uint32Array }
  | { type: 'stats'; tick: number; creatures: number; plants: number; tickMicros: number }
  | { type: 'benchResult'; ticks: number; millis: number; creatures: number } // alive at the end
  | { type: 'error'; message: string };
