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
  expect(n('tp_heir_stride')).toBe(P.HEIR_STRIDE);
});

test('a frame of the whole world holds every creature', () => {
  const sim = fresh();
  sim.seedFounders(300, 0);
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
    expect(f.f32[o + P.C_WIDTH]).toBeLessThan(f.f32[o + P.C_LENGTH] ?? 0);
    // A founder starts at 0.5 and has paid 10 ticks of upkeep with nothing to eat.
    expect(f.f32[o + P.C_ENERGY]).toBeGreaterThan(0.45);
    expect(f.f32[o + P.C_ENERGY]).toBeLessThan(0.5);
    expect(f.u32[o + P.C_FLAGS]).toBe(0);
    uids.add(f.u32[o + P.C_UID] ?? 0);
  }
  expect(uids.size).toBe(300);
  expect(uids.has(0)).toBe(false);
});

test('a small view holds fewer creatures and only ones near it', () => {
  const sim = fresh();
  sim.seedFounders(1000, 0);
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
  sim.seedFounders(300, 0);
  expect(sim.writeFrame(0, 0, 1536, 1024, new ArrayBuffer(64))).toBe(-1);
});

test('save then load gives the same hash and the same future', () => {
  const a = fresh();
  a.seedFounders(300, 0);
  a.tick(200);
  const b = createSim(module, { seed: 0, worldW: 1536, worldH: 1024, snapshot: a.save() });
  expect(b.hash()).toBe(a.hash());
  a.tick(200);
  b.tick(200);
  expect(b.hash()).toBe(a.hash());
});

test('a corrupt snapshot throws SimError with the reason', () => {
  const a = fresh();
  a.seedFounders(50, 0);
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

test('the parameter table reads and writes through the ABI', () => {
  const sim = fresh();
  const params = sim.params();
  expect(params.map((p) => p.index)).toEqual(params.map((_, i) => i));
  expect(new Set(params.map((p) => p.name)).size).toBe(params.length);
  const repel = params.find((p) => p.name === 'repel');
  if (!repel) throw new Error('no parameter repel');
  sim.setParam(repel.index, 0.5);
  expect(sim.params()[repel.index]?.value).toBeCloseTo(0.5, 6);
  // A value outside the range is clamped.
  sim.setParam(repel.index, 99);
  expect(sim.params()[repel.index]?.value).toBe(repel.max);
});

test('a parameter index out of range reads as 0 and writes nothing', () => {
  const sim = fresh();
  const before = sim.hash();
  sim.setParam(sim.params().length, 1);
  sim.setParam(0xffffffff, 1);
  expect(sim.hash()).toBe(before);
  const x = new WebAssembly.Instance(module, {}).exports as Record<string, (i: number) => number>;
  const count = x.tp_param_count?.(0) ?? 0;
  for (const name of ['tp_param_default', 'tp_param_min', 'tp_param_max', 'tp_param_name_len']) {
    expect(x[name]?.(count)).toBe(0);
  }
  expect(x.tp_param_name_ptr?.(count)).toBe(0);
});

test('a parameter change changes the future', () => {
  const [a, b] = [fresh(), fresh()];
  const repel = a.params().find((p) => p.name === 'repel');
  if (!repel) throw new Error('no parameter repel');
  b.setParam(repel.index, 0);
  for (const sim of [a, b]) {
    sim.seedFounders(1000, 0);
    sim.tick(50);
  }
  expect(b.hash()).not.toBe(a.hash());
});

test('pick, possess, input, and release go through the ABI', () => {
  const sim = fresh();
  sim.seedFounders(300, 0);
  const buf = new ArrayBuffer(4 * (P.FRAME_HEADER_WORDS + 300 * P.CREATURE_STRIDE));
  sim.writeFrame(0, 0, 1536, 1024, buf);
  let f = P.viewFrame(buf);
  const o = f.creatureBase;
  const [x, y, uid, slot] = [
    f.f32[o + P.C_X],
    f.f32[o + P.C_Y],
    f.u32[o + P.C_UID],
    f.u32[o + P.C_SLOT],
  ];
  expect(sim.pick(x ?? 0, y ?? 0, 2)).toBe(uid);
  expect(sim.pick(-5000, -5000, 2)).toBe(0);
  expect(sim.possess(0)).toBe(false);
  expect(sim.possess(uid ?? 0)).toBe(true);
  expect(sim.possessed()).toBe(uid);
  expect(sim.deathCause()).toBe(0);

  sim.input(true, 1, -1);
  sim.tick(1);
  sim.writeFrame(0, 0, 1536, 1024, buf);
  f = P.viewFrame(buf);
  expect(f.possessedSlot).toBe(slot);
  expect(f.brainDriving).toBe(false);
  let flagged = 0;
  for (let i = 0; i < f.creatureCount; i++) {
    const r = f.creatureBase + i * P.CREATURE_STRIDE;
    const flags = f.u32[r + P.C_FLAGS] ?? 0;
    if (f.u32[r + P.C_UID] === uid) {
      expect(flags).toBe(P.FLAG_LINEAGE | P.FLAG_POSSESSED);
      flagged++;
    } else expect(flags).toBe(0);
  }
  expect(flagged).toBe(1);

  sim.release();
  expect(sim.possessed()).toBe(0);
  sim.writeFrame(0, 0, 1536, 1024, buf);
  expect(P.viewFrame(buf).possessedSlot).toBe(P.NO_SLOT);
});

test('heirs are the marked creatures, read through the ABI', () => {
  const sim = fresh();
  sim.seedFounders(300, 0);
  expect(sim.heirs()).toEqual([]);
  const uids = [10, 20, 30];
  for (const uid of uids) expect(sim.possess(uid)).toBe(true);
  sim.release();
  const heirs = sim.heirs();
  expect(heirs.map((h) => h.uid).sort((a, b) => a - b)).toEqual(uids);
  for (const h of heirs) {
    expect(sim.pick(h.x, h.y, 0.5)).toBe(h.uid);
    expect(h.slot).toBe(h.uid - 1); // founders fill slots in uid order
    expect(h.energy01).toBeCloseTo(0.5, 5);
    expect(h.generation).toBe(0);
    expect(h.hue).toBeGreaterThanOrEqual(0);
    expect(h.hue).toBeLessThan(1);
  }
});

test('a call after free does nothing', () => {
  const sim = fresh();
  sim.seedFounders(10, 0);
  sim.free();
  sim.seedFounders(10, 0);
  sim.setParam(0, 1);
  sim.input(true, 1, 1);
  sim.release();
  expect(sim.possess(1)).toBe(false);
  expect([sim.pick(0, 0, 9999), sim.possessed(), sim.deathCause()]).toEqual([0, 0, 0]);
  expect(sim.heirs()).toEqual([]);
  expect(sim.params()[0]?.value).toBe(0);
});
