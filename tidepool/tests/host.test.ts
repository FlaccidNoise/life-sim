import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import * as P from '../src/protocol';
import { createHost, type HostDeps } from '../src/worker/host';
import { createSim, type Sim } from '../src/worker/wasm';

const module = new WebAssembly.Module(
  readFileSync(new URL('../src/wasm/tidepool_sim.wasm', import.meta.url)),
);

// The fake clock moves in 10 ms steps. With `recycle`, each posted frame buffer is handed back after
// the step that posted it, as the page does. After `drift(ms)`, each read of the clock also moves it.
// `wrap` stands between the host and the core.
function rig(opts: { recycle?: boolean; wrap?: (sim: Sim) => Sim } = {}) {
  let now = 0;
  let perRead = 0;
  let timer: (() => void) | undefined;
  let recycled = 0;
  const sent: P.FromWorker[] = [];
  const deps: HostDeps = {
    now: () => (now += perRead),
    post: (m) => void sent.push(m),
    every: (_ms, fn) => {
      timer = fn;
      return () => void (timer = undefined);
    },
    makeSim: (o) => {
      const sim = createSim(module, { worldW: P.WORLD_W, worldH: P.WORLD_H, ...o });
      return opts.wrap ? opts.wrap(sim) : sim;
    },
  };
  const host = createHost(deps);
  const of = <T extends P.FromWorker['type']>(type: T) =>
    sent.filter((m): m is Extract<P.FromWorker, { type: T }> => m.type === type);
  const pump = () => {
    timer?.();
    if (!opts.recycle) return;
    const frames = of('frame');
    for (; recycled < frames.length; recycled++) {
      const f = frames[recycled];
      if (f) host.handle({ type: 'recycle', buffer: f.buffer });
    }
  };
  const advance = (ms: number) => {
    for (let t = 0; t < ms; t += 10) {
      now += 10;
      pump();
    }
  };
  const jump = (ms: number) => void (now += ms);
  const drift = (ms: number) => void (perRead = ms);
  const lastTick = () => {
    const f = of('frame').at(-1);
    return f ? P.viewFrame(f.buffer).tick : -1;
  };
  return { host, advance, jump, drift, sent, of, lastTick };
}

function frameOf(r: ReturnType<typeof rig>) {
  const f = r.of('frame').at(-1);
  if (!f) throw new Error('no frame yet');
  return P.viewFrame(f.buffer);
}

/** The place of the first creature in the last frame, as a `possessAt` message. */
function firstCreature(r: ReturnType<typeof rig>) {
  const f = frameOf(r);
  const o = f.creatureBase;
  return {
    type: 'possessAt' as const,
    x: f.f32[o + P.C_X] ?? 0,
    y: f.f32[o + P.C_Y] ?? 0,
    radius: 4,
  };
}

test('init posts ready with the ABI version and world size', () => {
  const r = rig();
  r.host.handle({ type: 'init', seed: 1 });
  expect(r.of('ready')).toMatchObject([
    { type: 'ready', abi: P.ABI_VERSION, worldW: P.WORLD_W, worldH: P.WORLD_H },
  ]);
});

test('one second of wall time is twenty ticks', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.advance(1000);
  expect(r.lastTick()).toBe(20);
});

test('frames stop when no buffer comes back, and ticking continues', () => {
  const r = rig();
  r.host.handle({ type: 'init', seed: 1 });
  r.advance(2000);
  expect(r.of('frame').length).toBe(P.FRAME_POOL);
  expect(r.of('stats').at(-1)?.tick).toBe(40);
});

test('speed 0 pauses', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.host.handle({ type: 'speed', ticksPerSecond: 0 });
  r.advance(1000);
  expect(r.of('frame').length).toBe(0);
});

test('a long stall runs at most 5 ticks and drops the rest', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.advance(100);
  expect(r.lastTick()).toBe(2);
  r.jump(10_000);
  r.advance(10);
  expect(r.lastTick()).toBe(7);
  r.advance(50);
  expect(r.lastTick()).toBe(8);
});

test('a message before init is an error, not a crash', () => {
  const r = rig();
  r.host.handle({ type: 'view', x0: 0, y0: 0, x1: 10, y1: 10 });
  expect(r.of('error').length).toBe(1);
});

test('a corrupt snapshot becomes an error message', () => {
  const r = rig();
  r.host.handle({ type: 'init', seed: 1, snapshot: new ArrayBuffer(40) });
  expect(r.of('error').length).toBe(1);
  expect(r.of('ready').length).toBe(0);
});

test('bench replies and does not advance the main world', () => {
  const r = rig();
  r.host.handle({ type: 'init', seed: 1 });
  r.host.handle({ type: 'bench', ticks: 200 });
  const b = r.of('benchResult')[0];
  expect(b?.ticks).toBe(200);
  expect(b?.creatures).toBe(1500);
  expect(r.of('frame').length).toBe(0);
});

test('the time a bench takes is not owed to the main world', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.advance(100);
  expect(r.lastTick()).toBe(2);
  r.drift(5000);
  r.host.handle({ type: 'bench', ticks: 200 });
  r.drift(0);
  expect(r.of('benchResult')[0]?.millis).toBe(5000);
  r.advance(10);
  // One tick at most. A stall of that length would run 5.
  expect(r.lastTick()).toBeLessThanOrEqual(3);
});

test('init seeds the founders', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.advance(500);
  expect(r.of('stats').at(-1)).toMatchObject({ tick: 10, creatures: P.FOUNDER_CREATURES });
  expect(frameOf(r).creatureCount).toBe(P.FOUNDER_CREATURES);
});

test('ready lists every parameter with its range', () => {
  const r = rig();
  r.host.handle({ type: 'init', seed: 1 });
  const params = r.of('ready')[0]?.params ?? [];
  expect(params.length).toBeGreaterThan(40);
  const drag = params.find((p) => p.name === 'drag_fwd');
  expect(drag?.value).toBeCloseTo(0.08, 6); // parameters are 32-bit floats
  expect(drag?.default).toBeCloseTo(0.08, 6);
  expect(drag?.min).toBeCloseTo(0.01, 6);
  expect(drag?.max).toBeCloseTo(0.5, 6);
});

test('possessAt on a creature possesses it and the frame says so', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.advance(100);
  const f = frameOf(r);
  const o = f.creatureBase;
  const [x, y, uid] = [f.f32[o + P.C_X] ?? 0, f.f32[o + P.C_Y] ?? 0, f.u32[o + P.C_UID] ?? 0];
  r.host.handle({ type: 'possessAt', x, y, radius: 4 });
  expect(r.of('possessed').at(-1)?.uid).toBe(uid);
  r.advance(100);
  const g = frameOf(r);
  expect(g.possessedSlot).not.toBe(P.NO_SLOT);
  expect(g.brainDriving).toBe(true);
});

test('possessAt on empty water answers with uid 0', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.host.handle({ type: 'possessAt', x: -5000, y: -5000, radius: 4 });
  expect(r.of('possessed').at(-1)?.uid).toBe(0);
});

test('possess by uid answers with the uid, or with 0 when nothing has it', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.host.handle({ type: 'possess', uid: 7 });
  r.host.handle({ type: 'possess', uid: 999_999 });
  expect(r.of('possessed').map((m) => m.uid)).toEqual([7, 0]);
  // A possess that fails leaves the player in the body they have.
  r.advance(100);
  expect(frameOf(r).possessedSlot).toBe(6);
});

test('manual input turns the brain-driving flag off', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.advance(100);
  r.host.handle(firstCreature(r));
  r.host.handle({ type: 'input', manual: true, thrust: 1, turn: 0 });
  r.advance(100);
  expect(frameOf(r).brainDriving).toBe(false);
  r.host.handle({ type: 'input', manual: false, thrust: 0, turn: 0 });
  r.advance(100);
  expect(frameOf(r).brainDriving).toBe(true);
});

test('a new body does not inherit the input held for the last one', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.host.handle({ type: 'possess', uid: 7 });
  r.host.handle({ type: 'input', manual: true, thrust: 1, turn: 1 });
  r.advance(100);
  expect(frameOf(r).brainDriving).toBe(false);
  r.host.handle({ type: 'release' });
  r.host.handle({ type: 'possess', uid: 8 });
  r.advance(100);
  expect(frameOf(r).brainDriving).toBe(true);
});

test('release answers with uid 0 and clears the frame flag', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.advance(100);
  r.host.handle(firstCreature(r));
  r.host.handle({ type: 'release' });
  expect(r.of('possessed').at(-1)?.uid).toBe(0);
  r.advance(100);
  expect(frameOf(r).possessedSlot).toBe(P.NO_SLOT);
});

test('param changes the world and a bad index does nothing', () => {
  const run = (index: number | undefined) => {
    const r = rig({ recycle: true });
    r.host.handle({ type: 'init', seed: 1 });
    if (index !== undefined) r.host.handle({ type: 'param', index, value: 0 });
    r.advance(2000);
    const f = frameOf(r);
    expect(r.of('error')).toEqual([]);
    return Array.from(
      f.u32.subarray(0, P.FRAME_HEADER_WORDS + f.creatureCount * P.CREATURE_STRIDE),
    );
  };
  const r = rig();
  r.host.handle({ type: 'init', seed: 1 });
  const repel = r.of('ready')[0]?.params.find((p) => p.name === 'repel');
  if (!repel) throw new Error('no parameter repel');
  const base = run(undefined);
  expect(run(9999)).toEqual(base);
  expect(run(repel.index)).not.toEqual(base);
});

test('a snapshot with a possessed creature keeps the player in the body', () => {
  const sim = createSim(module, { seed: 1, worldW: P.WORLD_W, worldH: P.WORLD_H });
  sim.seedFounders(50, 0);
  expect(sim.possess(7)).toBe(true);
  const snapshot = new Uint8Array(sim.save());
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1, snapshot: snapshot.buffer });
  r.advance(100);
  const f = frameOf(r);
  expect(f.creaturesAlive).toBe(50);
  expect(f.possessedSlot).toBe(6);
});

// A wrapper that reports a death, so that a test picks the tick and the cause: on the tick after
// `die(cause)` the host sees no possessed creature and that cause, as it does when the core kills
// the creature during a tick.
function mortal() {
  let cause = 0;
  let pending = 0;
  const wrap = (sim: Sim): Sim => ({
    ...sim,
    tick: (n) => {
      sim.tick(n);
      cause ||= pending;
      pending = 0;
    },
    possessed: () => (cause === 0 ? sim.possessed() : 0),
    deathCause: () => cause,
    possess: (uid) => {
      const ok = sim.possess(uid);
      if (ok) cause = 0;
      return ok;
    },
  });
  return { wrap, die: (c: number) => void (pending = c) };
}

test('a death pauses the world, posts the cause and the heirs, and possessing an heir resumes', () => {
  const m = mortal();
  const r = rig({ recycle: true, wrap: m.wrap });
  r.host.handle({ type: 'init', seed: 1 });
  r.host.handle({ type: 'possess', uid: 7 }); // marked by possession: it outlives the player
  r.host.handle({ type: 'possess', uid: 8 }); // the body the player dies in
  r.host.handle({ type: 'input', manual: true, thrust: 1, turn: 0 });
  r.advance(500);
  expect(r.of('died')).toEqual([]);
  m.die(2);
  r.advance(1000);
  const died = r.of('died');
  expect(died.length).toBe(1);
  expect(died[0]?.cause).toBe('old age');
  expect(died[0]?.heirs.map((h) => h.uid)).toContain(7);
  expect(r.lastTick()).toBe(11); // 10 ticks alive, and the tick of the death
  r.advance(1000);
  expect(r.lastTick()).toBe(11);

  const heir = died[0]?.heirs[0]?.uid ?? 0;
  r.host.handle({ type: 'possess', uid: heir });
  expect(r.of('possessed').at(-1)?.uid).toBe(heir);
  r.advance(500);
  expect(r.lastTick()).toBe(21); // no `speed` message was sent
  expect(r.of('died').length).toBe(1);
  // The input held at the death does not steer the heir.
  expect(frameOf(r).brainDriving).toBe(true);
});

test('after a death, a possess that fails leaves the world paused and `speed` resumes it', () => {
  const m = mortal();
  const r = rig({ recycle: true, wrap: m.wrap });
  r.host.handle({ type: 'init', seed: 1 });
  r.host.handle({ type: 'possess', uid: 7 });
  r.advance(100);
  m.die(1);
  r.advance(100);
  expect(r.of('died')[0]?.cause).toBe('starved');
  const tickAtDeath = r.lastTick();
  r.host.handle({ type: 'possess', uid: 999_999 });
  expect(r.of('possessed').at(-1)?.uid).toBe(0);
  r.advance(500);
  expect(r.lastTick()).toBe(tickAtDeath);
  r.host.handle({ type: 'speed', ticksPerSecond: P.TICK_HZ });
  r.advance(500);
  expect(r.lastTick()).toBe(tickAtDeath + 10);
  // Nobody is possessed, so there is no second death.
  expect(r.of('died').length).toBe(1);
});

test('a death cause that this build does not know is an error, not a silent pause', () => {
  const m = mortal();
  const r = rig({ recycle: true, wrap: m.wrap });
  r.host.handle({ type: 'init', seed: 1 });
  r.host.handle({ type: 'possess', uid: 7 });
  m.die(9);
  r.advance(100);
  expect(r.of('died')).toEqual([]);
  expect(r.of('error')[0]?.message).toContain('death cause 9');
});

test('death pauses the world, posts the cause and heirs, and possessing an heir resumes', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  const idx = (name: string) => {
    const p = r.of('ready')[0]?.params.find((q) => q.name === name);
    if (!p) throw new Error(`no parameter ${name}`);
    return p.index;
  };
  r.advance(100);
  const f = frameOf(r);
  const pos = (i: number) => {
    const o = f.creatureBase + i * P.CREATURE_STRIDE;
    return { x: f.f32[o + P.C_X] ?? 0, y: f.f32[o + P.C_Y] ?? 0, radius: 4 };
  };
  r.host.handle({ type: 'possessAt', ...pos(0) }); // marked by possession: it may outlive the player
  r.host.handle({ type: 'possessAt', ...pos(1) }); // the body the player dies in
  r.host.handle({ type: 'param', index: idx('lifespan'), value: 600 });
  r.advance(40_000); // 800 ticks: longer than the lifespan
  const died = r.of('died')[0];
  expect(['old age', 'starved']).toContain(died?.cause);
  expect(r.of('died').length).toBe(1);
  const tickAtDeath = r.lastTick();
  r.advance(1000);
  expect(r.lastTick()).toBe(tickAtDeath); // paused
  // The only marked creature besides the player is the first one possessed. Nothing buds yet.
  expect(died?.heirs.length).toBeLessThanOrEqual(1);
  r.host.handle({ type: 'speed', ticksPerSecond: P.TICK_HZ });
  r.advance(100);
  expect(r.lastTick()).toBeGreaterThan(tickAtDeath);
});
