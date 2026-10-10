// Measures one cell (variant, N, profile) and prints one JSON line. rust/src/main.rs does the same natively.
// usage: tsx ts/cell.ts <ts|wasm-simd|wasm-nosimd> <N> <S|L> <bench|profile>

import { readFileSync } from 'node:fs';
import { Sim, type Profile } from './kernel';

const SEED = 0x9e3779b9;
const WARM = 200;
const TICKS = 1000;
const REPS = 5;

interface Kernel {
  init(): void;
  run(ticks: number): void;
  phase(p: number): void;
  counter(k: number): number;
  stat(k: number): number;
  hash(): number;
}

interface WasmExports {
  sim_new(n: number, profile: number, seed: number): number;
  sim_free(p: number): void;
  sim_run(p: number, ticks: number): void;
  sim_phase(p: number, phase: number): void;
  sim_counter(p: number, k: number): number;
  sim_stat(p: number, k: number): number;
  sim_hash(p: number): number;
}

function tsKernel(n: number, profile: Profile): Kernel {
  let sim = new Sim(n, profile, SEED);
  return {
    init: () => {
      sim = new Sim(n, profile, SEED);
    },
    run: (ticks) => sim.run(ticks),
    phase: (p) => sim.phase(p),
    counter: (k) => sim.counter(k),
    stat: (k) => sim.stat(k),
    hash: () => sim.stateHash(),
  };
}

async function wasmKernel(file: string, n: number, profile: Profile): Promise<Kernel> {
  const url = new URL(`../build/${file}`, import.meta.url);
  const { instance } = await WebAssembly.instantiate(readFileSync(url), {});
  const w = instance.exports as unknown as WasmExports;
  const prof = profile === 'L' ? 1 : 0;
  let p = w.sim_new(n, prof, SEED);
  return {
    init: () => {
      w.sim_free(p);
      p = w.sim_new(n, prof, SEED);
    },
    run: (ticks) => w.sim_run(p, ticks),
    phase: (ph) => w.sim_phase(p, ph),
    counter: (k) => w.sim_counter(p, k),
    stat: (k) => w.sim_stat(p, k),
    hash: () => w.sim_hash(p) >>> 0,
  };
}

const [variant, nArg, profileArg, mode] = process.argv.slice(2);
if (!variant || !nArg || (profileArg !== 'S' && profileArg !== 'L') || !mode) {
  console.error('usage: tsx ts/cell.ts <ts|wasm-simd|wasm-nosimd> <N> <S|L> <bench|profile>');
  process.exit(2);
}
const n = Number(nArg);
const k =
  variant === 'ts'
    ? tsKernel(n, profileArg)
    : await wasmKernel(
        variant === 'wasm-simd' ? 'kernel_simd.wasm' : 'kernel_nosimd.wasm',
        n,
        profileArg,
      );

const hash = k.hash();
k.run(1);
const tick0 = [k.counter(0), k.counter(1), k.counter(2)];

const tps: number[] = [];
const phaseUs: number[][] = [[], [], [], [], [], []];
for (let rep = 0; rep < REPS; rep++) {
  k.init();
  k.run(WARM);
  const t0 = performance.now();
  if (mode === 'profile') {
    const acc = [0, 0, 0, 0, 0, 0];
    for (let t = 0; t < TICKS; t++) {
      for (let p = 0; p < 6; p++) {
        const s = performance.now();
        k.phase(p);
        acc[p] += performance.now() - s;
      }
    }
    for (let p = 0; p < 6; p++) phaseUs[p].push((acc[p] * 1000) / TICKS);
  } else {
    k.run(TICKS);
  }
  tps.push((TICKS * 1000) / (performance.now() - t0));
}

console.log(
  JSON.stringify({
    variant,
    n,
    profile: profileArg,
    mode,
    hash,
    tick0,
    total: [k.counter(0), k.counter(1), k.counter(2)],
    tps,
    phaseUs,
    stats: [0, 1, 2, 3, 4, 5].map((s) => k.stat(s)),
  }),
);
