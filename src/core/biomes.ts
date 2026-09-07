/**
 * Biome registry: each Voronoi wall region gets a deterministic biome type based on its generator
 * index. Biomes define region-specific scalar-gene + brain-weight presets so creatures seeded into
 * different biomes start with different innate tendencies, and regional selection drives divergence.
 *
 * The mapping is seed-stable: walls.regionGen[regionIndex] → BiomeType, so a given seed always
 * produces the same biome layout. The atlas is the single source of truth for biome definitions.
 */

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
 *  Each key is a ScalarGene index; the value replaces the config-centered seed. */
export type ScalarOverrides = Partial<Record<number, number>>;

/** Overrides applied to a creature's brain weights at birth when spawned in this biome.
 *  Each key is a Brain index; the value replaces the founder-brain default. */
export type BrainOverrides = Partial<Record<number, number>>;

export interface BiomeConfig {
  name: string;
  palette: BiomePalette;
  /** Scalar-gene overrides at seed time. Only specified genes are touched; others keep the config center. */
  scalarOverrides: ScalarOverrides;
  /** Brain-weight overrides at seed time. Only specified weights are touched. */
  brainOverrides: BrainOverrides;
  /** Preferred food channel for this biome (0=A, 1=B, 2=C). Used by seedPatches when biome-aware channel assignment is on. */
  preferredChannel: number;
  /** How strongly this biome's channel preference is enforced (0=not at all, 1=all pockets in this biome get the preferred channel). */
  channelBias: number;
}

export const BIOME_PALETTE: Record<BiomeType, BiomePalette> = {
  [BiomeType.OpenOcean]: { wallR: 0.25, wallG: 0.4, wallB: 0.55, bgR: 0.05, bgG: 0.12, bgB: 0.2 },
  [BiomeType.Reef]: { wallR: 0.35, wallG: 0.55, wallB: 0.3, bgR: 0.08, bgG: 0.18, bgB: 0.1 },
  [BiomeType.Abyss]: { wallR: 0.15, wallG: 0.1, wallB: 0.25, bgR: 0.02, bgG: 0.02, bgB: 0.06 },
};

/**
 * The biome atlas: one entry per generator type. Indexed by BiomeType (which equals the generator
 * index in walls.ts). This keeps the mapping 1:1 and deterministic.
 */
export const BIOME_ATLAS: Record<BiomeType, BiomeConfig> = {
  [BiomeType.OpenOcean]: {
    name: 'Open Ocean',
    palette: BIOME_PALETTE[BiomeType.OpenOcean],
    // Fast cruisers with wide vision — the open-water pursuit niche.
    // Costed genes nudged CLOSE to centers so upkeep stays survivable (total extra ~0.05/tick).
    scalarOverrides: {
      // MAX_SPEED: 6→7 (upkeep +0.05)
      0: 7,
      // VISION_RANGE: 140→250 (upkeep +0.066)
      12: 250,
      // SHELTER_DRIVE: down to 0 (below center → no upkeep, saves energy)
      15: 0,
      // COHESION_DRIVE: down to 0 (below center → saves energy)
      16: 0,
    },
    brainOverrides: {
      // SIGHT_FWD_THRUST: stronger chase (no upkeep on brain weights)
      9: 1.8,
      // THRUST_BIAS: higher cruise
      5: 0.5,
    },
    preferredChannel: 0, // channel A (stable, non-drifting)
    channelBias: 0,
  },
  [BiomeType.Reef]: {
    name: 'Reef',
    palette: BIOME_PALETTE[BiomeType.Reef],
    // Shelter-seeking, schooling — the crowded-reef niche.
    // Costed genes nudged gently (total extra ~0.045/tick).
    scalarOverrides: {
      // SENSE_RANGE: 64→40 (below center → no upkeep)
      2: 40,
      // SHELTER_DRIVE: 0.06→0.12 (upkeep +0.03)
      15: 0.12,
      // COHESION_DRIVE: 0.15→0.3 (upkeep +0.015)
      16: 0.3,
      // VISION_RANGE: 140→80 (below center → no upkeep)
      12: 80,
    },
    brainOverrides: {
      // WALL_LAT_TURN: turn away from walls (no upkeep)
      10: 1.0,
      // SIGHT_FWD_THRUST: less aggressive chase
      9: 0.8,
    },
    preferredChannel: 1, // channel B (drifting, mobile — matches the reef's dynamic corridors)
    channelBias: 0,
  },
  [BiomeType.Abyss]: {
    name: 'Abyss',
    palette: BIOME_PALETTE[BiomeType.Abyss],
    // Big, slow predators — the ambush niche in dark chambers.
    // Costed genes nudged gently (total extra ~0.045/tick).
    scalarOverrides: {
      // SIZE: 6→9 (upkeep +0.045 — a bigger body with deep reserves)
      3: 9,
      // MAX_SPEED: 6→4 (below center → no upkeep)
      0: 4,
      // VISION_RANGE: 140→60 (below center → no upkeep)
      12: 60,
      // VISION_FOV: 1.0→1.8 (upkeep +0.12... bit high but survivable with the speed/size savings)
      13: 1.8,
    },
    brainOverrides: {
      // SIGHT_FWD_THRUST: ambush burst (no upkeep; gentler than before to avoid predator skew)
      9: 1.5,
      // BITE_GATE_BIAS: moderately eager biter
      53: 3.5,
      // THRUST_BIAS: low cruise (lurker)
      5: 0.2,
    },
    preferredChannel: 2, // channel C (the scarce, place-coupled resource)
    channelBias: 0,
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
