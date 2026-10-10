// Prints the markdown tables for docs/research/kernel-bench.md from the JSON that run.ts wrote.
// usage: tsx report.ts <bench.json> [profile.json]

import { readFileSync } from 'node:fs';
import type { Cell } from './run';

const TARGET = 2400;
const PHASES = ['hash', 'sense', 'brain', 'act', 'contact', 'scent'];
const STATS = [
  'mean speed',
  'mean abs output',
  'mean neighbours',
  'total energy',
  'energy sd',
  'scent sum',
];

const load = (path: string): Cell[] => JSON.parse(readFileSync(path, 'utf8')) as Cell[];
const median = (v: number[]): number => [...v].sort((a, b) => a - b)[v.length >> 1];
const uniq = <T>(v: T[]): T[] => [...new Set(v)];
const fmt = (v: number): string =>
  v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
const row = (cols: (string | number)[]): string => `| ${cols.join(' | ')} |`;
const header = (cols: string[]): string => `${row(cols)}\n${row(cols.map(() => '---'))}`;

const [benchPath, profilePath] = process.argv.slice(2);
if (!benchPath) {
  console.error('usage: tsx report.ts <bench.json> [profile.json]');
  process.exit(2);
}
const cells = load(benchPath);
const variants = uniq(cells.map((c) => c.variant));
const ns = uniq(cells.map((c) => c.n));
const profiles = uniq(cells.map((c) => c.profile));
const find = (v: string, n: number, p: string): Cell | undefined =>
  cells.find((c) => c.variant === v && c.n === n && c.profile === p);

for (const p of profiles) {
  console.log(`\n### Median ticks per second, profile ${p} (min-max of 5 runs)\n`);
  console.log(header(['variant', ...ns.map((n) => `N=${n}`)]));
  for (const v of variants) {
    const cols = ns.map((n) => {
      const c = find(v, n, p);
      return c
        ? `**${fmt(median(c.tps))}** (${fmt(Math.min(...c.tps))}-${fmt(Math.max(...c.tps))})`
        : '';
    });
    console.log(row([v, ...cols]));
  }
}

// Largest N that holds the target rate: log-log interpolation between the two bracketing measured points.
console.log(`\n### Estimated largest N at ${TARGET} ticks per second\n`);
console.log(header(['variant', ...profiles.map((p) => `profile ${p}`)]));
for (const v of variants) {
  const cols = profiles.map((p) => {
    const pts = ns.flatMap((n) => {
      const c = find(v, n, p);
      return c ? [{ n, tps: median(c.tps) }] : [];
    });
    if (pts.length === 0) return '';
    if (pts[0].tps < TARGET) return `below ${pts[0].n} (${fmt(pts[0].tps)} at N=${pts[0].n})`;
    const i = pts.findIndex((pt) => pt.tps < TARGET);
    if (i < 0) return `above ${pts[pts.length - 1].n}`;
    const a = pts[i - 1];
    const b = pts[i];
    const t = Math.log(a.tps / TARGET) / Math.log(a.tps / b.tps);
    return `~${Math.round(a.n * Math.pow(b.n / a.n, t))} (between N=${a.n} and N=${b.n})`;
  });
  console.log(row([v, ...cols]));
}

console.log(
  '\n### Fairness: init hash and tick-0 work counters (identical across variants, asserted by run.ts)\n',
);
console.log(
  header([
    'profile',
    'N',
    'init state hash',
    'connections',
    'sense candidates',
    'eyes',
    'variants agreeing',
  ]),
);
for (const p of profiles) {
  for (const n of ns) {
    const group = cells.filter((c) => c.n === n && c.profile === p);
    const ref = group[0];
    if (!ref) continue;
    const same = group.every((c) => c.hash === ref.hash && c.tick0.join() === ref.tick0.join());
    console.log(
      row([
        p,
        n,
        ref.hash.toString(16),
        ...ref.tick0,
        same ? `${group.length}/${group.length}` : 'MISMATCH',
      ]),
    );
  }
}

console.log(
  '\n### Fairness: aggregate statistics after 1,200 ticks, and total work over those ticks\n',
);
console.log(
  header([
    'profile',
    'N',
    'variant',
    ...STATS,
    'candidates per creature-tick',
    'max deviation from ts',
  ]),
);
for (const p of profiles) {
  for (const n of ns) {
    const ref = find(variants[0], n, p);
    for (const v of variants) {
      const c = find(v, n, p);
      if (!c || !ref) continue;
      const dev = Math.max(...c.stats.map((s, k) => Math.abs(s / ref.stats[k] - 1)));
      console.log(
        row([
          p,
          n,
          v,
          ...c.stats.map((s) => s.toPrecision(5)),
          (c.total[1] / (n * 1200)).toFixed(2),
          `${(dev * 100).toFixed(2)}%`,
        ]),
      );
    }
  }
}

if (profilePath) {
  const prof = load(profilePath);
  for (const c of prof) {
    const us = c.phaseUs.map(median);
    const sum = us.reduce((a, b) => a + b, 0);
    console.log(
      `\n### Phase breakdown: ${c.variant}, N=${c.n}, profile ${c.profile} (${fmt(sum)} us per tick)\n`,
    );
    console.log(header(['phase', 'us per tick', '% of tick']));
    us.forEach((u, k) => console.log(row([PHASES[k], fmt(u), `${((u / sum) * 100).toFixed(1)}%`])));
  }
}
