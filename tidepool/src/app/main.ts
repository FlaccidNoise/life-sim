// Page wiring: the worker, the renderer, the camera, and the overlay.

import { h, render } from 'preact';
import {
  BENCH_SETTLE_TICKS,
  C_ENERGY,
  C_SLOT,
  CREATURE_STRIDE,
  TICK_HZ,
  readBrain,
  viewFrame,
  type BrainView,
  type FrameView,
  type FromWorker,
  type Heir,
  type Kin,
  type ParamInfo,
  type ToWorker,
} from '../protocol';
import { lookOf } from '../render/parts';
import { createRenderer, type Renderer } from '../render/renderer';
import { App } from '../ui/App';
import { BUD } from '../ui/words/lines';
import {
  benchText,
  brain,
  brainDriving,
  brainError,
  brainOpen,
  budOpen,
  changesShown,
  death,
  errorText,
  focusHeir,
  heirGone,
  hint,
  lastBud,
  lineageAlive,
  mode,
  pulse,
  ready,
  starving,
  stats,
  steer,
  toast,
  buds,
  walkLine,
  walkLog,
  wiringChanged,
} from '../ui/state';
import {
  PLAY_SCALE,
  SCALE_MAX,
  SCALE_MIN,
  clampToWorld,
  fitWorld,
  follow,
  isFitted,
  pan,
  screenToWorld,
  viewRect,
  zoomAt,
  type Camera,
} from './camera';
import {
  emptyAnswer,
  inputToSend,
  keyOf,
  manualNow,
  possessedBody,
  steerFromKeys,
  steerToward,
  type Body,
  type Keys,
  type Steer,
} from './input';
import { bodyIn, childOf, differences } from './kin';
import { loadWalk, note, saveWalk } from './walkstore';
import { begin, split, step, wiringChanges, type Facts, type Walk } from './walkthrough';

const TICK_MS = 1000 / TICK_HZ;
const BENCH_TICKS = 2000;
// 80% of the reference population, docs/architecture.md section 2. Below it a bench reads too fast.
const BENCH_MIN_CREATURES = 1200;
const SKIP_TICKS = 24000; // the time-skip target, docs/architecture.md section 2
const DRAG_SLOP = 4; // CSS pixels. A press that moves less than this is a click.
const WHEEL_ZOOM = 0.0015; // the zoom exponent per wheel pixel
const PINCH_WHEEL_ZOOM = 0.01; // a trackpad pinch is a wheel event with ctrlKey and small steps
const PICK_RADIUS = 24; // CSS pixels around a click in which a creature is picked
const HINT_MS = 1500;
const TOAST_MS = 3000;
const BUD_MS = 6000; // the bud card
const STARVING_BELOW = 0.25; // of a full store
const LATENCY_SAMPLES = 20;
// Seconds. A tab that was hidden gives one long frame, and that is no time of play.
const WALK_DT_MAX = 0.1;

interface PointerHandlers {
  /** The pointers moved their centre by this many CSS pixels. */
  drag(dx: number, dy: number): void;
  /** A wheel step, or a pinch, about a screen point. */
  zoom(sx: number, sy: number, factor: number): void;
  /** A press that ended and did not drag. */
  click(sx: number, sy: number): void;
  /** The centre of the pointers that are down, or null when none is. */
  hold(at: { x: number; y: number } | null): void;
}

const inText = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

function median(values: number[]): number | null {
  const s = [...values].sort((a, b) => a - b);
  const a = s[(s.length - 1) >> 1];
  const b = s[s.length >> 1];
  return a === undefined || b === undefined ? null : (a + b) / 2;
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
  const hold = (): void => on.hold(down.size > 0 ? gesture() : null);

  canvas.addEventListener('pointerdown', (e) => {
    if (down.size === 0) pressed = { x: e.clientX, y: e.clientY };
    dragged = down.size > 0;
    down.set(e.pointerId, { x: e.clientX, y: e.clientY });
    hold();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!down.has(e.pointerId)) return;
    // The button came up outside the window, so no `pointerup` arrived.
    if (e.buttons === 0) {
      down.delete(e.pointerId);
      hold();
      return;
    }
    const before = gesture();
    down.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const after = gesture();
    dragged ||= Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > DRAG_SLOP;
    on.drag(after.x - before.x, after.y - before.y);
    if (before.spread > 0) on.zoom(after.x, after.y, after.spread / before.spread);
    on.hold(after);
  });
  canvas.addEventListener('pointerup', (e) => {
    const was = down.delete(e.pointerId);
    hold();
    if (was && down.size === 0 && !dragged) on.click(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointercancel', (e) => {
    down.delete(e.pointerId);
    hold();
  });
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

// The error panel's text for a world file that did not load. A reason from the worker can carry its
// own fix.
const noWorld = (url: string, reason: string): string =>
  `The world file ${url} did not load: ${reason}` +
  (reason.includes('Fix:') ? '' : '. Fix: put the address of a Tidepool snapshot after `?world=`.');

// The energy of the creature in `slot`, or null when the frame does not hold it.
function energyOf(frame: FrameView, slot: number): number | null {
  for (let i = 0; i < frame.creatureCount; i++) {
    const r = frame.creatureBase + i * CREATURE_STRIDE;
    if (frame.u32[r + C_SLOT] === slot) return frame.f32[r + C_ENERGY] ?? 0;
  }
  return null;
}

function start(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#view');
  const ui = document.querySelector<HTMLElement>('#ui');
  if (!canvas || !ui) throw new Error('index.html has no #view or no #ui');

  const query = new URLSearchParams(location.search);
  // The overlay's actions. They run after `send`, `resume`, and `leave` exist.
  const closeDeath = (): void => {
    death.value = null;
    focusHeir.value = null;
    heirGone.value = false;
  };
  render(
    h(App, {
      debug: query.has('debug'),
      touch: matchMedia('(pointer: coarse)').matches,
      onLeave() {
        leave();
      },
      onBrain() {
        toggleBrain();
      },
      onPick(uid) {
        const heir = death.peek()?.heirs.find((x) => x.uid === uid);
        if (heir) seenAt = { x: heir.x, y: heir.y };
        heirPick = true;
        send({ type: 'possess', uid });
      },
      onWatch() {
        closeDeath();
        resume();
      },
      onFocus(heir: Heir | null) {
        focusHeir.value = heir;
      },
    }),
    ui,
  );

  let world: { w: number; h: number } | undefined;
  let cam: Camera = { x: 0, y: 0, scale: 1 };
  let cssW = 1;
  let cssH = 1;
  let params: ParamInfo[] = [];
  let possessedUid = 0;
  let body: Body | null = null; // the possessed creature as drawn, when the frame holds it
  let prev: FrameView | null = null;
  let cur: FrameView | null = null;
  const latencies: number[] = []; // milliseconds from a press to the first frame drawn with it
  // The walkthrough. `?walk=reset` starts it from nothing, for a test.
  const stored = loadWalk(query.get('walk') === 'reset');
  let walk: Walk = begin(stored.done, stored.shown);
  walkLog.value = stored.log;
  // Where the body was on the last frame, and the body lengths it has moved in this possession:
  // `hands` under the player's input, `alone` since the brain last took over.
  let path = { uid: 0, x: 0, y: 0, hands: 0, alone: 0 };
  const firstBrains = new Map<number, BrainView>(); // by uid: the first readout of each body
  // A bud of the possessed body while the worker reads the two brains: the `brainOf` answers so far.
  interface Budding {
    parent: Kin;
    child: Kin;
    brood: number;
    words: Map<number, Uint32Array>; // by uid
  }
  let budding: Budding | null = null;
  if (import.meta.env.DEV) {
    const handle = {
      stats,
      errorText,
      lastBud,
      get camera(): Camera {
        return cam;
      },
      get mode(): 'watch' | 'play' {
        return mode.peek();
      },
      get brainDriving(): boolean {
        return brainDriving.peek();
      },
      get possessedUid(): number {
        return possessedUid;
      },
      get body(): Body | null {
        return body;
      },
      get frame(): FrameView | null {
        return cur;
      },
      get death(): ReturnType<typeof death.peek> {
        return death.peek();
      },
      get inputLatencyMs(): number | null {
        return median(latencies);
      },
      get walk(): Walk {
        return walk;
      },
      setParam(name: string, value: number): void {
        const param = params.find((p) => p.name === name);
        if (!param) {
          throw new Error(
            `no parameter is named ${name}. Fix: use one of ${params.map((p) => p.name).join(', ')}.`,
          );
        }
        send({ type: 'param', index: param.index, value });
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

  // In `?debug`, each `p=<name>=<value>` of the query string sets a parameter before the founders
  // are seeded. The worker rejects a name that is not in the table.
  const initParams: { name: string; value: number }[] = [];
  for (const p of query.has('debug') ? query.getAll('p') : []) {
    const [name = '', number = '', ...rest] = p.split('=');
    const value = /\S/.test(number) ? Number(number) : NaN;
    if (name === '' || rest.length > 0 || Number.isNaN(value)) {
      fail(
        `The address has \`p=${p}\`. Fix: write it as \`p=<name>=<number>\`, like p=bud_at=0.3.`,
      );
      return;
    }
    initParams.push({ name, value });
  }

  let renderer: Renderer;
  try {
    // `?look=1`, `2`, `3`, or `4` draws the bodies one of four other ways, for the owner to pick from.
    renderer = createRenderer(canvas, lookOf(query.get('look')));
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
  // A resize fits the world again while the player watches through the fitted camera. A camera
  // that the player zoomed or panned keeps its place, and in Play the camera follows the body.
  const layout = (): void => {
    const fitted = world && mode.peek() === 'watch' && isFitted(cam, world.w, world.h, cssW, cssH);
    cssW = canvas.clientWidth;
    cssH = canvas.clientHeight;
    renderer.resize(cssW, cssH, devicePixelRatio);
    cam = world && fitted ? fitWorld(world.w, world.h, cssW, cssH) : inWorld(cam);
  };

  // Watch: the player moves the camera. Play: the camera follows the body, and the keys and a held
  // pointer steer it.
  const keys: Keys = { up: false, left: false, right: false };
  let held: { x: number; y: number } | null = null; // the pointer that is down, in CSS pixels
  let playScale = PLAY_SCALE; // the scale the camera goes to in Play. The wheel moves it.
  // Where the camera goes in Play while no frame holds the body: the point of the pick, then the
  // place where the body was last seen.
  let seenAt = { x: 0, y: 0 };
  let picking = false; // a `possessAt` has no answer yet
  let heirPick = false; // a `possess` that the death overlay sent has no answer yet
  let posted: Steer | null = null; // the last `input` posted in this possession
  let lastActive = -Infinity; // the time of the last frame with a key or a pointer down
  let pressedAt: number | null = null; // a press that took over from the brain, not yet drawn

  // The worker dropped its held input: it does so on every possess, on release, and on death.
  const forget = (): void => {
    posted = null;
    lastActive = -Infinity;
    pressedAt = null;
  };
  const watch = (): void => {
    mode.value = 'watch';
    possessedUid = 0;
    hint.value = null;
    toast.value = null;
    starving.value = false;
    dropBud();
    forget();
  };
  // The card of a bud belongs to the body that budded. It leaves when the player leaves the body.
  const dropBud = (): void => {
    budding = null;
    budOpen.value = false;
  };
  // The worker has answered for both bodies of a bud. A readout of 0 words is of a body that died
  // after the frame of the bud, and one that does not fit its header is not read: the card then
  // shows what the two frame records differ in, and says that the brain could not be read.
  const showBud = (bud: Budding, mine: Uint32Array, its: Uint32Array): void => {
    let brains: [BrainView, BrainView] | null = null;
    try {
      const [a, b] = [readBrain(mine), readBrain(its)];
      if (a && b) brains = [a, b];
    } catch {
      // Not read. The card says so.
    }
    lastBud.value = {
      parent: bud.parent,
      child: bud.child,
      brood: bud.brood,
      lines: differences(bud.parent, bud.child, brains),
      brainRead: brains !== null,
      childDied: its.length === 0,
    };
    budOpen.value = true;
    clearTimeout(budTimer);
    budTimer = setTimeout(() => (budOpen.value = false), BUD_MS);
  };
  // The Escape key and the Leave button.
  const leave = (): void => {
    if (mode.peek() !== 'play') return;
    send({ type: 'release' });
    watch();
  };
  // The key B, the Brain button, and the close button of the panel. The worker sends the brain of
  // the possessed body while the panel is open. It takes no message before `init`.
  const toggleBrain = (): void => {
    if (!ready.peek() || errorText.peek() !== null) return;
    brainOpen.value = !brainOpen.peek();
    send({ type: 'watchBrain', on: brainOpen.peek() });
  };
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let budTimer: ReturnType<typeof setTimeout> | undefined;
  let lastBuds = 0;
  const flash = (text: string, ms: number): void => {
    hint.value = text;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => (hint.value = null), ms);
  };
  // A key or a pointer went down. A press that ends before the next frame still takes over. A press
  // while the brain drives starts a latency sample, and the frame loop ends it.
  const pressed = (): void => {
    if (mode.peek() !== 'play') return;
    lastActive = performance.now();
    if (brainDriving.peek()) pressedAt ??= lastActive;
  };
  const dropKeys = (): void => {
    keys.up = keys.left = keys.right = false;
  };

  bindPointer(canvas, {
    drag(dx, dy) {
      if (mode.peek() === 'watch') cam = inWorld(pan(cam, dx, dy));
    },
    zoom(sx, sy, factor) {
      if (mode.peek() === 'watch') cam = inWorld(zoomAt(cam, cssW, cssH, sx, sy, factor));
      else playScale = Math.min(Math.max(playScale * factor, SCALE_MIN), SCALE_MAX);
    },
    click(sx, sy) {
      if (mode.peek() !== 'watch' || death.peek() || !world) return;
      const at = screenToWorld(cam, cssW, cssH, sx, sy);
      picking = true;
      seenAt = at;
      send({ type: 'possessAt', x: at.x, y: at.y, radius: PICK_RADIUS / cam.scale });
    },
    hold(at) {
      if (at && !held) pressed();
      held = at;
    },
  });
  window.addEventListener('keydown', (e) => {
    // A shortcut is not steering, and macOS sends no `keyup` for a key pressed with Command.
    if (inText(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    // The overlay owns the keyboard: Tab and Enter work its buttons, and nothing steers behind it.
    if (death.peek()) return;
    if (e.code === 'Escape') leave();
    if (e.key.toLowerCase() === 'b' && !e.repeat) toggleBrain();
    const key = keyOf(e.code);
    if (!key) return;
    pressed();
    keys[key] = true;
  });
  window.addEventListener('keyup', (e) => {
    const key = keyOf(e.code);
    if (key) keys[key] = false;
  });
  window.addEventListener('blur', dropKeys);

  let arrival = 0;

  worker.onerror = (e) => fail(e.message || 'The simulation worker did not load.');
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data;
    switch (msg.type) {
      case 'ready':
        world = { w: msg.worldW, h: msg.worldH };
        params = msg.params;
        // The energy ring shows where a bud happens.
        for (const p of params) if (p.name === 'bud_at') renderer.setBudAt(p.value);
        cam = fitWorld(world.w, world.h, cssW, cssH);
        ready.value = true;
        if (query.has('bench')) {
          benchText.value = 'Measuring. This can take a minute on a slow device.';
          send({ type: 'bench', settle: BENCH_SETTLE_TICKS, ticks: BENCH_TICKS });
        }
        break;
      case 'frame': {
        const next = viewFrame(msg.buffer);
        // A paused world posts a frame of the tick it stopped on when the view changes. That frame
        // replaces `cur`, and the bodies keep their places between the last two ticks.
        const sameTick = next.tick === cur?.tick;
        const old = sameTick ? cur : prev;
        if (!sameTick) {
          prev = cur;
          arrival = performance.now();
        }
        // The buffer goes back whole: the worker drops a buffer of another length.
        if (old) send({ type: 'recycle', buffer: old.buffer }, [old.buffer]);
        cur = next;
        brainDriving.value = cur.brainDriving;
        lineageAlive.value = cur.lineageAlive;
        buds.value = cur.buds;
        if (cur.buds > lastBuds && mode.peek() === 'play') {
          // `prev` is the frame before this one. A brood is born on one tick.
          const parent = bodyIn(cur, cur.possessedSlot);
          const child = prev && childOf(prev, cur, cur.possessedSlot);
          if (parent && child) {
            budding = { parent, child, brood: cur.buds - lastBuds, words: new Map() };
            send({ type: 'brainOf', uid: parent.uid });
            send({ type: 'brainOf', uid: child.uid });
          } else {
            toast.value = BUD.noChild;
            clearTimeout(toastTimer);
            toastTimer = setTimeout(() => (toast.value = null), TOAST_MS);
          }
        }
        lastBuds = cur.buds;
        if (mode.peek() === 'play') {
          const energy = energyOf(cur, cur.possessedSlot);
          if (energy !== null) starving.value = energy < STARVING_BELOW;
        }
        break;
      }
      case 'possessed': {
        const empty = emptyAnswer(heirPick, picking);
        heirPick = false;
        picking = false;
        if (msg.uid !== 0) {
          possessedUid = msg.uid;
          forget();
          playScale = PLAY_SCALE;
          starving.value = false;
          toast.value = null;
          dropBud();
          mode.value = 'play';
          closeDeath();
        } else if (empty === 'heir gone') {
          heirGone.value = true;
        } else if (empty === 'nothing there') {
          flash('Nothing there.', HINT_MS);
        }
        break;
      }
      case 'died':
        // The worker paused the world. It stays paused until a `possess` or a `speed`.
        heirPick = false;
        watch();
        closeDeath();
        death.value = {
          cause: msg.cause,
          heirs: msg.heirs,
          first: !walk.done.includes('firstDeath'),
        };
        break;
      case 'brainOf': {
        // An answer for a bud that a later bud, or a new body, has replaced is dropped.
        if (!budding || (msg.uid !== budding.parent.uid && msg.uid !== budding.child.uid)) break;
        budding.words.set(msg.uid, msg.words);
        const mine = budding.words.get(budding.parent.uid);
        const its = budding.words.get(budding.child.uid);
        if (mine && its) {
          showBud(budding, mine, its);
          budding = null;
        }
        break;
      }
      case 'brain':
        // A readout that does not fit its header stays in the panel. The world runs on.
        try {
          const read = readBrain(msg.words);
          brain.value = read;
          brainError.value = null;
          if (read) {
            const first = firstBrains.get(read.uid) ?? read;
            firstBrains.set(read.uid, first);
            wiringChanged.value = wiringChanges(first, read);
          }
        } catch (e) {
          brainError.value = e instanceof Error ? e.message : String(e);
        }
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
        const creatures = msg.creatures.toLocaleString('en-US');
        benchText.value =
          `${Math.round(perSecond).toLocaleString('en-US')} ticks per second at ${creatures} creatures. ` +
          `A ${SKIP_TICKS.toLocaleString('en-US')}-tick skip would take ` +
          `${(SKIP_TICKS / perSecond).toFixed(1)} seconds on this device.` +
          (msg.creatures < BENCH_MIN_CREATURES
            ? ` The world held only ${creatures} creatures, so this reading is too fast.`
            : '');
        break;
      }
      case 'error':
        // Before `ready`, the error is of the load of the world file.
        fail(worldUrl !== null && !ready.peek() ? noWorld(worldUrl, msg.message) : msg.message);
        break;
    }
  };
  // `?world=<url>` starts from a snapshot file in place of the founders.
  const worldUrl = query.get('world');
  if (worldUrl === null) {
    send({ type: 'init', seed: 1, params: initParams });
  } else {
    fetch(worldUrl)
      .then(async (answer) => {
        if (!answer.ok) throw new Error(`the server answered ${answer.status}`);
        // A server of a one-page app answers an address it does not know with the page.
        if (answer.headers.get('content-type')?.startsWith('text/html')) {
          throw new Error('the server has no such file and answered with a web page');
        }
        const snapshot = await answer.arrayBuffer();
        send({ type: 'init', seed: 1, snapshot, params: initParams }, [snapshot]);
      })
      .catch((e: unknown) => fail(noWorld(worldUrl, e instanceof Error ? e.message : String(e))));
  }

  layout();
  window.addEventListener('resize', layout);
  // A `speed` message also ends the pause that follows the death of the possessed creature.
  const resume = (): void => send({ type: 'speed', ticksPerSecond: document.hidden ? 0 : TICK_HZ });
  document.addEventListener('visibilitychange', () => {
    dropKeys();
    // A `speed` message would end the pause of a death. The overlay's buttons end it.
    if (!death.peek()) resume();
  });

  // One frame of the walkthrough: the facts of this frame in, the line and the pulse out.
  const walkFrame = (frame: FrameView, now: number, dt: number): void => {
    const play = mode.peek() === 'play';
    const manual = play && posted?.manual === true;
    // A frame from before the possession holds another body, or none.
    const mine = play && body?.uid === possessedUid ? body : null;
    if (mine && path.uid === mine.uid && mine.length > 0) {
      const lengths = Math.hypot(mine.x - path.x, mine.y - path.y) / mine.length;
      path.hands += manual ? lengths : 0;
      path.alone = manual ? 0 : path.alone + lengths;
    } else if (mine) path = { ...path, uid: mine.uid, hands: 0, alone: 0 };
    if (mine) [path.x, path.y] = [mine.x, mine.y];
    const read = brain.peek();
    const facts: Facts = {
      mode: mode.peek(),
      manual,
      panelOpen: brainOpen.peek(),
      dead: death.peek() !== null,
      uid: mine?.uid ?? 0,
      energy01: (mine && energyOf(frame, frame.possessedSlot)) ?? 0,
      lengthsMoved: path.hands,
      lengthsAlone: path.alone,
      buds: mine ? frame.buds : 0,
      lineageAlive: frame.lineageAlive,
      // The readout is of this body, and fresh, only while the panel is open.
      split:
        manual && brainOpen.peek() && read?.uid === possessedUid ? split(read, steer.peek()) : 0,
      // The card of a bud is a line of the page too, from the frame of the bud on.
      busy: hint.peek() !== null || toast.peek() !== null || budding !== null || budOpen.peek(),
    };
    const out = step(walk, facts, Math.min(dt, WALK_DT_MAX));
    if (out.walk.done !== walk.done || out.walk.shown !== walk.shown) {
      walkLog.value = note(walkLog.peek(), walk, out.walk, Math.round(now / 100) / 10);
      saveWalk({ done: out.walk.done, shown: out.walk.shown, log: walkLog.peek() });
    }
    walk = out.walk;
    walkLine.value = out.line;
    pulse.value = out.pulse;
    changesShown.value = walk.done.includes('noChange');
  };

  let raf = 0;
  stop = () => {
    worker.terminate();
    cancelAnimationFrame(raf);
  };
  let drawn = 0;
  let countedFrom = performance.now();
  let sent = { x0: NaN, y0: NaN, x1: NaN, y1: NaN }; // the view the worker has
  let lastFrame = performance.now();
  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame);
    const dt = Math.max(now - lastFrame, 0) / 1000;
    lastFrame = now;
    const alpha = Math.min(Math.max((now - arrival) / TICK_MS, 0), 1);
    body = cur ? possessedBody(prev, cur, alpha) : null;
    const focus = focusHeir.peek();
    if (focus && death.peek()) cam = inWorld(follow(cam, focus.x, focus.y, cam.scale, dt));
    if (mode.peek() === 'play') {
      // Zoom about the body, then slide it to the centre. A plain `follow` zooms about the centre,
      // which throws a body near the edge off the screen and out of the next frames. While no
      // frame holds the body, the camera only slides.
      if (body) {
        const { scale } = follow(cam, body.x, body.y, playScale, dt);
        const sx = (body.x - cam.x) * cam.scale + cssW / 2;
        const sy = (body.y - cam.y) * cam.scale + cssH / 2;
        cam = zoomAt(cam, cssW, cssH, sx, sy, scale / cam.scale);
        seenAt = body;
      }
      cam = inWorld(follow(cam, seenAt.x, seenAt.y, cam.scale, dt));
      // Keys win over a held pointer.
      let { thrust, turn, active } = steerFromKeys(keys);
      if (!active && held && body) {
        const at = screenToWorld(cam, cssW, cssH, held.x, held.y);
        ({ thrust, turn } = steerToward(body.x, body.y, body.heading, body.length, at.x, at.y));
        active = true;
      }
      if (active) lastActive = now;
      const out = inputToSend(posted, {
        manual: active || manualNow(lastActive, now),
        thrust,
        turn,
      });
      if (out) {
        posted = out;
        steer.value = { thrust: out.thrust, turn: out.turn };
        send({ type: 'input', ...out });
      }
      // The first frame drawn in which the player's input moved the body.
      if (pressedAt !== null && cur && alpha > 0 && body && !cur.brainDriving) {
        latencies.push(performance.now() - pressedAt);
        if (latencies.length > LATENCY_SAMPLES) latencies.shift();
        pressedAt = null;
      }
    }
    const view = viewRect(cam, cssW, cssH);
    if (
      world &&
      (view.x0 !== sent.x0 || view.y0 !== sent.y0 || view.x1 !== sent.x1 || view.y1 !== sent.y1)
    ) {
      sent = view;
      send({ type: 'view', ...view });
    }
    if (cur) {
      renderer.draw(prev, cur, alpha, cam, now / 1000);
      walkFrame(cur, now, dt);
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
