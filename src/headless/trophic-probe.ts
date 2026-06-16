import { World } from '../core/sim/world';
import { defaultConfig, type Config } from '../core/sim/config';

/**
 * Headless trophic time-series probe (§11 experiment tool). Runs the default world
 * (or config overrides) and prints a CSV-style population-by-type trajectory so we
 * can characterise the M3 food-web dynamics (digestive boom/bust, motile/photo
 * coexistence) with data instead of eyeballing the live app.
 *
 * Usage: tsx src/headless/trophic-probe.ts '<json config overrides>' [ticks] [interval] [seed] [seedCount]
 *   e.g. tsx src/headless/trophic-probe.ts '{"initialMotileFraction":0}' 3000 200 1
 */
const overrides = JSON.parse(process.argv[2] ?? '{}') as Partial<Config>;
const ticks = Number(process.argv[3] ?? 3000);
const interval = Number(process.argv[4] ?? 200);
const seedCount = Number(process.argv[6] ?? 1);
const baseSeed = Number(process.argv[5] ?? 1);

function run(seed: number): void {
  const cfg = defaultConfig({ seed, maxCells: 60_000, ...overrides });
  const w = new World(cfg);
  w.seedLife(20_000);
  console.log(
    `# seed=${seed} photoFrac=${cfg.initialPhotoFraction} motileFrac=${cfg.initialMotileFraction} ` +
      `digestRate=${cfg.digestRate} moveCost=${cfg.moveCost} foodDeposit=${cfg.foodDeposit}`,
  );
  console.log('tick,pop,photo,digestive,motile,meat,diversity,meanEnergy,births,deaths');
  const m = w.metrics;
  const row = (): void =>
    console.log(
      `${w.tickCount},${m.population},${m.photo},${m.digestive},${m.motile},${m.meat},` +
        `${m.diversity.toFixed(3)},${m.meanEnergy.toFixed(1)},${w.lastBirths},${w.lastDeaths}`,
    );
  for (let t = 0; t < ticks; t++) {
    w.tick();
    if (w.tickCount % interval === 0) row();
  }
}

for (let s = 0; s < seedCount; s++) run(baseSeed + s);
