/**
 * PLANT SCENT — the smell plants emit, as TWO diffusing PheroField channels split by the plant SPECIES
 * gene. Plan §5.1. This is what lets smell keep working once the FoodField's biomass channels go away:
 * a creature no longer sniffs a scalar biomass grid, it sniffs what the plants standing there are.
 *
 * Why not a channel on ScentField: that field is 4 FIXED channels wired to 16 brain genes and gated on
 * pheromoneEnabled. Widening it shifts BRAIN_GENES and disturbs every evolved brain. Two PheroFields cost
 * 0.52 MB, reuse a tested implementation (toroidal diffusion, wall no-flux, gradient reads, hash), and
 * leave the animal genome layout untouched.
 *
 * The split mirrors ScentField.deposit's diet split exactly: a plant lays (1 − SPECIES) of its biomass
 * into LO and SPECIES into HI, so a creature that reads the two gradients blended by its own FORAGE_PREF
 * climbs toward the species band it eats. Two channels carry a CONTINUOUS axis because the blend, not the
 * channel count, is what encodes position on it.
 *
 * RNG-free throughout. Allocated only alongside the plant pool; null is the byte-identical OFF path.
 */
import { PheroField } from './phero-field';
import { PLANT_GENE_COUNT, PlantGene, type Plants } from './plants';

export class PlantScent {
  /** Deposits weighted (1 − SPECIES): the low end of the resource axis. */
  readonly lo: PheroField;
  /** Deposits weighted SPECIES: the high end. */
  readonly hi: PheroField;

  constructor(worldWidth: number, worldHeight: number, cols: number, rows: number) {
    this.lo = new PheroField(worldWidth, worldHeight, cols, rows);
    this.hi = new PheroField(worldWidth, worldHeight, cols, rows);
  }

  /**
   * Every live plant lays its biomass into the two channels, split by SPECIES. Ascending live order,
   * RNG-free. Must run AFTER plants.step() culls, so a negative E can never be deposited into a field
   * that has no floor (§3.1a).
   */
  depositAll(plants: Plants, strength: number): void {
    const { liveIndices, liveCount, x, y, energy, genes } = plants;
    for (let k = 0; k < liveCount; k++) {
      const i = liveIndices[k]!;
      const amount = strength * energy[i]!;
      const species = genes[i * PLANT_GENE_COUNT + PlantGene.SPECIES]!;
      this.lo.deposit(x[i]!, y[i]!, amount * (1 - species));
      this.hi.deposit(x[i]!, y[i]!, amount * species);
    }
  }

  /** Diffuse + decay both channels. Walls dam the field (no-flux) exactly as they do for pheromone. */
  step(diffuse: number, decay: number, blocked: Uint8Array | null): void {
    this.lo.step(diffuse, decay, blocked);
    this.hi.step(diffuse, decay, blocked);
  }

  /**
   * Allocation-free gradient read of both channels into `out`: LO gx,gy at [0],[1] and HI gx,gy at
   * [2],[3] — the layout senseFood blends by FORAGE_PREF when smell cuts over (increment 3), mirroring
   * ScentField.gradientsInto.
   */
  gradientsInto(x: number, y: number, step: number, out: Float64Array): void {
    this.lo.gradientInto(x, y, step, out, 0);
    this.hi.gradientInto(x, y, step, out, 2);
  }

  /** Total deposited scent across both channels (telemetry / probes). */
  total(): number {
    return this.lo.total() + this.hi.total();
  }

  /** Reset to empty, so World.reset() reproduces a fresh construction's state. */
  reset(): void {
    this.lo.reset();
    this.hi.reset();
  }

  /** Mix both channels into the determinism hash — gated by the caller so the OFF path is unchanged. */
  hashInto(h: { f: (v: number) => void }): void {
    this.lo.hashInto(h);
    this.hi.hashInto(h);
  }
}
