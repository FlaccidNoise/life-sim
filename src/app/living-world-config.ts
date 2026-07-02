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
  // BIOGEOGRAPHIC DEMES (2026-06-25): concentrate population into DEEP, isolated, STATIC pockets so local
  // density revives a predation layer (the root fix — at 8192² spread-thin, NND ~75u ≫ biteRange 16u, so
  // predation was geometrically impossible). Headless (predator-probe, 4 seeds): with these deep pockets the
  // seeded predator guild goes predExtinct@NEVER on every seed (vs the OLD demo where it died ~t4000 on all
  // seeds), and densest-pocket localNND collapses to ~12u < biteRange. See the Wave 1-3 sweep in
  // .superpowers/sdd/ + docs/superpowers/specs/2026-06-25-biogeographic-demes-design.md.
  // MICRO-POCKETS: many SMALL but DEEP pockets. Small radius bounds each pocket's prey count → total pop
  // stays ~5-7k (vs ~16-22k with big pockets) which (a) keeps the frame rate smooth at speed and (b) is the
  // "grand scale, micro-pockets of intense detail" shape — lots of dense little demes, not a few huge blobs.
  // Live-tested: radius 14 → pop balloons to 16k+ and tanks fps; radius 7 holds ~5-7k while staying locally
  // dense enough for predation (localNND < biteRange).
  foodPatchCount: 20, // more regions (more distinct demes / histories)
  foodPatchRadius: 7, // small footprint per pocket (14→7) → bounded total pop + intense local density
  foodPatchRichness: 3, // DEEP reservoirs: peak fertility 3 → K = cap·3, a dense prey cluster per pocket
  foodMaxFertility: 5, // K-clamp raised 3→5 (diversity pass): with richness 3 + var 0.8, pocket peaks span
  // 3·[0.2,1.8]=[0.6,5.4]; a clamp at 3 flattened the whole upper half to a uniform max ("everything maxed
  // out"), so raising it to 5 lets the depth variation actually express (only the rare >5 peak clips).
  foodPatchRichnessVar: 0.8, // per-pocket depth variation 0.5→0.8 → wider shallow-grazer-refuge ↔ deep-
  // predator-haven spread across all three channels (peaks now genuinely range, not pinned at the clamp)
  deadWaterCost: 0.02, // dead-water tax between pockets → real isolation (residents stay home → demes diverge)
  // THREE differentiated resources (diversity pass: 2→3 → a third diet niche). Channels are assigned to
  // pockets round-robin (p % 3) via pocketChannelMode 1. NB foodChannelAWallTied MUST be false here: the
  // wall-tie split is binary (near-wall→A / open-water→B, food-field.ts), so it would starve channel C of
  // pockets. Dropping wall-tie trades A's near-wall structural identity for a working third channel.
  foodChannels: 3,
  foodPocketChannelMode: 1,
  foodChannelAWallTied: false,
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
  fertilityDriftRate: 0, // DEMES: pocket-center drift OFF — pockets hold a FIXED location so each becomes a
  // stable deme that builds its own regional history (the "unique evolutionary paths per region" goal).
  // Drift previously kept food moving to prevent camp-on-gradient stagnation; the bet is that dense LOCAL
  // predation now supplies the motion/interest instead. (Channel-B flow advection below still smears B
  // downstream, so resources aren't fully frozen.) The drift-rate knobs below are inert at rate 0.
  fertilityDriftInterval: 20,
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
  // PREDATOR REVIVAL — now ON by default. The bundle was previously OFF because at the OLD spread-thin density
  // it was high-variance (predators revived on ~half the seeds, over-grazed, crashed). Paired with the DEEP
  // pockets above it stops fighting geometry: across 4 headless seeds the predator guild persists on every seed
  // (predExtinct@NEVER). The dynamics still run dense + seed-variable (some seeds boom predators, some stay
  // sparse) — that per-region variance is the "distinct histories" feature, but the explosiveness is a live
  // tuning target (predationGain is the knob to ease down if a seed runs to the cap).
  predatorFraction: 0.3, // FOUND MORE HUNTERS (0.15→0.3): the bootstrap valley kills most predator lineages, so
  // seeding ~300 (not 150) is what carries a guild through to the prey boom. Live-tested in-browser: at 0.15 the
  // default seed BUSTS to ~24 predators (dense prey monoculture); at 0.3 it holds ~300 through the valley then
  // climbs to a visible ~1200-predator layer (~10%) with a cleanly BIMODAL diet distribution (real grazer/hunter
  // split, not omnivory drift). Founding is the dominant lever on whether the demo seed gets a predator layer.
  predatorSizeBoost: 0.85, // seed hunters in the upper size band so they can actually catch prey (huntSizeRatio)
  herbivoryExp: 0.7, // predators lean on hunting but keep a plant fallback to survive the bootstrap valley
  predationGain: 3, // meat pays enough to sustain hunters through sparse stretches (lower = predators starve)
  predatorSeedClusters: 8, // found the hunter guild into the 8 deepest pockets so it doesn't die in the gaps
  dietGeneralistFloor: 0.6, // DIET-AXIS DISRUPTIVE SELECTION: graze + hunt income ×= 0.6 + 0.4·2·|diet−0.5|,
  // so the omnivore (diet 0.5) earns 60% while committed grazers (diet 0) and hunters (diet 1) earn 100%.
  // Without this the diet axis has no penalty for the jack-of-all-trades, so the grazer/predator split erodes
  // to a uniform-omnivore monoculture (omniv 90%, σ→0.10) by ~20k. 0.6 is the measured sweet spot: across 4
  // seeds at t20k the split PERSISTS (omniv suppressed to 4-20%, predators 14-25%, σ 0.27-0.34) — robust, not
  // seed-lucky. 0.5 was seed-fragile (tipped to grazer-mono on some seeds), 0.65 let omnivores creep back / taxed
  // predators out. See diet-bimodal-probe sweeps in .superpowers/sdd/.
  huntDietGap: 0.1, // a predator needs a MEANINGFUL diet advantage to eat its target (prey diet ≤ attacker
  // diet − 0.1), so a 0.78 hunter won't drain a 0.77 near-peer but a 0.8/0.99 hunter still eats a ≤0.5 omnivore.
  // Stops the unrealistic near-peer cannibalism the strict-lower rule allowed. Size refuge (huntSizeRatio) still
  // applies. Tuned to 0.1 not 0.25: predators are marginal, and 0.25 starved them out on seed 1 (pred 19%→0%);
  // 0.1 keeps the bimodal split on all 3 tested seeds (pred 6-34% at t20k) while still killing near-peer kills.
  cannibalism: false, // predators eat only LOWER-diet prey, not each other. With cannibalism ON, when prey
  // crash the predators sustain themselves by eating each other → a runaway predator monoculture (prey down to
  // ~400, 85% predators by t10k). OFF restores predator/prey negative frequency-dependence (rare predators
  // thrive on abundant prey, common predators starve as prey crash → both guilds persist). Measured seed 1
  // @20k: prey 413→2592, predator fraction 85%→41%. predExtinct@NEVER either way.
  // ── Variability pass (diversity tuning) ──────────────────────────────────────────────────────────────
  // Widen the realized trait spread WITHOUT touching founderSigma (which floods the founding pool with unfit
  // extremes and crashes births past ~0.3 — see config.ts). These are the safe levers: a bigger mutation step
  // keeps more standing variation against selection, faster hue drift makes lineages visibly diverge, a
  // sharper forage floor pulls FORAGE_PREF off the generalist center into committed A/B/C specialists, and a
  // lower vision cost lets the now-tripled VISION_RANGE gene actually get used (the perf throttle — raise it
  // back toward 0.002 if too much of the pop goes long-sighted and fps drops).
  mutationSigma: 0.08, // evolutionary step 0.05→0.08: more standing variation maintained against selection
  hueMutationSigma: 0.04, // lineage colors diverge faster (0.02→0.04) → more visible variety, no fitness effect
  forageGeneralistFloor: 0.7, // sharpen the specialist split (0.85→0.7): generalists earn less → bimodal niches
  visionRangeCost: 0.0006, // ~3× lower (0.002→0.0006) so the tripled VISION_RANGE cap is reachable, not taxed
  // away instantly. Scan cost scales as range², so this is the live throttle on how many creatures pay it.
};
