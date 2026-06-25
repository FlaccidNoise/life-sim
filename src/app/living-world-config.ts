/**
 * The LIVING-WORLD demo opt-ins — the SINGLE source of the `defaultConfig({...})` overrides that turn the
 * byte-identical-OFF core into the full live demo. Imported by the browser entry (src/app/main.ts), the
 * headless life-history probe (--demo), and the vision census, so the three can never drift apart.
 *
 * defaultConfig() itself stays the legacy golden baseline (every feature OFF). These overrides layer the
 * demo on top. Every key here is live-tunable in the in-app Knobs panel.
 */
import { type Config } from '../core/config';

export const livingWorldOverrides: Partial<Config> = {
  // Spatial structure + legibility.
  wallRegionCount: 5,
  flowStrength: 1, // visible current (3× the old 0.35) reconciled with resilience: on the consolidated
  // engine (latest brain + foodDriveFloor + wider ranges) fs=1 is the ONLY zero-extinction setting across
  // 8 seeds (mean end-pop 326); fs≥2 sweeps bodies off food → 1/8 seeds goes extinct. flowPush stays live.
  flowPushStrength: 0.25,
  motorSquash: true,
  // Density (the proven lever): more + bigger pockets → dense → predators + niche partitioning return.
  // B-food-2: separate A/B patches (mode 1), blobbier (radius 8→14), drifting per-pocket → two-niche diversity.
  // count: the plan called for 40→20 but 20 STARVES the demo at the realistic 8000-tick horizon (2/3 seeds
  // extinct — the area argument ignores that fewer drifting pockets strand the population in gaps). 24 is the
  // measured floor that holds liveness at 8000t across 5 seeds (938/27/325/4319/549, no extinction) while still
  // sparser+blobbier than the 40/8 original. See bfood2-report.md.
  foodPatchCount: 24,
  foodPatchRadius: 14,
  // Two differentiated resources: channel A wall-tied (structural), channel B drifting in the current.
  foodChannels: 2,
  foodPocketChannelMode: 1,
  foodChannelAWallTied: true,
  foodChannelBDriftMult: 3,
  // Availability-weight the 2-channel graze: a soft specialist that drifts off its resource falls back to
  // what's present instead of starving. THIS is what breaks the A-monoculture — without it the fugitive B
  // niche (B drifts ×3 + migrating pockets) collapses to all-A on most seeds. Measured (bodySense OFF, 5k,
  // seeds 1/3/5/7): B-specialists go 0%→38-81% on EVERY seed, prefVar ~0.005→0.07-0.13, population stays
  // sparse (193-486 — no inflation). Leaves forageSpecBonus at its default 0.5 (raising it only bloats pop).
  forageAvailabilityWeighted: true,
  // Identity-bearing scent (4-channel: prey/predator role + hue signature; passive per-tick deposit).
  // Migrating pockets — two crossing seasonal currents: channel A creeps slowly one way, channel B sweeps
  // the normal rate in a different direction, so the resource zones constantly rearrange (kills the static
  // "camp on a fixed gradient forever" equilibrium; food you must follow).
  fertilityDriftRate: 0.5, // RESILIENCE: gentler drift (was 1 / 0.6) — food still MOVES (chasing behaviour
  fertilityDriftInterval: 20, // retained) but half-rate, so weak starts aren't stranded chasing fast food.
  foodPocketDriftRateA: 0.2,
  foodPocketDriftRateB: 1.0,
  pocketDriftSpeed: 0.3,
  // Pheromones (delayed-feedback substrate).
  pheromoneEnabled: true,
  hungerSense: true, // DEMO: the brain senses its own energy deficit (dead in default config — audit)
  scentIdentity: true,
  // Sight-only drifting food parcels + the census-proven vision-cost cut → the dead vision genes get a
  // reason to evolve up (this tuning lives in the demo so defaultConfig stays byte-identical to legacy).
  parcelsEnabled: true,
  parcelEnergy: 80,
  parcelSpawnInterval: 6,
  parcelCapacity: 120,
  visionFovCost: 0.02,
  visionAcuityCost: 0.02,
  // Lifespan + behavior depth. Margin: a softer starvation clock so creatures get a real runway off the food
  // field. Satiation behavior: hungerGatesFood makes a full creature's food-seeking fade so it wanders on its
  // other drives, and breedCooldown spaces reproduction so creatures actually DWELL well-fed.
  basalCost: 0.06, // RESILIENCE: softer starvation clock (0.08→0.06) — the single biggest min-floor lever
  // (worst-seed trough 2→5 alone; stacked with breedCooldown+gentler-drift → 67). Longer lives, no extinctions.
  hungerGatesFood: true,
  foodDriveFloor: 0.7, // a satiated creature keeps 70% food drive → relocates + keeps topping up (can breed
  // through the cooldown) instead of parking on empty food. Measured: 5× end-pop + 5× births vs floor 0.
  bodySense: false, // RESILIENCE: bodySense (own size/diet/crowding interoceptive inputs) CRASHES the demo —
  // measured seed-1 end-pop 8 → 931, the 1/8 extinction eliminated, mean end-pop 226 → 347 across 8 seeds.
  // Those inputs were scale-walled (barely behavioral) but the constant size/diet synapses tank survival.
  breedCooldown: 100, // RESILIENCE: faster recovery from population dips (150→100) — adds births/mean-end
  // back on top of the softer starvation clock without re-introducing the over-boom of an even lower basalCost.
  // Age / life stages (life-sim-bd8a): juvenile (can't breed) → adult → elder (senescence tax = death of
  // old age). Tail-gated genes MATURITY_AGE/SENESCENCE_AGE evolve in-life. senescenceRate is a live knob.
  ageStages: true,
  // PREDATOR REVIVAL — available via the knobs (predator size boost / herbivory exp / predation gain), but NOT
  // on by default: the bundle (predatorSizeBoost 0.85 + herbivoryExp 0.7 + predationGain 3) revives predators on
  // ~half the seeds, but it makes the world high-variance — on seed 1 the seeded hunters over-graze the prey
  // and the world drops from ~1076 to ~60. Default keeps the stable all-grazer world (survival-first). To watch
  // predators: bump "predator size boost" to ~0.85, "predation gain" to 3, "herbivory exp" to 0.7, and reset.
};
