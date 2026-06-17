import { describe, it, expect } from 'vitest';
import { formatHallOfFame } from './hall-of-fame';
import { type LineageSummary } from '../core/sim/lineage-board';

describe('formatHallOfFame', () => {
  it('shows an empty state when there are no live lineages', () => {
    const lines = formatHallOfFame([], 100);
    expect(lines.join('\n')).toMatch(/no live lineages/i);
  });

  it('lists lineages with rank, founder id, live count, peak and age', () => {
    const board: LineageSummary[] = [
      { founderId: 3, liveCount: 12, peakCount: 20, firstTick: 40, representativeRef: 7 },
      { founderId: 1, liveCount: 5, peakCount: 9, firstTick: 10, representativeRef: 2 },
    ];
    const lines = formatHallOfFame(board, 100);
    const text = lines.join('\n');
    expect(text).toMatch(/HALL OF FAME/i);
    expect(text).toContain('#3'); // founder id
    expect(text).toContain('12'); // live count
    expect(text).toContain('20'); // peak
    expect(text).toContain('60'); // age = 100 - 40
  });
});
