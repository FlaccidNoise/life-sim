import { type OrganismTable } from '../organism/organisms';
import { type GenomeStore, type Genome } from '../genome/genome';
import { genomeDistance, SPECIES_THRESHOLD } from '../genome/distance';

/** One species: a greedy cluster of live genomes within SPECIES_THRESHOLD of its representative. */
export interface SpeciesSummary {
  speciesId: number;
  liveCount: number;
  representativeRef: number;
}

/**
 * Greedy speciation of the live genome population (M7 §5, Plan B Phase 5). Scans organisms in
 * ascending id; each genome joins the first existing species whose representative is within
 * `threshold`, else founds a new species (becoming its representative). Recomputed fresh each call
 * (species ids are not stable across samples). Read-only telemetry; deterministic (ascending scan +
 * first-match). Ranked by member count desc, tie-break representativeRef asc.
 */
export function sampleSpecies(
  organisms: OrganismTable,
  genomes: GenomeStore,
  threshold = SPECIES_THRESHOLD,
): SpeciesSummary[] {
  const reps: { genome: Genome; ref: number; count: number }[] = [];
  for (let org = 1; org < organisms.maxOrganisms; org++) {
    if (!organisms.isAlive(org) || organisms.cellCount[org]! === 0) continue;
    const ref = organisms.genomeRef[org]!;
    if (ref < 0) continue;
    const g = genomes.get(ref);
    if (g === undefined) continue;
    let placed = false;
    for (const s of reps) {
      if (genomeDistance(g, s.genome) < threshold) {
        s.count++;
        placed = true;
        break;
      }
    }
    if (!placed) reps.push({ genome: g, ref, count: 1 });
  }
  reps.sort((a, b) => b.count - a.count || a.ref - b.ref);
  return reps.map((s, i) => ({ speciesId: i, liveCount: s.count, representativeRef: s.ref }));
}
