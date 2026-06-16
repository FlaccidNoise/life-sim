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
