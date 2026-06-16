import { describe, it, expect } from 'vitest';
import { CellType, isLiving, isEdibleBy } from './types';

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
