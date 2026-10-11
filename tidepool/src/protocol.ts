// Constants and layouts shared by the page and the worker. The frame layout mirrors
// crates/sim/src/frame.rs. tests/abi.test.ts fails if the two disagree.

export const ABI_VERSION = 3;
export const TICK_HZ = 20;
export const FRAME_HEADER_WORDS = 34;
export const CREATURE_STRIDE = 22;
export const PLANT_STRIDE = 4;
export const PART_WORDS = 12;
export const MAX_EYES = 8;
export const NO_SLOT = 0xffffffff;

// Word offsets in a frame header. A cone is CONE_WORDS floats: its direction in world radians, the
// cosine of its half angle, and its range in world units.
const F_LINEAGE_ALIVE = 7,
  F_BUDS = 8,
  F_CONE_COUNT = 9,
  F_CONES = 10;
const CONE_WORDS = 3;

// Word offsets in a creature record. The first seven are floats, the next three are integers, and
// PART_WORDS part words follow from C_PARTS.
export const C_X = 0,
  C_Y = 1,
  C_HEADING = 2,
  C_LENGTH = 3,
  C_WIDTH = 4,
  C_HUE = 5,
  C_ENERGY = 6;
export const C_UID = 7,
  C_SLOT = 8,
  C_FLAGS = 9;
export const C_PARTS = 10;
export const FLAG_LINEAGE = 1,
  FLAG_POSSESSED = 2,
  FLAG_JUVENILE = 4,
  FLAG_BUDDED = 8; // the body budded a short time ago

// The kinds of part. They mirror the `KIND_` constants in crates/sim/src/genome.rs.
export const KIND_FLAGELLUM = 1,
  KIND_CILIA = 2,
  KIND_FILTER = 3,
  KIND_CHEMO = 4,
  KIND_FIN = 5,
  KIND_EYE = 6;

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
  readonly creatureBase: number; // word index of the first creature record
  readonly plantBase: number;
}

export function viewFrame(buffer: ArrayBuffer): FrameView {
  const u32 = new Uint32Array(buffer);
  const f32 = new Float32Array(buffer);
  const word = (i: number): number => u32[i] ?? 0;
  const creatureCount = word(1);
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
    creatureBase: FRAME_HEADER_WORDS,
    plantBase: FRAME_HEADER_WORDS + creatureCount * CREATURE_STRIDE,
  };
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
export const MAX_FRAME_BYTES =
  4 * (FRAME_HEADER_WORDS + 4096 * CREATURE_STRIDE + 8192 * PLANT_STRIDE);

export type DeathCause = 'starved' | 'old age';

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
  | { type: 'input'; manual: boolean; thrust: number; turn: number }
  | { type: 'param'; index: number; value: number };

export type FromWorker =
  | { type: 'ready'; abi: number; worldW: number; worldH: number; params: ParamInfo[] }
  | { type: 'frame'; buffer: ArrayBuffer }
  | { type: 'possessed'; uid: number } // 0: nothing there, or released
  | { type: 'died'; cause: DeathCause; heirs: Heir[] }
  | { type: 'stats'; tick: number; creatures: number; plants: number; tickMicros: number }
  | { type: 'benchResult'; ticks: number; millis: number; creatures: number } // alive at the end
  | { type: 'error'; message: string };
