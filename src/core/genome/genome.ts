/**
 * The developmental genome (§4.7) — a growth recipe, not a blueprint. Plain JS data
 * (Float64 numbers); touched only on STRUCTURAL events (development, mutation,
 * reproduction), never in the allocation-free hot loop. Three parts (§4.7): cell GENES
 * (a parametric cell-type with a heritable innovation id), a DEVELOPMENT PROGRAM of
 * division rules, and gene-keyed BOND + CONNECTION + MOTOR rule tables that realise
 * non-tree bonds, synapses, and mover I/O over the developed body.
 *
 * Each cell of a developed body is an INSTANCE of a gene (decision 2). Rules are keyed by
 * GENE (not palette type), so distinct genes carry distinct wiring even when they share a
 * palette type (e.g. the critter's two clock NEURONs wire asymmetrically). With one
 * instance per gene this maps 1:1 to synapses; a recursive body's repeated instances are
 * all wired consistently by a single rule (§4.6 addressable-locus).
 */
export interface Gene {
  /** Heritable innovation/historical id (§4.7) for homology tracking (M9 crossover). */
  innovation: number;
  /** Palette type (CellType). */
  cellType: number;
  radius: number;
  mass: number;
  /** Seed energy provisioned per instance of this gene (sums into the maternal cost). */
  initialEnergy: number;
  /** Neuron bias (NEURON/MOVER); 0 otherwise. */
  bias: number;
  /** SensorChannel for a SENSOR gene; -1 otherwise. */
  sensorChannel: number;
}

/**
 * A division rule (§4.7): the `parentGene` emits `repeat` instances of `childGene`, each
 * placed at `dist` from the parent at body-frame angle `parentHeading + angle`, bonded to
 * the parent with relative `stiffness`. Fired in a fixed BFS order so development is
 * deterministic.
 */
export interface DivisionRule {
  parentGene: number;
  childGene: number;
  angle: number;
  dist: number;
  stiffness: number;
  repeat: number;
}

/** A non-tree bond between every instance-pair of two genes (bracing/cross-body cohesion). */
export interface BondRule {
  geneA: number;
  geneB: number;
  stiffness: number;
}

/** A synapse between every instance-pair (preGene → postGene) with weight/sign (§4.6). */
export interface ConnectionRule {
  preGene: number;
  postGene: number;
  weight: number;
}

/** Binds a MOVER gene's instance to read its (turn, thrust) neuron-gene instances. */
export interface MotorRule {
  moverGene: number;
  turnGene: number;
  thrustGene: number;
}

export interface Genome {
  /** Index into `genes` of the seed cell development starts from. */
  seedGene: number;
  genes: Gene[];
  divisionRules: DivisionRule[];
  bondRules: BondRule[];
  connectionRules: ConnectionRule[];
  motorRules: MotorRule[];
  /** Lineage: the parent genome's store ref (-1 for a founder). */
  parentRef: number;
  /** Lineage depth (0 for a founder). */
  generation: number;
  /** Founding-lineage id: a founder gets a fresh monotonic id at register; descendants inherit it
   * (rides cloneGenome). -1 until the founder is registered. Part of the determinism contract. */
  founderId: number;
}

/** Deep copy. Genes/rules are flat records, so a per-field copy is exact + allocation-cheap. */
export function cloneGenome(g: Genome): Genome {
  return {
    seedGene: g.seedGene,
    genes: g.genes.map((x) => ({ ...x })),
    divisionRules: g.divisionRules.map((x) => ({ ...x })),
    bondRules: g.bondRules.map((x) => ({ ...x })),
    connectionRules: g.connectionRules.map((x) => ({ ...x })),
    motorRules: g.motorRules.map((x) => ({ ...x })),
    parentRef: g.parentRef,
    generation: g.generation,
    founderId: g.founderId,
  };
}

export function serializeGenome(g: Genome): string {
  return JSON.stringify(g);
}

export function deserializeGenome(s: string): Genome {
  return JSON.parse(s) as Genome;
}

/**
 * Holds genomes by ref and hands out monotonic refs + innovation ids. Refs are NEVER
 * reused (a freed ref stays gone), so lineage references and `genomeRef` cell fields are
 * unambiguous and deterministic across runs given a canonical register order (reproduction
 * scans ascending organism id). Not in the hot loop — a Map is fine.
 */
export class GenomeStore {
  private readonly genomes: Map<number, Genome>;
  private nextRef: number;
  private innovation: number;
  private founder: number;

  constructor() {
    this.genomes = new Map<number, Genome>();
    this.nextRef = 0;
    this.innovation = 0;
    this.founder = 0;
  }

  /** Register a genome, returning its fresh ref. A founder (founderId < 0) is lazily stamped with a
   * fresh founder id here — deterministic, since register order is canonical (init + ascending repro). */
  register(g: Genome): number {
    if (g.founderId < 0) g.founderId = this.founder++;
    const ref = this.nextRef++;
    this.genomes.set(ref, g);
    return ref;
  }

  get(ref: number): Genome | undefined {
    return this.genomes.get(ref);
  }

  /** All live genomes as `{ ref, genome }`, ascending by ref (for inspector + save). */
  list(): { ref: number; genome: Genome }[] {
    const out: { ref: number; genome: Genome }[] = [];
    for (let ref = 0; ref < this.nextRef; ref++) {
      const g = this.genomes.get(ref);
      if (g !== undefined) out.push({ ref, genome: g });
    }
    return out;
  }

  /** Drop a genome (its organism died). The ref is not recycled. */
  free(ref: number): void {
    this.genomes.delete(ref);
  }

  /** Next heritable innovation id (monotonic; for new/duplicated genes). */
  nextInnovationId(): number {
    return this.innovation++;
  }

  get size(): number {
    return this.genomes.size;
  }
}

/** Serialize a genome library (shareable "the seed that grew this creature", §11 M6). */
export function serializeGenomeLibrary(store: GenomeStore): string {
  return JSON.stringify(store.list());
}

/** Parse a serialized genome library back into `{ ref, genome }` entries. */
export function loadGenomeLibrary(json: string): { ref: number; genome: Genome }[] {
  return JSON.parse(json) as { ref: number; genome: Genome }[];
}
