import { describe, it, expect } from 'vitest';
import { formatMenagerie } from './menagerie-panel';
import { type SpeciesSummary } from '../core/sim/species-board';

function row(species: SpeciesSummary, signature: string, generation: number) {
  return { species, signature, generation };
}

describe('formatMenagerie', () => {
  it('shows an empty state when there are no species', () => {
    expect(formatMenagerie([]).join('\n')).toMatch(/no species/i);
  });

  it('lists each species with member count and representative signature', () => {
    const rows = [
      row({ speciesId: 0, liveCount: 7, representativeRef: 3 }, '0p1d2s2n1m|2c1t', 4),
      row({ speciesId: 1, liveCount: 2, representativeRef: 9 }, '3p0d0s0n1m|0c1t', 1),
    ];
    const lines = formatMenagerie(rows);
    const text = lines.join('\n');
    expect(text).toMatch(/MENAGERIE/i);
    expect(text).toContain('7'); // member count
    expect(text).toContain('0p1d2s2n1m|2c1t'); // signature
    expect(text).toContain('g4'); // representative generation
  });
});
