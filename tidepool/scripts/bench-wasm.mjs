// The throughput gate. It times `tp_tick` of the built `.wasm` in Node, which is what the floor in
// docs/architecture.md section 2 names. It settles the default world once, then times each run from
// a snapshot of it. Flags, defaults, and output follow the native bench in
// crates/headless/src/bench.rs. Exit 0 on PASS, 1 on FAIL or a void run, 2 on a usage error.

import { readFileSync } from 'node:fs';

const USAGE =
  'usage: node scripts/bench-wasm.mjs [--seed <u32>] [--creatures <u32>] [--plants <u32>] [--world <W>x<H>] [--settle <u32>] [--ticks <u32>] [--runs <u32>] [--reference <u32>] [--floor <n>] [--param <name>=<value>]...';
// Ticks between two population samples. The sample is outside the timed section.
const CHUNK = 100;
// A run whose mean alive count is below this share of `--reference` is void.
const MIN_ALIVE_SHARE = 0.8;
// Keys of `tp_stat`: the `STAT_` constants in crates/sim/src/stats.rs.
const STAT_CREATURES = 0;
const STAT_PLANTS = 1;

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

// The default world, as in crates/headless/src/main.rs.
let [creatures, plants] = [400, 1200];
let [w, h] = [1536, 1024];
let seed = 1;
let [settle, ticks, runs, reference, floor] = [12000, 2000, 5, 1500, 2400];
// Each `--param`, as it was written. The module that knows the names is not loaded yet.
const paramArgs = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  const [flag, v] = [args[i], args[i + 1]];
  if (flag === '--seed') seed = u32(flag, v);
  else if (flag === '--creatures') creatures = u32(flag, v);
  else if (flag === '--plants') plants = u32(flag, v);
  else if (flag === '--settle') settle = u32(flag, v);
  else if (flag === '--ticks') ticks = u32(flag, v);
  else if (flag === '--runs') runs = u32(flag, v);
  else if (flag === '--reference') reference = u32(flag, v);
  else if (flag === '--floor') floor = float(flag, v);
  else if (flag === '--param') paramArgs.push(v ?? '');
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

// A new view of `memory.buffer` on each call: a call that grows memory detaches every older view.
const wasmBytes = (ptr, len) => new Uint8Array(x.memory.buffer, ptr >>> 0, len >>> 0);
const lastError = () => new TextDecoder().decode(wasmBytes(x.tp_error_ptr(), x.tp_error_len()));

// One `--param name=value`: the parameter's index and the value. An unknown name or a value outside
// the parameter's range is a usage error.
const paramNames = Array.from({ length: x.tp_param_count() >>> 0 }, (_, i) =>
  new TextDecoder().decode(wasmBytes(x.tp_param_name_ptr(i), x.tp_param_name_len(i))),
);
const params = paramArgs.map((arg) => {
  const [name, number, ...rest] = arg.split('=');
  if (number === undefined || rest.length > 0) {
    usage('--param needs <name>=<value>, like drag_fwd=0.1');
  }
  const i = paramNames.indexOf(name);
  if (i < 0) usage(`unknown parameter ${name}. Valid names: ${paramNames.join(', ')}`);
  const value = float('--param', number);
  const [min, max] = [x.tp_param_min(i), x.tp_param_max(i)];
  if (!(value >= min && value <= max)) {
    // The table holds 32-bit floats. 7 digits print one as it was written.
    const [lo, hi] = [min, max].map((v) => Number(v.toPrecision(7)));
    usage(`--param ${name}=${number} is outside the range ${lo} to ${hi}`);
  }
  return [i, value];
});

const settled = x.tp_new(seed, w, h);
if (settled === 0) usage(lastError());
// Before the founders: the fertility map and the founder genomes read the parameters.
for (const [i, value] of params) x.tp_param_set(settled, i, value);
x.tp_seed_founders(settled, creatures, plants);
x.tp_tick(settled, settle);
console.log(
  `settled tick=${x.tp_tick_count(settled) >>> 0} creatures=${x.tp_stat(settled, STAT_CREATURES)} plants=${x.tp_stat(settled, STAT_PLANTS)}`,
);
// A copy: the core's buffer is valid only until the next `tp_save` or `tp_free`.
const snapshotLen = x.tp_save(settled) >>> 0;
const snapshot = wasmBytes(x.tp_save_ptr(settled), snapshotLen).slice();
x.tp_free(settled);

const tps = [];
const aliveMeans = [];
for (let run = 1; run <= runs; run++) {
  const ptr = x.tp_alloc(snapshotLen) >>> 0;
  if (ptr === 0) {
    console.error(`error: the core has no memory for a snapshot of ${snapshotLen} bytes`);
    process.exit(2);
  }
  wasmBytes(ptr, snapshotLen).set(snapshot);
  const world = x.tp_load(ptr, snapshotLen);
  x.tp_dealloc(ptr, snapshotLen);
  if (world === 0) {
    console.error(`error: ${lastError()}`);
    process.exit(2);
  }
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
  if (alive < MIN_ALIVE_SHARE * reference) {
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
// The cost of one body for one tick: it reads whether the code got slower in a world that holds fewer
// bodies (choice C9 of the M4 plan).
const nsPerCreatureTick = Math.round(1e9 / (median * alive));
console.log(
  `bench-wasm creatures=${alive.toFixed(0)} median_tps=${median.toFixed(0)} ns_per_creature_tick=${nsPerCreatureTick} floor=${floor.toFixed(0)} ${pass ? 'PASS' : 'FAIL'}`,
);
process.exit(pass ? 0 : 1);
