/**
 * Cell-type palette for M2. A subset of the spec's full palette (§4.2): the
 * photosynthetic producer, the digestive heterotroph, and the MEAT corpse state
 * a dead cell becomes. Values are stable Uint8 indices stored in `cellType`.
 * Extend (do not renumber) as later milestones add sensor/neuron/mover/etc.
 */
export const CellType = {
  PHOTO: 0,
  DIGESTIVE: 1,
  MEAT: 2,
  MOTILE: 3,
  SENSOR: 4,
  NEURON: 5,
  MOVER: 6,
  /** Carnivore mouth: drains energy from contacting living cells of OTHER organisms (the prey-eating
   *  analogue of DIGESTIVE). Lets a predator organism hunt foragers. Added in the ecology pass. */
  PREDATOR: 7,
} as const;

export type CellTypeValue = (typeof CellType)[keyof typeof CellType];

/** True for types that metabolize and age. MEAT is dead; all others live. */
export function isLiving(type: number): boolean {
  return type !== CellType.MEAT;
}

/** True for neural-network cells (sense / compute / actuate). They wire via synapses. */
export function isNeural(type: number): boolean {
  return type === CellType.SENSOR || type === CellType.NEURON || type === CellType.MOVER;
}

/** Can `eater` consume `prey`? Heterotrophs (DIGESTIVE, MOTILE) eat PHOTO + MEAT. */
export function isEdibleBy(eater: number, prey: number): boolean {
  return (
    (eater === CellType.DIGESTIVE || eater === CellType.MOTILE) &&
    (prey === CellType.PHOTO || prey === CellType.MEAT)
  );
}

/**
 * Is `prey` huntable flesh for a PREDATOR mouth? Living forager-body cells (DIGESTIVE/MOTILE/SENSOR/
 * NEURON/MOVER) — i.e. NOT plants (PHOTO) and NOT corpses (MEAT, scavenger food). The PREDATOR mouth
 * cell itself is excluded, so a predator's *mouth* is never prey; but a predator's BODY cells (its
 * MOVER/SENSOR/NEURON) ARE flesh, so predators can drain each other's bodies — rare in practice
 * (hunters are sparse), and an accepted part of the validated balance, not a guaranteed taboo. The
 * caller pairs this with a different-organism check (a predator never eats its own body). Type-only
 * here — the "different organism" identity check (organismId, structural like bonds) lives in the
 * kernel, so no fitness/lineage decision is involved. */
export function isFlesh(prey: number): boolean {
  return (
    prey === CellType.DIGESTIVE ||
    prey === CellType.MOTILE ||
    prey === CellType.SENSOR ||
    prey === CellType.NEURON ||
    prey === CellType.MOVER
  );
}
