import { type OrganismTable } from '../organism/organisms';
import { type GenomeStore } from '../genome/genome';

/** One row of the champion hall-of-fame: a currently-LIVE founding lineage. */
export interface LineageSummary {
  founderId: number;
  liveCount: number;
  peakCount: number;
  firstTick: number;
  representativeRef: number;
}

/** Persistent per-lineage accumulator (telemetry — survives across samples on the World). */
export interface LineageStat {
  firstTick: number;
  peakCount: number;
}

/**
 * Sample the live genome-organism population into a ranked board of founding lineages (M7 §5,
 * Plan B Phase 3). Read-only: scans organisms, buckets by `founderId`, updates the persistent
 * `stats` accumulator (peak + first-seen), returns the top-`k` LIVE lineages by member count.
 * Draws no RNG, mutates no SoA — sampled telemetry, NOT part of the byte-identical contract.
 * Allocates Maps, so callers run it at the reduced `metricsEvolutionInterval` cadence.
 */
export function sampleLineages(
  organisms: OrganismTable,
  genomes: GenomeStore,
  stats: Map<number, LineageStat>,
  tick: number,
  k: number,
): LineageSummary[] {
  const liveCounts = new Map<number, number>();
  const repRef = new Map<number, number>(); // founderId -> lowest live genome ref (deterministic)
  for (let org = 1; org < organisms.maxOrganisms; org++) {
    if (!organisms.isAlive(org) || organisms.cellCount[org]! === 0) continue;
    const ref = organisms.genomeRef[org]!;
    if (ref < 0) continue;
    const g = genomes.get(ref);
    if (g === undefined) continue;
    const fid = g.founderId;
    liveCounts.set(fid, (liveCounts.get(fid) ?? 0) + 1);
    const prev = repRef.get(fid);
    if (prev === undefined || ref < prev) repRef.set(fid, ref);
  }

  const out: LineageSummary[] = [];
  for (const [fid, liveCount] of liveCounts) {
    let st = stats.get(fid);
    if (st === undefined) {
      st = { firstTick: tick, peakCount: liveCount };
      stats.set(fid, st);
    } else if (liveCount > st.peakCount) {
      st.peakCount = liveCount;
    }
    out.push({
      founderId: fid,
      liveCount,
      peakCount: st.peakCount,
      firstTick: st.firstTick,
      representativeRef: repRef.get(fid)!,
    });
  }
  // Rank by current size desc, tie-break by founderId asc (deterministic).
  out.sort((a, b) => b.liveCount - a.liveCount || a.founderId - b.founderId);
  return out.slice(0, k);
}
