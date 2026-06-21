/**
 * Headless CLI entry. Run: pnpm headless [ticks] [seed] [--report]
 * Prints the population/food/birth/death trajectory + the golden state-hash. The Phase-2 liveness
 * check: population must sustain BOTH births and deaths without going extinct or pegging at the cap.
 *
 * With --report it ALSO runs the safeguard-#3 audit: a per-state invariant scan (scanHealth) plus the
 * trajectory checks (extinction / zero-births / zero-deaths / flatline) and exits non-zero on any
 * failure, so it's usable as a CI gate ("the world must stay alive and never go non-finite").
 */
import { defaultConfig } from '../core/config';
import { World } from '../core/world';
import { scanHealth } from '../core/health';
import { runHeadless, type RunResult } from './harness';

const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ticks = Number(positional[0] ?? 5000);
const seed = Number(positional[1] ?? 1);
const wantReport = flags.includes('--report');

const config = defaultConfig({ seed });
const r = runHeadless(config, ticks);

console.log(`=== headless run: ${ticks} ticks, seed ${seed} (world ${config.worldWidth}²) ===`);
let prevB = 0;
let prevD = 0;
for (const s of r.series) {
  const dB = s.births - prevB;
  const dD = s.deaths - prevD;
  prevB = s.births;
  prevD = s.deaths;
  const [spd, eat, sns, sz, trn, thr, eff, rep, sat, bir, diet, dmg, vr, vf, va] = s.geneMeans;
  const genes =
    `spd ${spd!.toFixed(1)} eat ${eat!.toFixed(1)} sns ${sns!.toFixed(0)} sz ${sz!.toFixed(1)} ` +
    `trn ${trn!.toFixed(2)} thr ${thr!.toFixed(2)} eff ${eff!.toFixed(2)} ` +
    `rep ${rep!.toFixed(0)} sat ${sat!.toFixed(0)} bir ${bir!.toFixed(0)} ` +
    `diet ${diet!.toFixed(2)} dmg ${dmg!.toFixed(1)} ` +
    `vis[r ${vr!.toFixed(0)} fov ${vf!.toFixed(2)} acu ${va!.toFixed(2)}]`;
  console.log(
    `  t${String(s.tick).padStart(6)}: pop ${String(s.population).padStart(5)} (${String(s.predators).padStart(4)} pred)  food ${String(s.food).padStart(7)}  +${String(dB).padStart(4)}b -${String(dD).padStart(4)}d  [${genes}]`,
  );
}
console.log(
  `final: pop ${r.finalPopulation}  births ${r.totalBirths}  deaths ${r.totalDeaths}  ` +
    `${r.extinctAtTick < 0 ? 'ALIVE' : 'EXTINCT@' + r.extinctAtTick}  hash ${r.finalHash}`,
);

if (wantReport) process.exit(report(config, ticks, seed, r));

/** Run the safeguard-#3 audit and print PASS/FAIL. Returns a process exit code (0 = healthy). */
function report(
  config: ReturnType<typeof defaultConfig>,
  ticks: number,
  seed: number,
  r: RunResult,
): number {
  const problems: string[] = [];

  // ── Trajectory checks (the world must keep breathing) ──
  if (r.extinctAtTick >= 0) problems.push(`extinction at tick ${r.extinctAtTick}`);
  if (r.finalPopulation === 0) problems.push('final population is zero');
  if (r.totalBirths === 0) problems.push('zero births over the whole run');
  if (r.totalDeaths === 0) problems.push('zero deaths over the whole run (nothing is dying)');
  if (r.finalPopulation >= config.maxOrganisms)
    problems.push(`population pegged at the cap (${config.maxOrganisms}) — runaway growth`);
  const pops = r.series.map((s) => s.population);
  if (pops.length >= 3 && new Set(pops).size === 1)
    problems.push(`population flatlined at ${pops[0]} (frozen — no demographic turnover)`);

  // ── Per-state invariant scan at the final tick (re-run to the end to get a live World handle) ──
  const w = new World(config);
  for (let t = 0; t < ticks; t++) w.step();
  const h = scanHealth(w, 20);

  console.log('\n=== health report ===');
  console.log(
    `  final-state scan: pop ${h.population}  ` +
      `energy[min ${h.energy.min.toFixed(1)} mean ${h.energy.mean.toFixed(1)} max ${h.energy.max.toFixed(1)}]  ` +
      `speed[min ${h.speed.min.toFixed(2)} mean ${h.speed.mean.toFixed(2)} max ${h.speed.max.toFixed(2)}]`,
  );
  if (!h.ok) {
    problems.push(
      `${h.violationCount} invariant violation(s) ` +
        `[nonfinite ${h.byKind.nonfinite}, oob ${h.byKind.oob}, energy ${h.byKind.energy}, gene ${h.byKind.gene}]`,
    );
    for (const v of h.violations)
      console.log(`    ✗ ${v.kind}: slot ${v.slot} ${v.field} = ${v.value}`);
  }

  if (problems.length === 0) {
    console.log('  ✓ PASS — world alive, breathing, and all invariants hold.');
    return 0;
  }
  console.log('  ✗ FAIL:');
  for (const p of problems) console.log(`    - ${p}`);
  return 1;
}
