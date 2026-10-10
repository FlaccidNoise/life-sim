// The worker entry. Glue only: the behavior is in host.ts.

import { WORLD_H, WORLD_W, type FromWorker, type ToWorker } from '../protocol';
import wasmUrl from '../wasm/tidepool_sim.wasm?url';
import { createHost } from './host';
import { createSim } from './wasm';

declare const self: DedicatedWorkerGlobalScope;

const post = (msg: FromWorker, transfer: Transferable[] = []): void =>
  self.postMessage(msg, transfer);

const host = WebAssembly.compileStreaming(fetch(wasmUrl)).then((module) =>
  createHost({
    now: () => performance.now(),
    post,
    every: (ms, fn) => {
      const id = setInterval(fn, ms);
      return () => clearInterval(id);
    },
    makeSim: (opts) => createSim(module, { worldW: WORLD_W, worldH: WORLD_H, ...opts }),
  }),
);

// Set before the module is ready: a message that arrives during the compile waits on `host` and is
// not lost. A top-level `await` here would leave that message with no listener.
self.onmessage = (e: MessageEvent<ToWorker>) => {
  host.then(
    (h) => h.handle(e.data),
    (err: unknown) =>
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) }),
  );
};
