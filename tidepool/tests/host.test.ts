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

// A corner of the world that holds some of the founders and not all of them.
const CORNER = { type: 'view', x0: 0, y0: 0, x1: 400, y1: 300 } as const;
const WHOLE = { type: 'view', x0: 0, y0: 0, x1: P.WORLD_W, y1: P.WORLD_H } as const;

test('a new view while paused by `speed` posts one frame of it, with no tick', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.host.handle(CORNER);
  r.advance(100);
  const before = { tick: r.lastTick(), creatures: frameOf(r).creatureCount };
  expect(before.creatures).toBeGreaterThan(0);
  expect(before.creatures).toBeLessThan(P.FOUNDER_CREATURES);
  r.host.handle({ type: 'speed', ticksPerSecond: 0 });
  const frames = r.of('frame').length;

  r.host.handle(WHOLE);
  expect(r.of('frame').length).toBe(frames + 1);
  expect(frameOf(r).creatureCount).toBe(P.FOUNDER_CREATURES);
  expect(r.lastTick()).toBe(before.tick);
  // The pause holds, and the frame is not posted twice.
  r.advance(1000);
  expect(r.of('frame').length).toBe(frames + 1);
});

test('a new view while paused by a death posts one frame of it, with no tick', () => {
  const m = mortal();
  const r = rig({ recycle: true, wrap: m.wrap });
  r.host.handle({ type: 'init', seed: 1 });
  r.host.handle(CORNER);
  r.host.handle({ type: 'possess', uid: 7 });
  m.die(1);
  r.advance(1000);
  expect(r.of('died').length).toBe(1);
  const before = { tick: r.lastTick(), creatures: frameOf(r).creatureCount };
  expect(before.creatures).toBeLessThan(P.FOUNDER_CREATURES);
  const frames = r.of('frame').length;

  r.host.handle(WHOLE);
  expect(r.of('frame').length).toBe(frames + 1);
  expect(frameOf(r).creatureCount).toBe(P.FOUNDER_CREATURES);
  expect(r.lastTick()).toBe(before.tick);
  r.advance(1000);
  expect(r.of('frame').length).toBe(frames + 1);
  expect(r.of('died').length).toBe(1);
});

test('a view equal to the stored one posts nothing while paused', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.host.handle(CORNER);
  r.advance(100);
  r.host.handle({ type: 'speed', ticksPerSecond: 0 });
  const frames = r.of('frame').length;
  r.host.handle({ ...CORNER });
  r.advance(1000);
  expect(r.of('frame').length).toBe(frames);
});

test('a new view while paused waits for a buffer and then shows the latest view', () => {
  const r = rig(); // no buffer comes back
  r.host.handle({ type: 'init', seed: 1 });
  r.advance(1000);
  expect(r.of('frame').length).toBe(P.FRAME_POOL);
  r.host.handle({ type: 'speed', ticksPerSecond: 0 });

  r.host.handle({ type: 'view', x0: 0, y0: 0, x1: 1, y1: 1 }); // a step of a camera that slides
  r.host.handle(CORNER);
  r.advance(1000);
  expect(r.of('frame').length).toBe(P.FRAME_POOL);
  expect(r.of('error')).toEqual([]);

  const back = r.of('frame')[0];
  if (!back) throw new Error('no frame to hand back');
  r.host.handle({ type: 'recycle', buffer: back.buffer });
  expect(r.of('frame').length).toBe(P.FRAME_POOL + 1);
  const shown = frameOf(r);
  expect(shown.creatureCount).toBeGreaterThan(0);
  expect(shown.creatureCount).toBeLessThan(P.FOUNDER_CREATURES);
  expect(shown.tick).toBe(r.of('stats').at(-1)?.tick); // the world as it is, 20 ticks in
  // A second buffer has no frame to carry.
  const next = r.of('frame')[1];
  if (!next) throw new Error('no second frame to hand back');
  r.host.handle({ type: 'recycle', buffer: next.buffer });
  expect(r.of('frame').length).toBe(P.FRAME_POOL + 1);
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
  // Too few ticks for a founder to feed up to a bud or to starve, so the count is the founders. A
  // founder starts at half of its capacity, buds at 0.8, and its mouth takes about 1% per tick.
  r.host.handle({ type: 'bench', settle: 0, ticks: 10 });
  const b = r.of('benchResult')[0];
  expect(b?.ticks).toBe(10);
  expect(b?.creatures).toBe(P.FOUNDER_CREATURES);
  expect(r.of('frame').length).toBe(0);
});

test('a bench runs its settle ticks first and does not time them', () => {
  // Each tick of a world costs 1 ms of the fake clock. `ended` is the tick of the bench world when
  // the host frees it.
  let ended = -1;
  const r = rig({
    wrap: (sim) => ({
      ...sim,
      tick: (n) => {
        r.jump(n);
        sim.tick(n);
      },
      free: () => {
        ended = sim.tickCount();
        sim.free();
      },
    }),
  });
  r.host.handle({ type: 'init', seed: 1 });
  r.host.handle({ type: 'bench', settle: 30, ticks: 10 });
  expect(ended).toBe(40);
  expect(r.of('benchResult')[0]).toMatchObject({ ticks: 10, millis: 10 });
});

test('the time a bench takes is not owed to the main world', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.advance(100);
  expect(r.lastTick()).toBe(2);
  r.drift(5000);
  r.host.handle({ type: 'bench', settle: 0, ticks: 200 });
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

test('init sets the parameters it names before it seeds the founders', () => {
  const r = rig();
  r.host.handle({ type: 'init', seed: 1, params: [{ name: 'repel', value: 0.7 }] });
  expect(r.of('error')).toEqual([]);
  const repel = r.of('ready')[0]?.params.find((p) => p.name === 'repel');
  expect(repel?.value).toBeCloseTo(0.7, 6);

  // A parameter that only the founders read: it took effect, so it was set before they were made.
  const eyed = rig({ recycle: true });
  eyed.host.handle({ type: 'init', seed: 1, params: [{ name: 'founder_eye', value: 0.2 }] });
  eyed.advance(100);
  const f = frameOf(eyed);
  expect(P.unpackPart(f.u32[f.creatureBase + P.C_PARTS + 4] ?? 0)?.kind).toBe(P.KIND_EYE);
});

test('init with a parameter name that is not in the table is an error and no world', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1, params: [{ name: 'nope', value: 1 }] });
  expect(r.of('ready')).toEqual([]);
  const errors = r.of('error');
  expect(errors.length).toBe(1);
  expect(errors[0]?.message).toContain('nope');
  expect(errors[0]?.message).toContain('drag_fwd'); // it lists the valid names
  r.advance(100);
  expect(r.of('frame')).toEqual([]);
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

test('a death by the rules of the core pauses the world, and `speed` resumes it', () => {
  const r = rig({ recycle: true });
  // A founder dies at the age of its `old` gene, which is the `lifespan` at its founding.
  r.host.handle({ type: 'init', seed: 1, params: [{ name: 'lifespan', value: 1200 }] });
  r.advance(100);
  const f = frameOf(r);
  const pos = (i: number) => {
    const o = f.creatureBase + i * P.CREATURE_STRIDE;
    return { x: f.f32[o + P.C_X] ?? 0, y: f.f32[o + P.C_Y] ?? 0, radius: 4 };
  };
  r.host.handle({ type: 'possessAt', ...pos(0) }); // marked by possession: it may outlive the player
  r.host.handle({ type: 'possessAt', ...pos(1) }); // the body the player dies in
  r.advance(65_000); // 1,300 ticks: longer than the lifespan
  const died = r.of('died')[0];
  expect(['old age', 'starved']).toContain(died?.cause);
  expect(r.of('died').length).toBe(1);
  const tickAtDeath = r.lastTick();
  r.advance(1000);
  expect(r.lastTick()).toBe(tickAtDeath); // paused
  // The marked creatures besides the player: the first one possessed, and the children of the two.
  expect(died?.heirs.length).toBeLessThanOrEqual(5);
  r.host.handle({ type: 'speed', ticksPerSecond: P.TICK_HZ });
  r.advance(100);
  expect(r.lastTick()).toBeGreaterThan(tickAtDeath);
});

// The rules decide this test, not the path of one seed. Every founder buds on its first tick, lives
// 1,200 ticks, and pays no upkeep. So the body buds marked children at once, nothing starves, and the
// body dies of old age while children that are younger than it are alive.
test('picking an heir resumes the world in that body', () => {
  const r = rig({ recycle: true });
  const params = [
    { name: 'bud_at', value: 0.2 },
    { name: 'bud_cooldown', value: 0 },
    { name: 'lifespan', value: 1200 },
    ...['basal', 'neuron_upkeep', 'conn_upkeep', 'move_cost'].map((name) => ({
      name,
      value: 0,
    })),
  ];
  r.host.handle({ type: 'init', seed: 1, params });
  r.host.handle({ type: 'possess', uid: 88 });
  // A founder is younger than half a lifespan when the world starts.
  r.advance(29_000); // 580 ticks
  expect(r.of('died')).toEqual([]);

  r.advance(33_000); // 1,240 ticks in all: longer than the lifespan
  const died = r.of('died');
  expect(died.length).toBe(1);
  expect(died[0]?.cause).toBe('old age');
  const tickAtDeath = r.lastTick();

  const heirs = died[0]?.heirs ?? [];
  expect(heirs.length).toBeGreaterThanOrEqual(1);
  expect(heirs.length).toBeLessThanOrEqual(5);
  const energy = heirs.map((h) => h.energy01);
  expect(energy).toEqual([...energy].sort((a, b) => b - a));

  const heir = heirs[0]?.uid ?? 0;
  r.host.handle({ type: 'possess', uid: heir });
  expect(r.of('possessed').at(-1)?.uid).toBe(heir);
  r.advance(500);
  expect(r.lastTick()).toBeGreaterThan(tickAtDeath); // no `speed` message was sent
});

test('a body that already has a child leaves that child among its heirs', () => {
  const m = mortal();
  const r = rig({ recycle: true, wrap: m.wrap });
  r.host.handle({ type: 'init', seed: 1, params: [{ name: 'bud_at', value: 0.2 }] });
  r.advance(1000); // 20 ticks
  const f = frameOf(r);
  // A body that budded a short time ago has a child (the frame flags a bud for 40 ticks), and
  // nobody is marked yet.
  const parent = Array.from({ length: f.creaturesAlive }, (_, i) => {
    const o = f.creatureBase + i * P.CREATURE_STRIDE;
    return { uid: f.u32[o + P.C_UID] ?? 0, flags: f.u32[o + P.C_FLAGS] ?? 0 };
  }).find((c) => (c.flags & P.FLAG_BUDDED) !== 0);
  expect(parent).toBeDefined();
  r.host.handle({ type: 'possess', uid: parent?.uid ?? 0 });
  m.die(1);
  r.advance(100);
  const heirs = r.of('died')[0]?.heirs ?? [];
  expect(heirs.some((h) => h.uid !== parent?.uid)).toBe(true);
});

// The default world of seed 1 after 1,500 ticks holds founders with grandchildren. A founder has
// generation 0 and one of the first uids, so an heir of generation 2 or more is at least its
// grandchild. The core finds a founder whose whole line fits the list of heirs. Then the page
// possesses that founder, and the heirs that the page gets at its death hold the grandchild.
test('a body that already has a grandchild leaves that grandchild among its heirs', () => {
  const size = { worldW: P.WORLD_W, worldH: P.WORLD_H };
  const core = createSim(module, { seed: 1, ...size });
  core.seedFounders(P.FOUNDER_CREATURES, P.FOUNDER_PLANTS);
  core.tick(1500);
  const snapshot = new Uint8Array(core.save());
  core.free();
  // The line of a founder, as the core marks it in a copy of the world: the founder and its
  // living descendants. An empty list for a founder that is dead.
  const lineOf = (uid: number) => {
    const copy = createSim(module, { seed: 1, ...size, snapshot });
    const line = copy.possess(uid) ? copy.heirs() : [];
    copy.free();
    return line;
  };
  const founders = Array.from({ length: P.FOUNDER_CREATURES }, (_, i) => i + 1);
  const founder = founders.find((uid) => {
    const line = lineOf(uid);
    // Under 5 heirs: the list is not cut, so no later tick can push the grandchild out of it.
    return line.length < 5 && line.some((h) => h.generation >= 2);
  });
  expect(founder, 'no founder has a grandchild among its heirs').toBeDefined();

  const m = mortal();
  const r = rig({ recycle: true, wrap: m.wrap });
  r.host.handle({ type: 'init', seed: 1, snapshot: snapshot.buffer });
  r.host.handle({ type: 'possess', uid: founder ?? 0 });
  m.die(1);
  r.advance(100);
  const heirs = r.of('died')[0]?.heirs ?? [];
  expect(heirs.some((h) => h.generation === 1)).toBe(true);
  expect(heirs.some((h) => h.generation >= 2)).toBe(true);
});

// With bud_at at its floor, no cooldown, and an egg small enough for a founder at half of its
// energy to pay for, a founder buds on its first tick. The frame then counts the buds of the
// possessed body and the marked bodies alive, the body itself among them.
test('a possessed body that buds shows buds and a lineage in the frame', () => {
  const r = rig({ recycle: true });
  const params = [
    { name: 'bud_at', value: 0.2 },
    { name: 'bud_cooldown', value: 0 },
    { name: 'birth_growth', value: 0.4 },
  ];
  r.host.handle({ type: 'init', seed: 1, params });
  r.host.handle({ type: 'possess', uid: 88 });
  r.advance(1000); // 20 ticks
  const f = frameOf(r);
  expect(f.buds).toBeGreaterThan(0);
  expect(f.lineageAlive).toBeGreaterThanOrEqual(2);
});

// The brain of a possessed founder: 11 inputs, 4 hidden neurons, 2 outputs, and 57 connections. The
// first input is the constant one.
test('the brain of the possessed body reaches the page, and a release sends 0 words once', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.host.handle({ type: 'watchBrain', on: true });
  r.host.handle({ type: 'possess', uid: 88 });
  r.advance(200);
  const sent = r.of('brain');
  const brain = P.readBrain(sent.at(-1)?.words ?? new Uint32Array(0));
  if (!brain) throw new Error('no brain was sent for the possessed body');
  expect([brain.uid, brain.neurons.length, brain.connections.length]).toEqual([88, 17, 57]);
  expect(brain.neurons.filter((n) => n.kind === P.KIND_HIDDEN).map((n) => n.gene)).toEqual([
    0, 1, 2, 3,
  ]);
  expect(brain.neurons[0]).toMatchObject({ owner: 0, port: 0, activation: 1 });
  // One message with each frame.
  expect(sent.filter((m) => m.words.length > 0).length).toBe(r.of('frame').length);

  const before = sent.length;
  r.host.handle({ type: 'release' });
  r.advance(200);
  const after = r.of('brain').slice(before);
  expect(after.map((m) => m.words.length)).toEqual([0]);
  expect(P.readBrain(after[0]?.words ?? new Uint32Array(1))).toBeNull();
});

test('no brain message comes with watchBrain off', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.host.handle({ type: 'possess', uid: 88 });
  r.advance(100);
  r.host.handle({ type: 'watchBrain', on: true });
  r.advance(100);
  const seen = r.of('brain').length;
  expect(seen).toBeGreaterThan(0);
  r.host.handle({ type: 'watchBrain', on: false });
  r.advance(100);
  expect(r.of('brain').length).toBe(seen);
});
