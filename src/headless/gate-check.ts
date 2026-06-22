/** Standing determinism gate (safeguard #1): prints stateHash at tick 200 + 400 for the ablation OFF
 *  baselines. EVERY new system must leave these byte-identical at its OFF default. Baselines (seed 1):
 *    channels=1 @200=82e41dbd @400=1bdaf0bb ; channels=2 @200=7098f748 @400=e1df933e */
import { defaultConfig, type Config } from '../core/config';
import { World } from '../core/world';

function hashesAt(o: Partial<Config>): { h200: string; h400: string } {
  const w = new World(defaultConfig({ seed: 1, ...o }));
  let h200 = '';
  for (let t = 0; t < 400; t++) {
    w.step();
    if (t === 199) h200 = w.stateHash();
  }
  return { h200, h400: w.stateHash() };
}

for (const o of [{ foodChannels: 1 }, { foodChannels: 2 }]) {
  const { h200, h400 } = hashesAt(o);
  console.log(`channels=${o.foodChannels} @200=${h200} @400=${h400}`);
}
