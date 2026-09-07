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
  // Kinematic steering (spin fix) — MEASURED AND HELD BACK. The knobs work: bounding |dθ| by speed/4 with
  // turnFloor 0.1 and squash gain 4·MAX_TURN cut spinner windows 15.6%→5.9% and turn saturation
  // 28.5-56.7%→6.5-10.3% over 3 seeds at 6000t. But the bound also shifts the flee/chase balance, and the
  // demo does not survive it at 12000t. demo-health-gate, seed 1, warmup 6000, paired same-horizon runs:
  //   these values      pop    40  pred 55.0%  σDIET 0.133  births 499   FAIL (stalled + monoculture)
  //   legacy motor      pop  1877  pred 52.4%  σDIET 0.228  births 8595  PASS
  // At 6000t the same setting reads pop 5367 / σDIET 0.256 and PASSES, so this is a decay between 6k and
  // 12k, not a bad seed — exactly the horizon trap the Arc B finding warns about. Turn-limited prey cannot
  // evade, so predation runs as an energy printer until the prey base is gone. Re-enable only with an
  // ecology-side compensation (e.g. exempt prey under sight-threat from the bound) and a paired 12k gate.
  minTurnRadius: 0,
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
  deadWaterCost: 0.05, // dead-water tax between pockets → real isolation (residents stay home → demes diverge).
  // ARC-C C1 (isolation down-payment): raised 0.02→0.05 to firm up residency so C2/C3 regional selection has
  // less gene flow to fight. This is the ONE conservative isolation lever with safe headroom — region-probe
  // (seeds 1-8, 20k) confirms pop stays bounded + ecology alive; 0.08+ adds gap-mortality that crashes seeds.
  // NB the other "proven demes" levers are ALREADY active here (foodPatchRichnessVar 0.8, deep reservoirs
  // richness 3 / maxFert 5, foodPocketChannelMode 1). pocketCapVariance stays OFF: turning it on REPLACES the
  // deep-reservoir clamp (cap·maxFert=200) with cap·(1+var)≈64, flattening pockets + killing predators.
  // Gene flow is geometry-limited to ~1.4% (mate reach 36 ≪ pocket spacing) so diet F_ST is coexistence-
  // capped at ~1 on the demo; the clean ≥2× regional trait comes from C3's abiotic gradient.
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
  // PLANTS AS ENTITIES (increment 1 — the pool runs in parallel; nothing eats it yet). Rooted, brainless
  // producers on the soil-fertility substrate, with their own 6-gene genome and their own forked RNG, so
  // the organism stream is byte-identical to plants-off and this increment is measurable in isolation.
  // MEASURED at 8k, seeds 1-3: ~17k plants holding ~800k standing crop against the plan's 700,000
  // prediction, NND 13.8 u (inside biteRange 16 — the direct fix for the recorded NND-75u density wall),
  // 4.5 plants inside a grazer's reach, every fertile pocket occupied, 1.09x the plants-off ms/tick.
  plantsEnabled: true,
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
  mateContactRange: 36, // MATE REACH (B1): 12→36. Mate-encounter is the #1 reproduction bottleneck at this
  // spread-thin density (an 8192² world with ~12u reach ≪ natural NND), so the demo opened in a dead-looking
  // bootstrap valley (pop 1000→~450 with births≈0). Only real now that B0 unhardwired findMate's 3×3 scan to
  // honour the full range. Multi-seed validated (evolve-probe 20k, seeds 1–3): all sustain a bimodal grazer/
  // hunter split t5k→20k (dietσ 0.26–0.38 vs baseline 0.07–0.19), pop settles 3–5k (no cap), turnover deepens
  // (mean lineage gen ~33 vs ~27), shallower valley. Regression-guarded by demo-health-gate.ts (nightly.yml).
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
  dietGeneralistFloor: 0.7, // DIET-AXIS DISRUPTIVE SELECTION: graze + hunt income ×= floor + (1−floor)·2·|diet−0.5|,
  // penalising the omnivore (diet 0.5 earns 70% at floor 0.7) so the grazer/hunter split doesn't erode to a
  // uniform-omnivore monoculture. B2 (root-cause pass): RELAXED 0.6→0.7, toward 1 (= no penalty). The sweep
  // measured the split was COEFFICIENT-held, not ecology-held — hunting economically dominated grazing (uncapped
  // predationGain hoard), so relaxing the coefficient collapsed the grazer niche (pre-B4: floor 0.8 held 2/3
  // seeds at 12k, 1.0 held 0/3). B4's satiation cap fixed the root cause — capped hunters no longer hoard/out-
  // compete grazers — so the ECONOMY now carries most of the split. The relaxation TARGET is set by 20k
  // robustness (evolve-probe 20k, seeds 1-4, WITH B4): 0.6 → 4/4 bimodal (σ 0.31-0.36, strongest but least
  // relaxed), 0.7 → 4/4 (σ 0.24-0.33), 0.8 → only 1/4 (holds at 12k but decays to omnivore creep by 20k). So
  // 0.7 is the relaxed-yet-20k-robust point: a lighter thumb than 0.6, without 0.8's late decay.
  // NB predEncounter can't be pushed >0.1 sustained by geometry — biteRange 32 hits it but over-predates and
  // crashes the guild (seed 1 1315→173 preds); predators thrive at enc~0.04 on payoff + herbivory fallback.
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
  mutationSigma: 0.12, // evolutionary step 0.08→0.12: more standing variation maintained against selection
  hueMutationSigma: 0.06, // lineage colors diverge faster (0.04→0.06) → more visible variety, no fitness effect
  forageGeneralistFloor: 0.7, // sharpen the specialist split (0.85→0.7): generalists earn less → bimodal niches
  visionRangeCost: 0.0006, // ~3× lower (0.002→0.0006) so the tripled VISION_RANGE cap is reachable, not taxed
  // away instantly. Scan cost scales as range², so this is the live throttle on how many creatures pay it.
  // ── WAVE 1 diversity crank (emergence experiment) ────────────────────────────────────────────────────
  // Thermal niches ON: regional thermal species (THERMAL_PREF gene wakes up, uniform-seeded → regional
  // stabilizing selection drives each deme to its local temperature).
  temperatureMetabCost: 0.4,
  // Photosynthesis ON: a producer morph (PHOTOSYNTH gene) that harvests a seeded LIGHT field for passive
  // energy, most efficient when SLOW/STILL (stillness penalty selects for a sedentary drifting lifestyle —
  // a genuinely different body plan from grazers/predators). Uniform-seeded so committed autotrophs exist in
  // the founding pool from t=0; the gene is upkeep-costed (chloroplast maintenance) so it's a real tradeoff.
  photosynthEnabled: true,
  photosynthGain: 0.6, // high enough that a still creature survives on light alone (sedentary lifestyle viable)
  photosynthStillnessK: 4.0, // sharpened — more extreme sedentary forms (speed² kills photosynthesis)
  photosynthCost: 0.02,
  photosynthLightScale: 1.2,
  photosynth: 0.3,
  // Parasitism (parasite morph): a host-riding siphon niche. Small creatures attach to larger hosts and
  // drain energy over time (chronic, not lethal) while riding them — a genuinely different survival
  // strategy from grazing/hunting/photosynthesizing. Creates host-parasite coevolution pressure.
  parasiteEnabled: true,
  parasiteDrain: 0.05, // LOW chronic drain — hosts survive parasitism (no hyperparasite crash)
  parasiteGain: 1.5, // high conversion — parasites profit from the small drain (free movement + steady income)
  parasiteAttachRange: 40, // moderate — wandering parasites find hosts without swarming
  parasiteSizeRatio: 1.2, // host must be ≥1.2× the parasite's size (loose — more creatures qualify as hosts)
  parasiteCost: 0.02, // mild upkeep — slight pressure to drop the gene if never attaching (not lethal)
  parasite: 0.3, // founder center. NB the pool is drawn UNIFORM over [0,1], not gaussian around this — the
  // center only sets the upkeep-free point (see parasiteFounderUniform). Measured at 6000 ticks: switching
  // to gaussian founding makes the morph a minority but re-opens the seed lottery the satiation cap closed
  // (pop 1768 / 26 / 4435 on seeds 1-3, a 171× spread vs 1.5× uniform), so uniform stays.
  parasiteHostSeekGain: 0, // OFF — A/B (parasite-host-seek-probe.ts) showed the sight-pull toward big
  // bodies is maladaptive: it suppresses the parasite niche ~29× (141 vs 4106 parasites at 8k ticks) and
  // LOWERS attachment (0.27 vs 0.37) because actively swimming toward hosts fights the parasite's evolved
  // neural steering and starves it. Proximity attachment (parasiteStep's spatial scan) is the healthy
  // strategy. Parasites still use the FULL neural net (sight/smell/brain) for grazing & fleeing — only
  // the extra host-seeking pull term is off. Re-enable with the itsDiet<0.5 guard in sense.ts if revisited.
  // Scavenger (scavenger morph): a death-following niche. Creatures absorb energy from nearby death
  // events (transient corpse biomass) — a genuinely different strategy from grazing/hunting/parasitizing/
  // photosynthesizing. Creates a niche for creatures that follow where things are dying.
  scavengerEnabled: true,
  corpseEnergy: 20, // biomass deposited at a death (tuned down — less free energy with 3 morphs active)
  scavengeRange: 20, // range a scavenger senses death events
  scavengerCost: 0.05, // scavenging apparatus upkeep — expensive enough to be a niche, not a monoculture
  scavenger: 0.3, // founder center (drawn uniform[0,1] at seed)
  // ── Satiation cap on the morph income channels ───────────────────────────────────────────────────────
  // The three morphs above added income that, unlike grazing (metabolize) and hunting (hunt's B4 cap), kept
  // paying a creature already at its satiated bar, so morph income never saturated. This applies the same
  // cap to all three. MEASURED on this motor (minTurnRadius 0), seeds 1-4, 6000 ticks, pop / pred% / σDIET:
  //   off  223 / 0.4 / 0.095 · 423 / 1.4 / 0.134 · 2631 / 0.2 / 0.104 · 145 / 2.8 / 0.104
  //   on  2376 / 0.7 / 0.125 · 1284 / 0.7 / 0.118 · 1347 / 19.6 / 0.202 · 208 / 0.5 / 0.121
  // The decision was made at 12000 ticks against demo-health-gate (seeds 1-3), three arms:
  //   morphs on + cap   11217/89.8%/0.240 · 3147/37.0%/0.223 · 1767/40.5%/0.324   PASS 3/3
  //   morphs on, no cap  1877/52.4%/0.228 · 1155/17.7%/0.203 · 3744/18.6%/0.179   PASS 1/3 (2,3 monoculture)
  //   morphs OFF         2484/31.7%/0.331 · 2439/ 0.4%/0.111 · 4370/ 4.2%/0.171   PASS 1/3 (2,3 no predators)
  // So the cap is what carries the morph economy past the gate, and turning the morphs off does NOT recover
  // the July baseline on today's engine — seeds 2 and 3 lose the predator layer either way. The near-zero
  // predator layer at 6000 ticks is a property of the reverted turn bound above, not of this cap.
  // On the PREVIOUS motor the cap was decisive — 6000-tick population spread 31× → 1.5× — and every lever
  // tried on top of it there (carry cost, gaussian parasite founding, morph upkeep, corpseEnergy,
  // predationGain, basalCost, crowdingMortality) re-opened a 100-330× spread. See scratchpad/eco-retune.md.
  morphSatiationCap: true,
};
