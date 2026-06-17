import { type World } from '../core/sim/world';
import { type LineageSummary } from '../core/sim/lineage-board';

/** Pure: format the champion board into display lines (empty state first). */
export function formatHallOfFame(board: LineageSummary[], tick: number): string[] {
  const lines: string[] = ['HALL OF FAME — largest live lineages (J)'];
  if (board.length === 0) {
    lines.push('  no live lineages yet');
    return lines;
  }
  lines.push('  rank  founder   live   peak    age');
  for (let i = 0; i < board.length; i++) {
    const s = board[i]!;
    const rank = String(i + 1).padStart(4);
    const fid = `#${s.founderId}`.padStart(7);
    const live = String(s.liveCount).padStart(6);
    const peak = String(s.peakCount).padStart(6);
    const age = String(Math.max(0, tick - s.firstTick)).padStart(7);
    lines.push(`  ${rank}  ${fid} ${live} ${peak} ${age}`);
  }
  return lines;
}

/** Render the live champion board into the panel element (read-only). */
export function renderHallOfFame(world: World, panel: HTMLElement): void {
  panel.textContent = formatHallOfFame(world.lineageBoard.slice(), world.tickCount).join('\n');
}
