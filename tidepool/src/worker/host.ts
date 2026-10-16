// The worker's message handling and fixed-step tick loop. It has no globals: the clock, the timer,
// `postMessage`, and the sim factory arrive through `HostDeps`, so tests drive it with a fake clock.

import {
  FOUNDER_CREATURES,
  FOUNDER_PLANTS,
  FRAME_POOL,
  MAX_FRAME_BYTES,
  TICK_HZ,
  killerFrom,
  type DeathCause,
  type FromWorker,
  type Killer,
  type ToWorker,
} from '../protocol';
import type { Sim } from './wasm';

export interface HostDeps {
  now(): number; // milliseconds
  post(msg: FromWorker, transfer?: Transferable[]): void;
  every(ms: number, fn: () => void): () => void; // returns cancel
  /** Throws SimError. A world with no snapshot has the default size. */
  makeSim(opts: { seed: number; snapshot?: Uint8Array }): Sim;
}
export interface Host {
  handle(msg: ToWorker): void;
}

const STEP_MS = 10;
const MAX_TICKS_PER_STEP = 5;
const STATS_EVERY = 10; // ticks
// The seed of the benches in crates/headless/src/bench.rs and scripts/bench-wasm.mjs.
const BENCH_SEED = 1;
// Keys of `tp_stat`: the `STAT_` constants in crates/sim/src/stats.rs.
const STAT_CREATURES = 0;
const STAT_PLANTS = 1;
// The `CAUSE_` constants in crates/sim/src/control.rs. 0 is no death.
const CAUSES: Record<number, DeathCause> = {
  1: 'starved',
  2: 'old age',
  3: 'eaten',
  4: 'poisoned',
  5: 'spiked',
};
const NO_INPUT = { manual: false, thrust: 0, turn: 0, accept: false, abilities: 0 };

export function createHost(deps: HostDeps): Host {
  let sim: Sim | undefined;
  let stop = (): void => {};
  let view = { x0: 0, y0: 0, x1: 0, y1: 0 };
  // The page has no frame of the world and the view as they are now: the view changed, or a step
  // found the pool empty.
  let frameDue = false;
  let ticksPerSecond = TICK_HZ;
  // True from the death of the possessed creature until the next possess or `speed`.
  let pausedByDeath = false;
  // The latest `input` message. It belongs to one possession: a new body starts without it.
  let input = NO_INPUT;
  // The page asked for `brain` messages, and the last one had 0 words.
  let watching = false;
  let sentEmpty = false;
  let last = 0; // the time of the previous step
  let owed = 0; // milliseconds of world time that have not run yet
  // Since the last `stats` message.
  let tickMillis = 0;
  let timedTicks = 0;
  const pool: ArrayBuffer[] = [];

  // Every `error` message is final: the loop does not run after one.
  const fail = (e: unknown): void => {
    stop();
    deps.post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  };

  // Posts the brain of the possessed body. With no body possessed it posts 0 words, once.
  const postBrain = (sim: Sim): void => {
    if (!watching) return;
    const words = sim.brain(sim.possessed());
    if (words.length === 0) {
      if (sentEmpty) return;
      sentEmpty = true;
    } else sentEmpty = false;
    deps.post({ type: 'brain', words });
  };

  const write = (sim: Sim, rect: typeof view, buffer: ArrayBuffer): void => {
    if (sim.writeFrame(rect.x0, rect.y0, rect.x1, rect.y1, buffer) < 0) {
      throw new Error(
        `a frame of the view is larger than ${MAX_FRAME_BYTES} bytes. Fix: raise MAX_FRAME_BYTES in src/protocol.ts.`,
      );
    }
  };
  const sendFrame = (sim: Sim, buffer: ArrayBuffer): void => {
    frameDue = false;
    deps.post({ type: 'frame', buffer }, [buffer]);
    postBrain(sim);
  };

  // Writes the world as it is now for the view and posts it. False when the pool is empty: the
  // page holds every buffer.
  const postFrame = (sim: Sim): boolean => {
    const buffer = pool.pop();
    if (!buffer) return false;
    write(sim, view, buffer);
    sendFrame(sim, buffer);
    return true;
  };

  // The killer of the possessed body, as the core recorded it at the kill. Null with no killer.
  const killerOf = (sim: Sim): Killer | null => {
    const uid = sim.killer();
    return uid === 0 ? null : killerFrom(uid, sim.killerBody());
  };

  // `step` posts no frame while the world is paused, so `view` and `recycle` post the frame that is
  // due, with no tick. With an empty pool it stays due, and the next `recycle` posts it.
  const postDueWhilePaused = (sim: Sim): void => {
    if (frameDue && !(ticksPerSecond > 0)) postFrame(sim);
  };

  const step = (sim: Sim): void => {
    const now = deps.now();
    const elapsed = now - last;
    last = now;
    if (!(ticksPerSecond > 0)) {
      owed = 0;
      return;
    }
    owed += elapsed;
    const period = 1000 / ticksPerSecond;
    let ran = 0;
    let died: DeathCause | undefined;
    for (; owed >= period && ran < MAX_TICKS_PER_STEP; ran++) {
      owed -= period;
      const wasPossessed = sim.possessed() !== 0;
      sim.input(input.manual, input.thrust, input.turn, input.accept, input.abilities);
      const start = deps.now();
      sim.tick(1);
      tickMillis += deps.now() - start;
      timedTicks++;
      const code = wasPossessed && sim.possessed() === 0 ? sim.deathCause() : 0;
      if (code !== 0) {
        died = CAUSES[code];
        if (!died) {
          throw new Error(
            `the core reported death cause ${code}, and this build knows only ${Object.keys(CAUSES).join(', ')}. Fix: add it to CAUSES in src/worker/host.ts and to DeathCause in src/protocol.ts.`,
          );
        }
        // The world waits for the player to pick an heir.
        ticksPerSecond = 0;
        pausedByDeath = true;
        input = NO_INPUT;
        owed = 0;
      }
      const tick = sim.tickCount();
      if (tick % STATS_EVERY === 0) {
        deps.post({
          type: 'stats',
          tick,
          creatures: sim.stat(STAT_CREATURES),
          plants: sim.stat(STAT_PLANTS),
          tickMicros: (tickMillis * 1000) / timedTicks,
        });
        tickMillis = 0;
        timedTicks = 0;
      }
    }
    // A stall: the world runs late instead of running fast to catch up.
    if (owed >= period) owed = 0;
    if (ran === 0) return;
    const buffer = pool.pop();
    if (buffer) write(sim, view, buffer);
    if (died) {
      const killer = killerOf(sim);
      const killerBrain = killer ? sim.killerBrain() : new Uint32Array(0);
      deps.post({ type: 'died', cause: died, heirs: sim.heirs(), killer, killerBrain });
    }
    if (buffer) sendFrame(sim, buffer);
    else frameDue = true;
  };

  const init = (msg: Extract<ToWorker, { type: 'init' }>): void => {
    if (sim) throw new Error('got a second `init`. Fix: make a new worker for a new world.');
    const made = deps.makeSim(
      msg.snapshot
        ? { seed: msg.seed, snapshot: new Uint8Array(msg.snapshot) }
        : { seed: msg.seed },
    );
    const table = made.params();
    for (const { name, value } of msg.params ?? []) {
      const param = table.find((p) => p.name === name);
      if (!param) {
        made.free();
        throw new Error(
          `no parameter is named ${name}. Fix: use one of ${table.map((p) => p.name).join(', ')}.`,
        );
      }
      made.setParam(param.index, value);
    }
    // After the parameters: the fertility map and the founder genomes read them.
    if (!msg.snapshot) made.seedFounders(FOUNDER_CREATURES, FOUNDER_PLANTS);
    sim = made;
    view = { x0: 0, y0: 0, x1: made.worldW, y1: made.worldH };
    deps.post({
      type: 'ready',
      abi: made.abi,
      worldW: made.worldW,
      worldH: made.worldH,
      params: made.params(),
    });
    for (let i = 0; i < FRAME_POOL; i++) pool.push(new ArrayBuffer(MAX_FRAME_BYTES));
    last = deps.now();
    stop = deps.every(STEP_MS, () => {
      try {
        step(made);
      } catch (e) {
        fail(e);
      }
    });
  };

  // Posts `possessed` with the uid, or with 0 when no living creature has it. A failed possess
  // leaves the player where they were.
  const possess = (sim: Sim, uid: number): void => {
    const ok = uid !== 0 && sim.possess(uid);
    if (ok) {
      input = NO_INPUT;
      if (pausedByDeath) {
        pausedByDeath = false;
        ticksPerSecond = TICK_HZ;
      }
    }
    deps.post({ type: 'possessed', uid: ok ? uid : 0 });
  };

  // Times the reference world of docs/architecture.md section 2: a second default world, after
  // `settle` ticks that are not timed.
  const bench = (settle: number, ticks: number): void => {
    const world = deps.makeSim({ seed: BENCH_SEED });
    world.seedFounders(FOUNDER_CREATURES, FOUNDER_PLANTS);
    world.tick(settle);
    const start = deps.now();
    world.tick(ticks);
    const millis = deps.now() - start;
    deps.post({ type: 'benchResult', ticks, millis, creatures: world.stat(STAT_CREATURES) });
    world.free();
    // The time the bench took is not owed to the main world.
    last = deps.now();
  };

  return {
    handle(msg) {
      try {
        if (msg.type === 'init') return init(msg);
        if (!sim) {
          throw new Error(`got \`${msg.type}\` before \`init\`. Fix: send \`init\` first.`);
        }
        switch (msg.type) {
          case 'view':
            frameDue ||=
              msg.x0 !== view.x0 || msg.y0 !== view.y0 || msg.x1 !== view.x1 || msg.y1 !== view.y1;
            view = msg;
            postDueWhilePaused(sim);
            break;
          case 'speed':
            ticksPerSecond = msg.ticksPerSecond;
            pausedByDeath = false;
            break;
          case 'recycle':
            if (msg.buffer.byteLength === MAX_FRAME_BYTES) pool.push(msg.buffer);
            postDueWhilePaused(sim);
            break;
          case 'bench':
            bench(msg.settle, msg.ticks);
            break;
          case 'possessAt':
            possess(sim, sim.pick(msg.x, msg.y, msg.radius));
            break;
          case 'possess':
            possess(sim, msg.uid);
            break;
          case 'release':
            sim.release();
            input = NO_INPUT;
            deps.post({ type: 'possessed', uid: 0 });
            break;
          case 'input':
            input = {
              manual: msg.manual,
              thrust: msg.thrust,
              turn: msg.turn,
              accept: msg.accept,
              abilities: msg.abilities ?? 0,
            };
            break;
          case 'param':
            sim.setParam(msg.index, msg.value);
            break;
          case 'watchBrain':
            watching = msg.on;
            sentEmpty = false;
            // A paused world posts no frame, so the page gets the brain now.
            postBrain(sim);
            break;
          case 'brainOf':
            deps.post({ type: 'brainOf', uid: msg.uid, words: sim.brain(msg.uid) });
            break;
        }
      } catch (e) {
        fail(e);
      }
    },
  };
}
