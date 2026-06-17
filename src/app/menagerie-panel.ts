import { type World } from '../core/sim/world';
import { type SpeciesSummary } from '../core/sim/species-board';
import { genomeSignature } from '../core/genome/traits';

interface MenagerieRow {
  species: SpeciesSummary;
  signature: string;
  generation: number;
}

/** Pure: format species rows into display lines (empty state first). */
export function formatMenagerie(rows: MenagerieRow[]): string[] {
  const lines: string[] = ['MENAGERIE — live species (K)'];
  if (rows.length === 0) {
    lines.push('  no species yet');
    return lines;
  }
  lines.push('  id   live   representative (signature, gen)');
  for (const r of rows) {
    const id = String(r.species.speciesId).padStart(4);
    const live = String(r.species.liveCount).padStart(6);
    lines.push(`  ${id} ${live}   [${r.signature}] g${r.generation}`);
  }
  return lines;
}

/** Render the live species board into the panel element (read-only). */
export function renderMenagerie(world: World, panel: HTMLElement): void {
  const rows: MenagerieRow[] = [];
  for (const species of world.speciesBoard) {
    const g = world.genomes.get(species.representativeRef);
    rows.push({
      species,
      signature: g !== undefined ? genomeSignature(g) : '?',
      generation: g !== undefined ? g.generation : 0,
    });
  }
  panel.textContent = formatMenagerie(rows).join('\n');
}
