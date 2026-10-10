import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import * as P from '../src/protocol';
import { createSim, SimError } from '../src/worker/wasm';

const bytes = readFileSync(new URL('../src/wasm/tidepool_sim.wasm', import.meta.url));
const module = new WebAssembly.Module(bytes);
const fresh = () => createSim(module, { seed: 1, worldW: 1536, worldH: 1024 });

test('ABI version matches protocol.ts', () => {
  expect(fresh().abi).toBe(P.ABI_VERSION);
});

test('frame layout constants match the module', () => {
  const { exports } = new WebAssembly.Instance(module, {});
  const n = (name: string) => (exports[name] as () => number)();
  expect(n('tp_frame_header_words')).toBe(P.FRAME_HEADER_WORDS);
  expect(n('tp_frame_creature_stride')).toBe(P.CREATURE_STRIDE);
  expect(n('tp_frame_plant_stride')).toBe(P.PLANT_STRIDE);
});

test('a frame of the whole world holds every creature', () => {
  const sim = fresh();
  sim.spawnDrifters(300);
  sim.tick(10);
  const buf = new ArrayBuffer(4 * (P.FRAME_HEADER_WORDS + 300 * P.CREATURE_STRIDE));
  const words = sim.writeFrame(0, 0, 1536, 1024, buf);
  const f = P.viewFrame(buf);
  expect(words).toBe(P.FRAME_HEADER_WORDS + 300 * P.CREATURE_STRIDE);
  expect(f.tick).toBe(10);
  expect(f.creatureCount).toBe(300);
  expect(f.creaturesAlive).toBe(300);
  expect(f.possessedSlot).toBe(P.NO_SLOT);
  const uids = new Set<number>();
  for (let i = 0; i < f.creatureCount; i++) {
    const o = f.creatureBase + i * P.CREATURE_STRIDE;
    expect(f.f32[o + P.C_X]).toBeGreaterThanOrEqual(0);
    expect(f.f32[o + P.C_X]).toBeLessThanOrEqual(1536);
    expect(f.f32[o + P.C_LENGTH]).toBeGreaterThan(0);
    uids.add(f.u32[o + P.C_UID] ?? 0);
  }
  expect(uids.size).toBe(300);
  expect(uids.has(0)).toBe(false);
});

test('a small view holds fewer creatures and only ones near it', () => {
  const sim = fresh();
  sim.spawnDrifters(1000);
  sim.tick(1);
  const buf = new ArrayBuffer(4 * (P.FRAME_HEADER_WORDS + 1000 * P.CREATURE_STRIDE));
  sim.writeFrame(400, 300, 600, 500, buf);
  const f = P.viewFrame(buf);
  expect(f.creatureCount).toBeGreaterThan(0);
  expect(f.creatureCount).toBeLessThan(300);
  for (let i = 0; i < f.creatureCount; i++) {
    const o = f.creatureBase + i * P.CREATURE_STRIDE;
    expect(f.f32[o + P.C_X]).toBeGreaterThan(400 - 64);
    expect(f.f32[o + P.C_X]).toBeLessThan(600 + 64);
  }
});

test('writeFrame reports a buffer that is too small', () => {
  const sim = fresh();
  sim.spawnDrifters(300);
  expect(sim.writeFrame(0, 0, 1536, 1024, new ArrayBuffer(64))).toBe(-1);
});

test('save then load gives the same hash and the same future', () => {
  const a = fresh();
  a.spawnDrifters(300);
  a.tick(200);
  const b = createSim(module, { seed: 0, worldW: 1536, worldH: 1024, snapshot: a.save() });
  expect(b.hash()).toBe(a.hash());
  a.tick(200);
  b.tick(200);
  expect(b.hash()).toBe(a.hash());
});

test('a corrupt snapshot throws SimError with the reason', () => {
  const a = fresh();
  a.spawnDrifters(50);
  const snap = a.save();
  snap[snap.length >> 1] = (snap[snap.length >> 1] ?? 0) ^ 0x40;
  expect(() => createSim(module, { seed: 0, worldW: 1536, worldH: 1024, snapshot: snap })).toThrow(
    SimError,
  );
});

test('a loaded world reports the size in the snapshot, not the size in the options', () => {
  const snapshot = fresh().save();
  const b = createSim(module, { seed: 0, worldW: 99, worldH: 99, snapshot });
  expect(b.worldW).toBe(1536);
  expect(b.worldH).toBe(1024);
});

test('a module with another ABI version is refused', () => {
  // A module written by hand. It exports `memory` and a `tp_abi_version` that returns 99.
  const name = (s: string) => [s.length, ...new TextEncoder().encode(s)];
  const section = (id: number, body: number[]) => [id, body.length, ...body];
  const other = new WebAssembly.Module(
    new Uint8Array([
      ...[0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00], // magic and version
      ...section(1, [1, 0x60, 0, 1, 0x7f]), // type 0: () -> i32
      ...section(3, [1, 0]), // function 0 has type 0
      ...section(5, [1, 0, 1]), // one memory of 1 page
      ...section(7, [2, ...name('tp_abi_version'), 0, 0, ...name('memory'), 2, 0]),
      ...section(10, [1, 5, 0, 0x41, 0xe3, 0x00, 0x0b]), // body: i32.const 99
    ]),
  );
  const make = () => createSim(other, { seed: 1, worldW: 1536, worldH: 1024 });
  expect(make).toThrow(SimError);
  expect(make).toThrow(`ABI version 99 and this build needs ${P.ABI_VERSION}`);
});
