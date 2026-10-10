// Page wiring: the worker, the renderer, the camera, and the overlay.

import { h, render } from 'preact';
import { TICK_HZ, viewFrame, type FrameView, type FromWorker, type ToWorker } from '../protocol';
import { createRenderer, type Renderer } from '../render/renderer';
import { App } from '../ui/App';
import { benchText, errorText, ready, stats } from '../ui/state';
import { clampToWorld, fitWorld, pan, viewRect, zoomAt, type Camera } from './camera';

const TICK_MS = 1000 / TICK_HZ;
const BENCH_TICKS = 2000;
const SKIP_TICKS = 24000; // the time-skip target, docs/architecture.md section 2
const DRAG_SLOP = 4; // CSS pixels. A press that moves less than this is a click.
const WHEEL_ZOOM = 0.0015; // the zoom exponent per wheel pixel
const PINCH_WHEEL_ZOOM = 0.01; // a trackpad pinch is a wheel event with ctrlKey and small steps

interface PointerHandlers {
  /** The pointers moved their centre by this many CSS pixels. */
  drag(dx: number, dy: number): void;
  /** A wheel step, or a pinch, about a screen point. */
  zoom(sx: number, sy: number, factor: number): void;
  /** A press that ended and did not drag. */
  click(sx: number, sy: number): void;
}

/**
 * All pointer and wheel input on the canvas. It turns the events into gestures and knows nothing
 * of the camera. Positions are CSS pixels of the window: the canvas fills it.
 */
function bindPointer(canvas: HTMLCanvasElement, on: PointerHandlers): void {
  const down = new Map<number, { x: number; y: number }>();
  let pressed = { x: 0, y: 0 };
  let dragged = false;
  // The centre of the pointers that are down, and their mean distance from it.
  const gesture = (): { x: number; y: number; spread: number } => {
    let x = 0;
    let y = 0;
    for (const p of down.values()) {
      x += p.x / down.size;
      y += p.y / down.size;
    }
    let spread = 0;
    for (const p of down.values()) spread += Math.hypot(p.x - x, p.y - y) / down.size;
    return { x, y, spread };
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (down.size === 0) pressed = { x: e.clientX, y: e.clientY };
    dragged = down.size > 0;
    down.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!down.has(e.pointerId)) return;
    // The button came up outside the window, so no `pointerup` arrived.
    if (e.buttons === 0) {
      down.delete(e.pointerId);
      return;
    }
    const before = gesture();
    down.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const after = gesture();
    dragged ||= Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > DRAG_SLOP;
    on.drag(after.x - before.x, after.y - before.y);
    if (before.spread > 0) on.zoom(after.x, after.y, after.spread / before.spread);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (down.delete(e.pointerId) && down.size === 0 && !dragged) on.click(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointercancel', (e) => down.delete(e.pointerId));
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault(); // the browser does not zoom the page
      on.zoom(
        e.clientX,
        e.clientY,
        Math.exp(-e.deltaY * (e.ctrlKey ? PINCH_WHEEL_ZOOM : WHEEL_ZOOM)),
      );
    },
    { passive: false },
  );
}

function start(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#view');
  const ui = document.querySelector<HTMLElement>('#ui');
  if (!canvas || !ui) throw new Error('index.html has no #view or no #ui');

  const query = new URLSearchParams(location.search);
  render(h(App, { debug: query.has('debug') }), ui);

  let world: { w: number; h: number } | undefined;
  let cam: Camera = { x: 0, y: 0, scale: 1 };
  let cssW = 1;
  let cssH = 1;
  if (import.meta.env.DEV) {
    const handle = {
      stats,
      errorText,
      get camera(): Camera {
        return cam;
      },
    };
    Object.assign(window, { __tidepool: handle });
  }

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

  const inWorld = (c: Camera): Camera =>
    world ? clampToWorld(c, world.w, world.h, cssW, cssH) : c;
  const layout = (): void => {
    cssW = canvas.clientWidth;
    cssH = canvas.clientHeight;
    renderer.resize(cssW, cssH, devicePixelRatio);
    cam = inWorld(cam);
  };

  // Watch: the player moves the camera. Task 18 adds Play, where the camera follows the body.
  const mode = 'watch' as 'watch' | 'play';
  bindPointer(canvas, {
    drag(dx, dy) {
      if (mode === 'watch') cam = inWorld(pan(cam, dx, dy));
    },
    zoom(sx, sy, factor) {
      if (mode === 'watch') cam = inWorld(zoomAt(cam, cssW, cssH, sx, sy, factor));
    },
    click() {
      // Task 18: possess the creature under the click.
    },
  });

  let prev: FrameView | null = null;
  let cur: FrameView | null = null;
  let arrival = 0;

  worker.onerror = (e) => fail(e.message || 'The simulation worker did not load.');
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data;
    switch (msg.type) {
      case 'ready':
        world = { w: msg.worldW, h: msg.worldH };
        // The whole world, or as much of it as the scale limits allow, about the screen centre.
        cam = inWorld(
          zoomAt(fitWorld(world.w, world.h, cssW, cssH), cssW, cssH, cssW / 2, cssH / 2, 1),
        );
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
  let sent = { x0: NaN, y0: NaN, x1: NaN, y1: NaN }; // the view the worker has
  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame);
    const view = viewRect(cam, cssW, cssH);
    if (
      world &&
      (view.x0 !== sent.x0 || view.y0 !== sent.y0 || view.x1 !== sent.x1 || view.y1 !== sent.y1)
    ) {
      sent = view;
      send({ type: 'view', ...view });
    }
    if (cur) {
      const alpha = Math.min(Math.max((now - arrival) / TICK_MS, 0), 1);
      renderer.draw(prev, cur, alpha, cam, now / 1000);
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
