// Typed wrapper over the core's C ABI (crates/sim/src/abi.rs). The module has no imports.
//
// No typed-array view of WASM memory outlives one call: a call that grows memory detaches every
// older view. Each read makes a new view of `memory.buffer`.

import { ABI_VERSION } from '../protocol';

export interface Sim {
  readonly abi: number;
  readonly worldW: number;
  readonly worldH: number;
  spawnDrifters(n: number): void;
  tick(n: number): void;
  tickCount(): number;
  hash(): number; // unsigned
  stat(k: number): number;
  /** Writes a frame for the rectangle and copies it into `into`. Returns words written, or -1 if `into` is too small. */
  writeFrame(x0: number, y0: number, x1: number, y1: number, into: ArrayBuffer): number;
  save(): Uint8Array; // a copy
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
  tp_spawn_drifters(world: Ptr, n: number): void;
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

  const lastError = (): string =>
    new TextDecoder().decode(
      new Uint8Array(x.memory.buffer, x.tp_error_ptr() >>> 0, x.tp_error_len() >>> 0),
    );

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
    spawnDrifters: (n) => x.tp_spawn_drifters(world, n),
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
    // The core treats a null world as a no-op, so a call after `free` does nothing.
    free() {
      x.tp_free(world);
      world = 0;
    },
  };
}
