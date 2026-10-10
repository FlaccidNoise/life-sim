import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import * as P from '../src/protocol';
import { createHost, type HostDeps } from '../src/worker/host';
import { createSim } from '../src/worker/wasm';

const module = new WebAssembly.Module(
  readFileSync(new URL('../src/wasm/tidepool_sim.wasm', import.meta.url)),
);

// The fake clock moves in 10 ms steps. With `recycle`, each posted frame buffer is handed back after
// the step that posted it, as the page does.
function rig(opts: { recycle?: boolean } = {}) {
  let now = 0;
  let timer: (() => void) | undefined;
  let recycled = 0;
  const sent: P.FromWorker[] = [];
  const deps: HostDeps = {
    now: () => now,
    post: (m) => void sent.push(m),
    every: (_ms, fn) => {
      timer = fn;
      return () => void (timer = undefined);
    },
    makeSim: (o) => createSim(module, { worldW: P.WORLD_W, worldH: P.WORLD_H, ...o }),
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
  const lastTick = () => {
    const f = of('frame').at(-1);
    return f ? P.viewFrame(f.buffer).tick : -1;
  };
  return { host, advance, jump, sent, of, lastTick };
}

test('init posts ready with the ABI version and world size', () => {
  const r = rig();
  r.host.handle({ type: 'init', seed: 1 });
  expect(r.of('ready')).toEqual([
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
  expect(b?.creatures).toBe(P.M0_DRIFTERS);
  expect(r.of('frame').length).toBe(0);
});
