// Constants and layouts shared by the page and the worker. The frame layout mirrors
// crates/sim/src/frame.rs. tests/abi.test.ts fails if the two disagree.

export const ABI_VERSION = 1;
export const TICK_HZ = 20;
export const FRAME_HEADER_WORDS = 8;
export const CREATURE_STRIDE = 10;
export const PLANT_STRIDE = 4;
export const NO_SLOT = 0xffffffff;

// Word offsets in a creature record. The first seven are floats, the last three are integers.
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
export const FLAG_LINEAGE = 1,
  FLAG_POSSESSED = 2,
  FLAG_JUVENILE = 4;

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
  readonly creatureBase: number; // word index of the first creature record
  readonly plantBase: number;
}

export function viewFrame(buffer: ArrayBuffer): FrameView {
  const u32 = new Uint32Array(buffer);
  const word = (i: number): number => u32[i] ?? 0;
  const creatureCount = word(1);
  return {
    buffer,
    f32: new Float32Array(buffer),
    u32,
    tick: word(0),
    creatureCount,
    plantCount: word(2),
    creaturesAlive: word(3),
    plantsAlive: word(4),
    possessedSlot: word(5),
    brainDriving: word(6) === 1,
    creatureBase: FRAME_HEADER_WORDS,
    plantBase: FRAME_HEADER_WORDS + creatureCount * CREATURE_STRIDE,
  };
}

export const WORLD_W = 1536;
export const WORLD_H = 1024;
export const M0_DRIFTERS = 1500;
export const FRAME_POOL = 3;
export const MAX_FRAME_BYTES =
  4 * (FRAME_HEADER_WORDS + 4096 * CREATURE_STRIDE + 8192 * PLANT_STRIDE);

export type ToWorker =
  | { type: 'init'; seed: number; snapshot?: ArrayBuffer }
  | { type: 'view'; x0: number; y0: number; x1: number; y1: number }
  | { type: 'speed'; ticksPerSecond: number } // 0 pauses. TICK_HZ is normal.
  | { type: 'recycle'; buffer: ArrayBuffer }
  | { type: 'bench'; ticks: number };

export type FromWorker =
  | { type: 'ready'; abi: number; worldW: number; worldH: number }
  | { type: 'frame'; buffer: ArrayBuffer }
  | { type: 'stats'; tick: number; creatures: number; plants: number; tickMicros: number }
  | { type: 'benchResult'; ticks: number; millis: number; creatures: number }
  | { type: 'error'; message: string };
