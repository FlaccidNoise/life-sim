/**
 * The LIVING-WORLD demo opt-ins — the single source of the `defaultConfig({...})` overrides that turn the
 * byte-identical-OFF core into the full live demo. Extracted from main.ts so the headless census probe
 * (src/headless/vision-census.ts) runs against the EXACT demo config, never a hand-copied drift of it.
 *
 * defaultConfig() itself stays the legacy golden baseline (every feature OFF). These overrides layer the
 * demo on top; the census then layers its sweep (clustering on/off, vision center, parcel appeal) on top of
 * THESE. None of this touches the golden hash — only main.ts and the probe consume it.
 */
import { type Config } from '../core/config';

export const livingWorldOverrides: Partial<Config> = {
  // Spatial structure + legibility.
  wallRegionCount: 5,
  flowStrength: 0.35, // stronger current so channel B actually drifts (and mixes pockets for encounters)
  flowPushStrength: 0.25,
  motorSquash: true,
  // Density (the proven lever): more + bigger pockets → dense → predators + niche partitioning return.
  foodPatchCount: 40,
  foodPatchRadius: 8,
  // Two differentiated resources: channel A wall-tied (structural), channel B drifting in the current.
  foodChannels: 2,
  foodPocketChannelMode: 1,
  foodChannelAWallTied: true,
  foodChannelBDriftMult: 3,
  // Migrating pockets — two crossing seasonal currents: channel A creeps slowly one way, channel B sweeps
  // the normal rate in a different direction, so the resource zones constantly rearrange (kills the static
  // "camp on a fixed gradient forever" equilibrium; food you must follow).
  fertilityDriftRate: 1,
  fertilityDriftInterval: 20,
  foodPocketDriftRateA: 0.2,
  foodPocketDriftRateB: 1.0,
  pocketDriftSpeed: 0.6,
  // Pheromones (delayed-feedback substrate).
  pheromoneEnabled: true,
  // Sight-only drifting food parcels + the census-proven vision-cost cut → the dead vision genes get a
  // reason to evolve up (this tuning lives in the demo so defaultConfig stays byte-identical to legacy).
  parcelsEnabled: true,
  parcelEnergy: 80,
  parcelSpawnInterval: 6,
  parcelCapacity: 120,
  visionFovCost: 0.02,
  visionAcuityCost: 0.02,
};
