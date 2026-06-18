import { describe, it, expect } from 'vitest';
import { CellType, isLiving, isEdibleBy, isNeural, isFlesh } from './types';

describe('cell type palette', () => {
  it('assigns distinct stable indices', () => {
    expect(CellType.PHOTO).toBe(0);
    expect(CellType.DIGESTIVE).toBe(1);
    expect(CellType.MEAT).toBe(2);
  });

  it('classifies living vs dead', () => {
    expect(isLiving(CellType.PHOTO)).toBe(true);
    expect(isLiving(CellType.DIGESTIVE)).toBe(true);
    expect(isLiving(CellType.MEAT)).toBe(false);
  });

  it('digestive cells eat photo and meat, not other digestive or self', () => {
    expect(isEdibleBy(CellType.DIGESTIVE, CellType.PHOTO)).toBe(true);
    expect(isEdibleBy(CellType.DIGESTIVE, CellType.MEAT)).toBe(true);
    expect(isEdibleBy(CellType.DIGESTIVE, CellType.DIGESTIVE)).toBe(false);
    expect(isEdibleBy(CellType.PHOTO, CellType.MEAT)).toBe(false); // photo cells don't eat
  });
});

describe('MOTILE type (M3)', () => {
  it('is a distinct stable index that does not renumber the M2 palette', () => {
    expect(CellType.PHOTO).toBe(0);
    expect(CellType.DIGESTIVE).toBe(1);
    expect(CellType.MEAT).toBe(2);
    expect(CellType.MOTILE).toBe(3);
  });

  it('MOTILE is living (metabolizes + divides)', () => {
    expect(isLiving(CellType.MOTILE)).toBe(true);
    expect(isLiving(CellType.MEAT)).toBe(false);
  });

  it('MOTILE eats PHOTO and MEAT like a digestive; is not itself edible', () => {
    expect(isEdibleBy(CellType.MOTILE, CellType.PHOTO)).toBe(true);
    expect(isEdibleBy(CellType.MOTILE, CellType.MEAT)).toBe(true);
    expect(isEdibleBy(CellType.MOTILE, CellType.MOTILE)).toBe(false);
    expect(isEdibleBy(CellType.DIGESTIVE, CellType.MOTILE)).toBe(false);
  });
});

describe('M4 neural cell types', () => {
  it('appends SENSOR/NEURON/MOVER without renumbering the M2/M3 palette', () => {
    expect(CellType.PHOTO).toBe(0);
    expect(CellType.DIGESTIVE).toBe(1);
    expect(CellType.MEAT).toBe(2);
    expect(CellType.MOTILE).toBe(3);
    expect(CellType.SENSOR).toBe(4);
    expect(CellType.NEURON).toBe(5);
    expect(CellType.MOVER).toBe(6);
  });

  it('SENSOR/NEURON/MOVER are living (metabolize + age), MEAT is not', () => {
    expect(isLiving(CellType.SENSOR)).toBe(true);
    expect(isLiving(CellType.NEURON)).toBe(true);
    expect(isLiving(CellType.MOVER)).toBe(true);
    expect(isLiving(CellType.MEAT)).toBe(false);
  });

  it('isNeural is true only for SENSOR/NEURON/MOVER', () => {
    expect(isNeural(CellType.SENSOR)).toBe(true);
    expect(isNeural(CellType.NEURON)).toBe(true);
    expect(isNeural(CellType.MOVER)).toBe(true);
    expect(isNeural(CellType.PHOTO)).toBe(false);
    expect(isNeural(CellType.MOTILE)).toBe(false);
    expect(isNeural(CellType.MEAT)).toBe(false);
  });

  it('neural cells are NOT edible (only PHOTO/MEAT are prey)', () => {
    expect(isEdibleBy(CellType.DIGESTIVE, CellType.NEURON)).toBe(false);
    expect(isEdibleBy(CellType.MOTILE, CellType.MOVER)).toBe(false);
    expect(isEdibleBy(CellType.MOTILE, CellType.SENSOR)).toBe(false);
  });
});

describe('PREDATOR type (ecology pass)', () => {
  it('appends PREDATOR=7 without renumbering the existing palette', () => {
    expect(CellType.MOVER).toBe(6);
    expect(CellType.PREDATOR).toBe(7);
  });

  it('PREDATOR is living and is NOT a neural cell', () => {
    expect(isLiving(CellType.PREDATOR)).toBe(true);
    expect(isNeural(CellType.PREDATOR)).toBe(false);
  });

  it('isFlesh is true for forager-body cells, false for plants/corpses/predators', () => {
    expect(isFlesh(CellType.DIGESTIVE)).toBe(true);
    expect(isFlesh(CellType.MOTILE)).toBe(true);
    expect(isFlesh(CellType.SENSOR)).toBe(true);
    expect(isFlesh(CellType.NEURON)).toBe(true);
    expect(isFlesh(CellType.MOVER)).toBe(true);
    expect(isFlesh(CellType.PHOTO)).toBe(false); // plants are the herbivore niche, not flesh
    expect(isFlesh(CellType.MEAT)).toBe(false); // corpses are scavenger food
    expect(isFlesh(CellType.PREDATOR)).toBe(false); // predators don't cannibalize each other
  });

  it('PREDATOR is NOT edible by herbivore mouths (it is not PHOTO/MEAT)', () => {
    expect(isEdibleBy(CellType.DIGESTIVE, CellType.PREDATOR)).toBe(false);
    expect(isEdibleBy(CellType.MOTILE, CellType.PREDATOR)).toBe(false);
  });
});
