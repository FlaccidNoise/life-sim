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
