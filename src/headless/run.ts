/**
 * Headless CLI entry. Run: pnpm headless [ticks] [seed]
 * Prints the population/food/birth/death trajectory + the golden state-hash. The Phase-2 liveness
 * check: population must sustain BOTH births and deaths without going extinct or pegging at the cap.
 */
import { defaultConfig } from '../core/config';
import { runHeadless } from './harness';

const ticks = Number(process.argv[2] ?? 5000);
const seed = Number(process.argv[3] ?? 1);
const blind = process.argv[4] === 'blind'; // chemotaxis OFF (the steering ablation): blind cruise

const config = defaultConfig(blind ? { seed, turnGain: 0, thrustGain: 0 } : { seed });
const r = runHeadless(config, ticks);

console.log(`=== headless run: ${ticks} ticks, seed ${seed} (world ${config.worldWidth}²) ===`);
let prevB = 0;
let prevD = 0;
for (const s of r.series) {
  const dB = s.births - prevB;
  const dD = s.deaths - prevD;
  prevB = s.births;
  prevD = s.deaths;
  console.log(
    `  t${String(s.tick).padStart(6)}: pop ${String(s.population).padStart(5)}  food ${String(s.food).padStart(7)}  +${String(dB).padStart(4)}b -${String(dD).padStart(4)}d`,
  );
}
console.log(
  `final: pop ${r.finalPopulation}  births ${r.totalBirths}  deaths ${r.totalDeaths}  ` +
    `${r.extinctAtTick < 0 ? 'ALIVE' : 'EXTINCT@' + r.extinctAtTick}  hash ${r.finalHash}`,
);
