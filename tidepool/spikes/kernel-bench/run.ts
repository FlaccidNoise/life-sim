// Runs benchmark cells strictly one at a time, each in a fresh process, and checks the fairness invariants.
// usage: tsx run.ts --out results/bench.json [--mode bench|profile] [--ns 2000,5000] [--profiles S,L]
//                   [--variants ts,wasm-simd,wasm-nosimd,native,native-par-4]

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Cell {
  variant: string;
  n: number;
  profile: string;
  mode: string;
  hash: number;
  tick0: number[];
  total: number[];
  tps: number[];
  phaseUs: number[][];
  stats: number[];
  load1?: number;
}

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};
const out = resolve(here, arg('out', 'results/bench.json'));
const mode = arg('mode', 'bench');
const ns = arg('ns', '2000,5000,10000,20000').split(',').map(Number);
const profiles = arg('profiles', 'S,L').split(',');
const variants = arg('variants', 'ts,wasm-simd,wasm-nosimd,native').split(',');

function runCell(variant: string, n: number, profile: string): Cell {
  const rest = [String(n), profile, mode];
  const par = /^native-par-(\d+)$/.exec(variant);
  const [cmd, args] =
    variant === 'native'
      ? [resolve(here, 'build/kernel_native'), rest]
      : par
        ? [resolve(here, 'build/kernel_native_par'), [...rest, par[1]]]
        : [process.execPath, [...process.execArgv, resolve(here, 'ts/cell.ts'), variant, ...rest]];
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(
      `${variant} N=${n} ${profile} exited ${r.status}: ${r.stderr}\nFix: run ./build.sh first.`,
    );
  }
  return { ...(JSON.parse(r.stdout) as Cell), load1: loadavg()[0] };
}

const median = (v: number[]): number => [...v].sort((a, b) => a - b)[v.length >> 1];
const cells: Cell[] = [];
for (const profile of profiles) {
  for (const n of ns) {
    const group = variants.map((v) => {
      const c = runCell(v, n, profile);
      console.error(
        `${v.padEnd(12)} N=${String(n).padEnd(6)} ${profile} ${median(c.tps).toFixed(1).padStart(9)} ticks/s` +
          `  (min ${Math.min(...c.tps).toFixed(1)}, max ${Math.max(...c.tps).toFixed(1)})  load ${c.load1?.toFixed(1)}`,
      );
      return c;
    });
    // Same bits at init and the same integer work on tick 0, or the comparison is void.
    const ref = group[0];
    for (const c of group) {
      if (c.hash !== ref.hash || c.tick0.join() !== ref.tick0.join()) {
        throw new Error(
          `fairness check failed at N=${n} ${profile}: ${ref.variant} hash ${ref.hash} tick0 ${ref.tick0.join()} ` +
            `vs ${c.variant} hash ${c.hash} tick0 ${c.tick0.join()}. The two kernels have diverged; diff init first.`,
        );
      }
    }
    cells.push(...group);
  }
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(cells, null, 1));
console.error(`wrote ${out}`);
