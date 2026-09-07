/**
 * Biome registry: each Voronoi wall region gets a deterministic biome type based on its generator
 * index. Biomes define region-specific scalar-gene + brain-weight presets so creatures seeded into
 * different biomes start with different innate tendencies, and regional selection drives divergence.
 *
 * The mapping is seed-stable: walls.regionGen[regionIndex] → BiomeType, so a given seed always
 * produces the same biome layout. The atlas is the single source of truth for biome definitions.
 */
import { ScalarGene, Brain } from './genome';

export type ScalarGeneId = (typeof ScalarGene)[keyof typeof ScalarGene];
export type BrainId = (typeof Brain)[keyof typeof Brain];

/** The three biome archetypes matching the three wall generators (noise, CA, rooms). */
export enum BiomeType {
  OpenOcean = 0, // noise generator — open, sparse, strong current
  Reef = 1, // CA caves — dense walls, tight corridors, clustered food
  Abyss = 2, // rooms — large chambers, deep pockets, dark
}

/** A biome's visual identity for the renderer. */
export interface BiomePalette {
  /** Normalized RGB [0,1] for wall tint in this biome. */
  wallR: number;
  wallG: number;
  wallB: number;
  /** Normalized RGB for the background tint when the camera is over this biome. */
  bgR: number;
  bgG: number;
  bgB: number;
}

/** Overrides applied to a creature's scalar genes at birth when spawned in this biome.
 *  Each key is a ScalarGene id; the value replaces the config-centered seed. */
export type ScalarOverrides = Partial<Record<ScalarGeneId, number>>;

/** Overrides applied to a creature's brain weights at birth when spawned in this biome.
 *  Each key is a Brain id; the value replaces the founder-brain default. */
export type BrainOverrides = Partial<Record<BrainId, number>>;

export interface BiomeConfig {
  name: string;
  palette: BiomePalette;
  /** Scalar-gene overrides at seed time. Only specified genes are touched; others keep the config center. */
  scalarOverrides: ScalarOverrides;
  /** Brain-weight overrides at seed time. Only specified weights are touched. */
  brainOverrides: BrainOverrides;
  /** Preferred food channel for this biome (0=A, 1=B, 2=C). Used by seedPatches when biome-aware channel assignment is on. */
  preferredChannel: number;
}

/**
 * The biome atlas: one entry per generator type. Indexed by BiomeType (which equals the generator
 * index in walls.ts). This keeps the mapping 1:1 and deterministic.
 */
export const BIOME_ATLAS: Record<BiomeType, BiomeConfig> = {
  [BiomeType.OpenOcean]: {
    name: 'Open Ocean',
    palette: { wallR: 0.25, wallG: 0.4, wallB: 0.55, bgR: 0.05, bgG: 0.12, bgB: 0.2 },
    // Fast cruisers with wide vision — the open-water pursuit niche.
    // Costed genes nudged CLOSE to centers so upkeep stays survivable (total extra ~0.05/tick).
    scalarOverrides: {
      [ScalarGene.MAX_SPEED]: 7, // 6→7 (upkeep +0.05)
      [ScalarGene.VISION_RANGE]: 250, // 140→250 (upkeep +0.066)
      [ScalarGene.SHELTER_DRIVE]: 0, // down to 0 (below center → no upkeep, saves energy)
      [ScalarGene.COHESION_DRIVE]: 0, // down to 0 (below center → saves energy)
    },
    brainOverrides: {
      [Brain.SIGHT_FWD_THRUST]: 1.8, // stronger chase (no upkeep on brain weights)
      [Brain.THRUST_BIAS]: 0.5, // higher cruise
    },
    preferredChannel: 0, // channel A (stable, non-drifting)
  },
  [BiomeType.Reef]: {
    name: 'Reef',
    palette: { wallR: 0.35, wallG: 0.55, wallB: 0.3, bgR: 0.08, bgG: 0.18, bgB: 0.1 },
    // Shelter-seeking, schooling — the crowded-reef niche.
    // Costed genes nudged gently (total extra ~0.045/tick).
    scalarOverrides: {
      [ScalarGene.SENSE_RANGE]: 40, // 64→40 (below center → no upkeep)
      [ScalarGene.SHELTER_DRIVE]: 0.12, // 0.06→0.12 (upkeep +0.03)
      [ScalarGene.COHESION_DRIVE]: 0.3, // 0.15→0.3 (upkeep +0.015)
      [ScalarGene.VISION_RANGE]: 80, // 140→80 (below center → no upkeep)
    },
    brainOverrides: {
      [Brain.WALL_LAT_TURN]: 1.0, // turn away from walls (no upkeep)
      [Brain.SIGHT_FWD_THRUST]: 0.8, // less aggressive chase
    },
    preferredChannel: 1, // channel B (drifting, mobile — matches the reef's dynamic corridors)
  },
  [BiomeType.Abyss]: {
    name: 'Abyss',
    palette: { wallR: 0.15, wallG: 0.1, wallB: 0.25, bgR: 0.02, bgG: 0.02, bgB: 0.06 },
    // Big, slow predators — the ambush niche in dark chambers.
    // Costed genes nudged gently (total extra ~0.045/tick).
    scalarOverrides: {
      [ScalarGene.SIZE]: 9, // 6→9 (upkeep +0.045 — a bigger body with deep reserves)
      [ScalarGene.MAX_SPEED]: 4, // 6→4 (below center → no upkeep)
      [ScalarGene.VISION_RANGE]: 60, // 140→60 (below center → no upkeep)
      [ScalarGene.VISION_FOV]: 1.8, // 1.0→1.8 (upkeep +0.12... bit high but survivable with the speed/size savings)
    },
    brainOverrides: {
      [Brain.SIGHT_FWD_THRUST]: 1.5, // ambush burst (no upkeep; gentler than before to avoid predator skew)
      [Brain.BITE_GATE_BIAS]: 3.5, // moderately eager biter
      [Brain.THRUST_BIAS]: 0.2, // low cruise (lurker)
    },
    preferredChannel: 2, // channel C (the scarce, place-coupled resource)
  },
};

/** Map a wall-region generator index (0=noise, 1=CA, 2=rooms) to its BiomeType. */
export function biomeTypeForRegionGen(genIndex: number): BiomeType {
  // The generators array in walls.ts is [noise, CA, rooms]; we align BiomeType to the same index.
  if (genIndex === 0) return BiomeType.OpenOcean;
  if (genIndex === 1) return BiomeType.Reef;
  return BiomeType.Abyss;
}

/** Look up the full biome config for a creature's current position. Returns null if walls are inactive. */
export function biomeAt(
  walls: { active: boolean; regionAt(x: number, y: number): number; regionGen: Int32Array } | null,
  x: number,
  y: number,
): BiomeConfig | null {
  if (!walls || !walls.active) return null;
  const region = walls.regionAt(x, y);
  if (region < 0) return null;
  const gen = walls.regionGen[region];
  if (gen === undefined) return null;
  const type = biomeTypeForRegionGen(gen);
  return BIOME_ATLAS[type] ?? null;
}
