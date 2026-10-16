// Typed wrapper over the core's C ABI (crates/sim/src/abi.rs). The module has no imports.
//
// No typed-array view of WASM memory outlives one call: a call that grows memory detaches every
// older view. Each read makes a new view of `memory.buffer`.

import {
  ABI_VERSION,
  H_ENERGY,
  H_GENERATION,
  H_HUE,
  H_SLOT,
  H_UID,
  H_X,
  H_Y,
  HEIR_STRIDE,
  type Heir,
  type ParamInfo,
} from '../protocol';

export interface Sim {
  readonly abi: number;
  readonly worldW: number;
  readonly worldH: number;
  /** Makes the starting world. Call once, on a new world, after any `setParam`. */
  seedFounders(creatures: number, plants: number): void;
  tick(n: number): void;
  tickCount(): number;
  hash(): number; // unsigned
  stat(k: number): number;
  /** Writes a frame for the rectangle and copies it into `into`. Returns words written, or -1 if `into` is too small. */
  writeFrame(x0: number, y0: number, x1: number, y1: number, into: ArrayBuffer): number;
  save(): Uint8Array; // a copy
  params(): ParamInfo[];
  /** Clamps to the parameter's range. An index out of range does nothing. */
  setParam(index: number, value: number): void;
  /** The uid of the nearest creature within `r` of the point, or 0. */
  pick(x: number, y: number, r: number): number;
  /** False if no living creature has the uid. */
  possess(uid: number): boolean;
  release(): void;
  /** The uid of the possessed creature, or 0. */
  possessed(): number;
  /**
   * `accept`: the player courts. `abilities`: the abilities held, a mask of 1 dash, 2 lunge, and 4
   * toxin. While the input is manual, each bit sets the ability's command on the possessed body (rule X2).
   */
  input(manual: boolean, thrust: number, turn: number, accept: boolean, abilities: number): void;
  /** 0 for none. Set when the possessed creature dies. Cleared by the next possess. */
  deathCause(): number;
  /** The uid of the body that killed the possessed creature, or 0. Set and cleared with `deathCause`. */
  killer(): number;
  /** The readout of the killer's brain at the kill, as `readBrain` reads it. A copy. 0 words with no killer. */
  killerBrain(): Uint32Array;
  /** At most 5, highest `energy01` first. */
  heirs(): Heir[];
  /** The readout of the creature with this uid, as `readBrain` reads it. A copy. 0 words if it is not alive. */
  brain(uid: number): Uint32Array;
  free(): void;
}

export class SimError extends Error {}

/** A world pointer or a byte pointer. 0 is null. */
type Ptr = number;

interface Exports {
  readonly memory: WebAssembly.Memory;
  tp_abi_version(): number;
  tp_new(seed: number, w: number, h: number): Ptr;
  tp_free(world: Ptr): void;
  tp_seed_founders(world: Ptr, creatures: number, plants: number): void;
  tp_tick(world: Ptr, n: number): void;
  tp_world_w(world: Ptr): number;
  tp_world_h(world: Ptr): number;
  tp_tick_count(world: Ptr): number;
  tp_hash(world: Ptr): number;
  tp_stat(world: Ptr, k: number): number;
  tp_frame_write(world: Ptr, x0: number, y0: number, x1: number, y1: number): number;
  tp_frame_ptr(world: Ptr): Ptr;
  tp_alloc(len: number): Ptr;
  tp_dealloc(ptr: Ptr, len: number): void;
  tp_save(world: Ptr): number;
  tp_save_ptr(world: Ptr): Ptr;
  tp_load(ptr: Ptr, len: number): Ptr;
  tp_error_ptr(): Ptr;
  tp_error_len(): number;
  tp_param_count(): number;
  tp_param_name_ptr(i: number): Ptr;
  tp_param_name_len(i: number): number;
  tp_param_default(i: number): number;
  tp_param_min(i: number): number;
  tp_param_max(i: number): number;
  tp_param_get(world: Ptr, i: number): number;
  tp_param_set(world: Ptr, i: number, v: number): void;
  tp_pick(world: Ptr, x: number, y: number, r: number): number;
  tp_possess(world: Ptr, uid: number): number;
  tp_release(world: Ptr): void;
  tp_possessed(world: Ptr): number;
  tp_input(
    world: Ptr,
    manual: number,
    thrust: number,
    turn: number,
    accept: number,
    abilities: number,
  ): void;
  tp_death_cause(world: Ptr): number;
  tp_killer(world: Ptr): number;
  tp_killer_brain_len(world: Ptr): number;
  tp_killer_brain_ptr(world: Ptr): Ptr;
  tp_heir_stride(): number;
  tp_heirs_write(world: Ptr): number;
  tp_heirs_ptr(world: Ptr): Ptr;
  tp_brain_write(world: Ptr, uid: number): number;
  tp_brain_ptr(world: Ptr): Ptr;
}

/** Instantiates the module and makes or loads a world. Throws SimError on a wrong ABI version or a bad snapshot. */
export function createSim(
  module: WebAssembly.Module,
  opts: { seed: number; worldW: number; worldH: number; snapshot?: Uint8Array },
): Sim {
  const x = new WebAssembly.Instance(module, {}).exports as unknown as Exports;
  // An i32 result arrives signed. `>>> 0` makes it the u32 that the core returned.
  const abi = x.tp_abi_version() >>> 0;
  if (abi !== ABI_VERSION) {
    throw new SimError(
      `the core has ABI version ${abi} and this build needs ${ABI_VERSION}. Fix: run \`make wasm\` and reload.`,
    );
  }

  const text = (ptr: number, len: number): string =>
    new TextDecoder().decode(new Uint8Array(x.memory.buffer, ptr >>> 0, len >>> 0));
  const lastError = (): string => text(x.tp_error_ptr(), x.tp_error_len());

  const load = (snapshot: Uint8Array): Ptr => {
    const len = snapshot.length;
    const ptr = x.tp_alloc(len) >>> 0;
    if (ptr === 0) throw new SimError(`the core has no memory for a snapshot of ${len} bytes`);
    new Uint8Array(x.memory.buffer, ptr, len).set(snapshot);
    const loaded = x.tp_load(ptr, len) >>> 0;
    x.tp_dealloc(ptr, len);
    return loaded;
  };

  let world = opts.snapshot
    ? load(opts.snapshot)
    : x.tp_new(opts.seed, opts.worldW, opts.worldH) >>> 0;
  if (world === 0) throw new SimError(lastError());

  return {
    abi,
    // From the core, not from `opts`: a snapshot carries its own size.
    worldW: x.tp_world_w(world),
    worldH: x.tp_world_h(world),
    seedFounders: (creatures, plants) => x.tp_seed_founders(world, creatures, plants),
    tick: (n) => x.tp_tick(world, n),
    tickCount: () => x.tp_tick_count(world) >>> 0,
    hash: () => x.tp_hash(world) >>> 0,
    stat: (k) => x.tp_stat(world, k),
    writeFrame(x0, y0, x1, y1, into) {
      const words = x.tp_frame_write(world, x0, y0, x1, y1) >>> 0;
      if (into.byteLength < words * 4) return -1;
      const frame = new Uint32Array(x.memory.buffer, x.tp_frame_ptr(world) >>> 0, words);
      new Uint32Array(into, 0, words).set(frame);
      return words;
    },
    save() {
      const len = x.tp_save(world) >>> 0;
      return new Uint8Array(x.memory.buffer, x.tp_save_ptr(world) >>> 0, len).slice();
    },
    params() {
      const out: ParamInfo[] = [];
      const count = x.tp_param_count() >>> 0;
      for (let index = 0; index < count; index++) {
        out.push({
          index,
          name: text(x.tp_param_name_ptr(index), x.tp_param_name_len(index)),
          value: x.tp_param_get(world, index),
          default: x.tp_param_default(index),
          min: x.tp_param_min(index),
          max: x.tp_param_max(index),
        });
      }
      return out;
    },
    setParam: (index, value) => x.tp_param_set(world, index, value),
    pick: (px, py, r) => x.tp_pick(world, px, py, r) >>> 0,
    possess: (uid) => x.tp_possess(world, uid) !== 0,
    release: () => x.tp_release(world),
    possessed: () => x.tp_possessed(world) >>> 0,
    input: (manual, thrust, turn, accept, abilities) =>
      x.tp_input(world, manual ? 1 : 0, thrust, turn, accept ? 1 : 0, abilities),
    deathCause: () => x.tp_death_cause(world) >>> 0,
    killer: () => x.tp_killer(world) >>> 0,
    killerBrain() {
      const words = x.tp_killer_brain_len(world) >>> 0;
      if (words === 0) return new Uint32Array(0);
      return new Uint32Array(x.memory.buffer, x.tp_killer_brain_ptr(world) >>> 0, words).slice();
    },
    heirs() {
      const words = (x.tp_heirs_write(world) >>> 0) * HEIR_STRIDE;
      const ptr = x.tp_heirs_ptr(world) >>> 0;
      const u32 = new Uint32Array(x.memory.buffer, ptr, words);
      const f32 = new Float32Array(x.memory.buffer, ptr, words);
      const out: Heir[] = [];
      for (let o = 0; o < words; o += HEIR_STRIDE) {
        out.push({
          uid: u32[o + H_UID] ?? 0,
          slot: u32[o + H_SLOT] ?? 0,
          x: f32[o + H_X] ?? 0,
          y: f32[o + H_Y] ?? 0,
          energy01: f32[o + H_ENERGY] ?? 0,
          generation: u32[o + H_GENERATION] ?? 0,
          hue: f32[o + H_HUE] ?? 0,
        });
      }
      return out;
    },
    brain(uid) {
      const words = x.tp_brain_write(world, uid) >>> 0;
      if (words === 0) return new Uint32Array(0);
      return new Uint32Array(x.memory.buffer, x.tp_brain_ptr(world) >>> 0, words).slice();
    },
    // The core treats a null world as a no-op, so a call after `free` does nothing.
    free() {
      x.tp_free(world);
      world = 0;
    },
  };
}
