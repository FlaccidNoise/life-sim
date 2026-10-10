// The throughput gate. It times `tp_tick` of the built `.wasm` in Node, which is what the floor in
// docs/architecture.md section 2 names. Flags, defaults, and output follow the native bench in
// crates/headless/src/bench.rs. Exit 0 on PASS, 1 on FAIL or a void run, 2 on a usage error.

import { readFileSync } from 'node:fs';

const USAGE =
  'usage: node scripts/bench-wasm.mjs [--creatures <u32>] [--plants <u32>] [--world <W>x<H>] [--ticks <u32>] [--warmup <u32>] [--runs <u32>] [--floor <n>]';
// Ticks between two population samples. The sample is outside the timed section.
const CHUNK = 100;
// A run whose mean alive count is below this share of `--creatures` is void.
const MIN_ALIVE_SHARE = 0.8;
// Key of `tp_stat` in crates/sim/src/abi.rs.
const STAT_CREATURES = 0;

function usage(problem) {
  console.error(`error: ${problem}\n${USAGE}`);
  process.exit(2);
}

function u32(flag, v) {
  if (!/^\d+$/.test(v ?? '') || Number(v) > 0xffffffff) usage(`${flag} needs a valid value`);
  return Number(v);
}

function float(flag, v) {
  const n = /\S/.test(v ?? '') ? Number(v) : NaN;
  if (Number.isNaN(n)) usage(`${flag} needs a valid value`);
  return n;
}

let [creatures, plants, ticks, warmup, runs, floor] = [1500, 3000, 2000, 200, 5, 2400];
let [w, h] = [3072, 1536];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  const [flag, v] = [args[i], args[i + 1]];
  if (flag === '--creatures') creatures = u32(flag, v);
  else if (flag === '--plants') plants = u32(flag, v);
  else if (flag === '--ticks') ticks = u32(flag, v);
  else if (flag === '--warmup') warmup = u32(flag, v);
  else if (flag === '--runs') runs = u32(flag, v);
  else if (flag === '--floor') floor = float(flag, v);
  else if (flag === '--world') {
    const sides = (v ?? '').split('x');
    if (sides.length !== 2) usage(`${flag} needs a valid value`);
    [w, h] = sides.map((s) => float(flag, s));
  } else usage(`unknown flag ${flag}`);
}
if (creatures === 0 || ticks === 0 || runs === 0) {
  usage('--creatures, --ticks, and --runs need a value above 0');
}

let bytes;
try {
  bytes = readFileSync(new URL('../src/wasm/tidepool_sim.wasm', import.meta.url));
} catch (e) {
  console.error(
    `error: cannot read src/wasm/tidepool_sim.wasm (${e.code}). Fix: run \`make wasm\``,
  );
  process.exit(2);
}
const x = new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports;

const tps = [];
const aliveMeans = [];
for (let run = 1; run <= runs; run++) {
  const world = x.tp_new(1, w, h);
  if (world === 0) {
    const reason = new Uint8Array(x.memory.buffer, x.tp_error_ptr(), x.tp_error_len());
    usage(new TextDecoder().decode(reason));
  }
  x.tp_seed_founders(world, creatures, plants);
  x.tp_tick(world, warmup);
  let [timedMillis, aliveSum, chunks] = [0, 0, 0];
  for (let left = ticks; left > 0;) {
    const n = Math.min(left, CHUNK);
    const start = performance.now();
    x.tp_tick(world, n);
    timedMillis += performance.now() - start;
    left -= n;
    aliveSum += x.tp_stat(world, STAT_CREATURES);
    chunks++;
  }
  x.tp_free(world);
  const alive = aliveSum / chunks;
  const runTps = (ticks / timedMillis) * 1000;
  console.log(`run ${run} creatures=${alive.toFixed(0)} tps=${runTps.toFixed(0)}`);
  if (alive < MIN_ALIVE_SHARE * creatures) {
    console.log('VOID: population fell');
    process.exit(1);
  }
  tps.push(runTps);
  aliveMeans.push(alive);
}

tps.sort((a, b) => a - b);
const mid = tps.length >> 1;
const median = tps.length % 2 === 1 ? tps[mid] : (tps[mid - 1] + tps[mid]) / 2;
const alive = aliveMeans.reduce((a, b) => a + b, 0) / aliveMeans.length;
const pass = median >= floor;
console.log(
  `bench-wasm creatures=${alive.toFixed(0)} median_tps=${median.toFixed(0)} floor=${floor.toFixed(0)} ${pass ? 'PASS' : 'FAIL'}`,
);
process.exit(pass ? 0 : 1);
