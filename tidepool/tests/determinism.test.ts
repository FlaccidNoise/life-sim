import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { createSim } from '../src/worker/wasm';

const module = new WebAssembly.Module(
  readFileSync(new URL('../src/wasm/tidepool_sim.wasm', import.meta.url)),
);
const headless = fileURLToPath(new URL('../target/release/tidepool-headless', import.meta.url));

function nativeHash(seed: number, ticks: number, creatures: number): number {
  const out = execFileSync(headless, [
    'run',
    '--seed',
    String(seed),
    '--ticks',
    String(ticks),
    '--creatures',
    String(creatures),
    '--plants',
    '0',
  ]).toString();
  const m = /hash=([0-9a-f]{8})/.exec(out);
  if (!m?.[1]) throw new Error(`no hash in headless output: ${out}. Fix: run \`make headless\`.`);
  return parseInt(m[1], 16);
}

test.each([1, 2, 3])('WASM and native agree after 2,000 ticks (seed %i)', (seed) => {
  const sim = createSim(module, { seed, worldW: 1536, worldH: 1024 });
  sim.seedFounders(500, 0);
  sim.tick(2000);
  expect(sim.hash()).toBe(nativeHash(seed, 2000, 500));
});
