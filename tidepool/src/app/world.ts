// The baked world, pre-evolved to tick 36,000. It sits in the page's own folder (`public/`), so a
// relative address loads it from any sub-path.
export const BAKED_WORLD = 'm2-world.tdpl';

// The snapshot file that the query names, or null for a founder start. `?world=<url>` loads another
// snapshot. `?founders` starts from founders, for development.
export const worldFile = (query: URLSearchParams): string | null =>
  query.has('founders') ? null : (query.get('world') ?? BAKED_WORLD);

// The error panel's text for a world file that did not load. A reason from the worker can carry its
// own fix.
export const noWorld = (url: string, reason: string): string =>
  `The world file ${url} did not load: ${reason}` +
  (reason.includes('Fix:')
    ? ''
    : '. Fix: put the address of a Tidepool snapshot after `?world=`, or add `?founders` to start without one.');
