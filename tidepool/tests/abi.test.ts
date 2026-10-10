import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const bytes = readFileSync(new URL('../src/wasm/tidepool_sim.wasm', import.meta.url));

test('the module loads with no imports and reports ABI 1', async () => {
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const version = instance.exports.tp_abi_version as () => number;
  expect(version()).toBe(1);
});
