/**
 * Headless CLI entry. Run: pnpm headless [ticks] [seed]
 * Prints the population trajectory + the golden state-hash for the (config, seed) — the determinism
 * fingerprint you can diff between runs/commits.
 */
import { defaultConfig } from '../core/config';
import { runHeadless } from './harness';

const ticks = Number(process.argv[2] ?? 2000);
const seed = Number(process.argv[3] ?? 1);

const config = defaultConfig({ seed });
const { finalHash, series } = runHeadless(config, ticks);

console.log(`=== headless run: ${ticks} ticks, seed ${seed} (world ${config.worldWidth}²) ===`);
for (const s of series) console.log(`  t${s.tick}: population ${s.population}`);
console.log(`final state hash: ${finalHash}`);
