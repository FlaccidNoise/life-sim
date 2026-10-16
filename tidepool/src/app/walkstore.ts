// What the walkthrough keeps between visits, in `localStorage`. Every call is in a `try`: with
// storage blocked or full, the walk lives in memory for this visit and the game plays the same.

import { BEATS, firstBite, type BeatId, type Walk } from './walkthrough';

const KEY = 'tidepool.walk';

/**
 * The playtest log: seconds since the page loaded, at the first showing of a beat and when done.
 * `firstBite` is beat 11: see `firstBite` in src/app/walkthrough.ts.
 */
export type Log = Partial<Record<BeatId, { shown?: number; done?: number }>> & {
  firstBite?: ReturnType<typeof firstBite>;
};

export interface Stored {
  done: BeatId[];
  shown: Partial<Record<BeatId, number>>;
  log: Log;
  buds: number; // buds of the bodies that the player was in, in every visit: `showsCard`
}

const empty = (): Stored => ({ done: [], shown: {}, log: {}, buds: 0 });

const fields = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

// What is stored is text that anything could have written: this keeps only what it knows.
function read(text: string | null): Stored {
  const stored = empty();
  const raw = fields(JSON.parse(text ?? 'null'));
  if (typeof raw.buds === 'number' && raw.buds > 0) stored.buds = Math.floor(raw.buds);
  const [done, shown, log] = [raw.done, fields(raw.shown), fields(raw.log)];
  for (const id of BEATS) {
    if (Array.isArray(done) && done.includes(id)) stored.done.push(id);
    const count = shown[id];
    if (typeof count === 'number') stored.shown[id] = count;
    const times: { shown?: number; done?: number } = {};
    const entry = fields(log[id]);
    if (typeof entry.shown === 'number') times.shown = entry.shown;
    if (typeof entry.done === 'number') times.done = entry.done;
    if (id in log && Object.keys(times).length > 0) stored.log[id] = times;
  }
  const bite = log.firstBite;
  if (typeof bite === 'number' || bite === 'bitten first' || bite === 'no hunter seen') {
    stored.log.firstBite = bite;
  }
  return stored;
}

/** The stored walk, or an empty one. `reset` clears the store first: `?walk=reset`, for a test. */
export function loadWalk(reset: boolean): Stored {
  try {
    if (reset) localStorage.removeItem(KEY);
    return read(localStorage.getItem(KEY));
  } catch {
    return empty();
  }
}

export function saveWalk(stored: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // No storage: the walk lives in memory.
  }
}

/**
 * `log` with the time `seconds` on each beat that `after` showed for the first time or finished, and
 * `before` had not, and with `firstBite` of `after` when it differs from that of `before`. A first
 * bite already in the log stays. The same `log` when there is nothing new.
 */
export function note(log: Log, before: Walk, after: Walk, seconds: number): Log {
  let out = log;
  for (const id of BEATS) {
    const shown = !before.shown[id] && !!after.shown[id] && log[id]?.shown === undefined;
    const done =
      !before.done.includes(id) && after.done.includes(id) && log[id]?.done === undefined;
    if (shown || done) {
      out = {
        ...out,
        [id]: { ...out[id], ...(shown && { shown: seconds }), ...(done && { done: seconds }) },
      };
    }
  }
  const bite = firstBite(after);
  const kept = out.firstBite !== undefined && out.firstBite !== 'no hunter seen';
  if (bite !== firstBite(before) && !kept) {
    out = { ...out, firstBite: bite };
    if (bite === undefined) delete out.firstBite;
  }
  return out;
}
