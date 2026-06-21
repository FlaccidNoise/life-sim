/**
 * Headless CLI entry. Run: pnpm headless [ticks] [seed]
 * Prints the population/food/birth/death trajectory + the golden state-hash. The Phase-2 liveness
 * check: population must sustain BOTH births and deaths without going extinct or pegging at the cap.
 */
import { defaultConfig } from '../core/config';
import { runHeadless } from './harness';

const ticks = Number(process.argv[2] ?? 5000);
const seed = Number(process.argv[3] ?? 1);

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
  const [spd, eat, sns, sz, trn, thr, eff, rep, sat, bir, diet, dmg] = s.geneMeans;
  const genes =
    `spd ${spd!.toFixed(1)} eat ${eat!.toFixed(1)} sns ${sns!.toFixed(0)} sz ${sz!.toFixed(1)} ` +
    `trn ${trn!.toFixed(2)} thr ${thr!.toFixed(2)} eff ${eff!.toFixed(2)} ` +
    `rep ${rep!.toFixed(0)} sat ${sat!.toFixed(0)} bir ${bir!.toFixed(0)} ` +
    `diet ${diet!.toFixed(2)} dmg ${dmg!.toFixed(1)}`;
  console.log(
    `  t${String(s.tick).padStart(6)}: pop ${String(s.population).padStart(5)} (${String(s.predators).padStart(4)} pred)  food ${String(s.food).padStart(7)}  +${String(dB).padStart(4)}b -${String(dD).padStart(4)}d  [${genes}]`,
  );
}
console.log(
  `final: pop ${r.finalPopulation}  births ${r.totalBirths}  deaths ${r.totalDeaths}  ` +
    `${r.extinctAtTick < 0 ? 'ALIVE' : 'EXTINCT@' + r.extinctAtTick}  hash ${r.finalHash}`,
);
