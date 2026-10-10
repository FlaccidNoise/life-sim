// Page wiring: the worker, the renderer, the camera, and the overlay.

import { h, render } from 'preact';
import { TICK_HZ, viewFrame, type FrameView, type FromWorker, type ToWorker } from '../protocol';
import { createRenderer, type Renderer } from '../render/renderer';
import { App } from '../ui/App';
import { benchText, errorText, ready, stats } from '../ui/state';
import { fitWorld, viewRect, type Camera } from './camera';

const TICK_MS = 1000 / TICK_HZ;
const BENCH_TICKS = 2000;
const SKIP_TICKS = 24000; // the time-skip target, docs/architecture.md section 2

function start(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#view');
  const ui = document.querySelector<HTMLElement>('#ui');
  if (!canvas || !ui) throw new Error('index.html has no #view or no #ui');

  const query = new URLSearchParams(location.search);
  render(h(App, { debug: query.has('debug') }), ui);
  if (import.meta.env.DEV) Object.assign(window, { __tidepool: { stats, errorText } });

  let stop = (): void => {};
  // The first error stays on screen. Nothing runs after it.
  const fail = (message: string): void => {
    if (errorText.peek() !== null) return;
    errorText.value = message;
    stop();
  };

  let renderer: Renderer;
  try {
    renderer = createRenderer(canvas);
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
    return;
  }
  canvas.addEventListener('webglcontextlost', () =>
    fail('The browser took the graphics context away.'),
  );

  const worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), {
    type: 'module',
  });
  const send = (msg: ToWorker, transfer: Transferable[] = []): void =>
    worker.postMessage(msg, transfer);

  let world: { w: number; h: number } | undefined;
  let cam: Camera = { x: 0, y: 0, scale: 1 };
  const layout = (): void => {
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    renderer.resize(cssW, cssH, devicePixelRatio);
    if (!world) return;
    cam = fitWorld(world.w, world.h, cssW, cssH);
    send({ type: 'view', ...viewRect(cam, cssW, cssH) });
  };

  let prev: FrameView | null = null;
  let cur: FrameView | null = null;
  let arrival = 0;

  worker.onerror = (e) => fail(e.message || 'The simulation worker did not load.');
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data;
    switch (msg.type) {
      case 'ready':
        world = { w: msg.worldW, h: msg.worldH };
        layout();
        ready.value = true;
        if (query.has('bench')) send({ type: 'bench', ticks: BENCH_TICKS });
        break;
      case 'frame':
        // The buffer goes back whole: the worker drops a buffer of another length.
        if (prev) send({ type: 'recycle', buffer: prev.buffer }, [prev.buffer]);
        prev = cur;
        cur = viewFrame(msg.buffer);
        arrival = performance.now();
        break;
      case 'stats':
        stats.value = {
          tick: msg.tick,
          creatures: msg.creatures,
          plants: msg.plants,
          tickMicros: msg.tickMicros,
          fps: stats.peek().fps,
        };
        break;
      case 'benchResult': {
        const perSecond = (msg.ticks / msg.millis) * 1000;
        benchText.value =
          `${Math.round(perSecond).toLocaleString('en-US')} ticks per second. ` +
          `A ${SKIP_TICKS.toLocaleString('en-US')}-tick skip would take ` +
          `${(SKIP_TICKS / perSecond).toFixed(1)} seconds on this device.`;
        break;
      }
      case 'error':
        fail(msg.message);
        break;
    }
  };
  send({ type: 'init', seed: 1 });

  layout();
  window.addEventListener('resize', layout);
  document.addEventListener('visibilitychange', () =>
    send({ type: 'speed', ticksPerSecond: document.hidden ? 0 : TICK_HZ }),
  );

  let raf = 0;
  stop = () => {
    worker.terminate();
    cancelAnimationFrame(raf);
  };
  let drawn = 0;
  let countedFrom = performance.now();
  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame);
    if (cur) {
      renderer.draw(prev, cur, Math.min(Math.max((now - arrival) / TICK_MS, 0), 1), cam);
    }
    drawn++;
    if (now - countedFrom >= 1000) {
      stats.value = { ...stats.peek(), fps: Math.round((drawn * 1000) / (now - countedFrom)) };
      drawn = 0;
      countedFrom = now;
    }
  };
  raf = requestAnimationFrame(frame);
}

start();
