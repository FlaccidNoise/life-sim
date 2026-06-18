import { describe, it, expect } from 'vitest';
import { SenseSource, SightTarget } from './sense-source';

describe('SenseSource / SightTarget enums', () => {
  it('SMELL is 0 so existing genomes (default 0) are unchanged', () => {
    expect(SenseSource.SMELL).toBe(0);
    expect(SenseSource.SIGHT).toBe(1);
    expect(SenseSource.HEARING).toBe(2);
  });
  it('SightTarget defaults FOOD to 0', () => {
    expect(SightTarget.FOOD).toBe(0);
    expect(SightTarget.PREY).toBe(1);
    expect(SightTarget.PREDATOR).toBe(2);
  });
});
