/**
 * THINK + ACT step + within-life (Baldwin) learning — each creature runs its OWN brain (a heritable
 * per-creature genome, §genome.ts). The brain is a minimal linear sensor→motor map: the food gradient
 * in the heading frame (forward, lateral) → turn + thrust.
 *
 * Two weight sets per creature:
 *  - `brain` (genome): the heritable INSTINCT, copied + mutated at birth. Never changes within a life.
 *  - `learnedBrain` (runtime): what steer() actually reads. Reset to `brain` at birth, then drifts via
 *    reward-modulated Hebbian plasticity (§5.2). Learning dies with the individual — children copy the
 *    genome, never the learned weights, so there is no Lamarckian leak.
 *
 * Because the genome is heritable + mutated, behavior EVOLVES; because the runtime brain learns,
 * behavior also improves WITHIN a single life (and over generations the instinct assimilates what
 * learning keeps discovering, since selection favors genomes that start closer to it).
 */
import { type OrganismStore } from './store';
import { Brain, BRAIN_GENES, ScalarGene, SCALAR_GENE_COUNT, MIN_BAND } from './genome';

/**
 * Run each creature's runtime brain: food gradient (heading frame) → turn + thrust. Turns the heading
 * and SETS the force buffer (repulsion += on top afterward). Turn + thrust are clamped to this
 * creature's OWN evolved MAX_TURN / MAX_THRUST genes, and the resulting force is scaled by its
 * metabolic-efficiency gene (thrifty bodies push weaker). When `learn` is true, also accumulates the
 * per-synapse eligibility trace (pre·post, blended by `eligLambda`) for the later weight update — the
 * trace bridges the gap between a steering decision and the energy reward it earns ticks later.
 */
export function steer(store: OrganismStore, learn: boolean, eligLambda: number): void {
  const { liveIndices, liveCount, heading, senseX, senseY, forceX, forceY, learnedBrain, elig } =
    store;
  const genes = store.scalarGenes;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const sg = i * SCALAR_GENE_COUNT;
    const maxTurn = genes[sg + ScalarGene.MAX_TURN]!;
    const maxThrust = genes[sg + ScalarGene.MAX_THRUST]!;
    const efficiency = genes[sg + ScalarGene.METAB_EFF]!;
    const h = heading[i]!;
    const dx = Math.cos(h);
    const dy = Math.sin(h);
    const gx = senseX[i]!;
    const gy = senseY[i]!;
    const fwd = gx * dx + gy * dy; // food gradient ahead
    const lat = -gx * dy + gy * dx; // food gradient to the left

    const b = i * BRAIN_GENES;
    let turn =
      learnedBrain[b + Brain.LAT_TURN]! * lat +
      learnedBrain[b + Brain.FWD_TURN]! * fwd +
      learnedBrain[b + Brain.TURN_BIAS]!;
    if (turn > maxTurn) turn = maxTurn;
    else if (turn < -maxTurn) turn = -maxTurn;
    const nh = h + turn;
    heading[i] = nh;

    let thrust =
      learnedBrain[b + Brain.LAT_THRUST]! * lat +
      learnedBrain[b + Brain.FWD_THRUST]! * fwd +
      learnedBrain[b + Brain.THRUST_BIAS]!;
    if (thrust < 0) thrust = 0;
    else if (thrust > maxThrust) thrust = maxThrust;
    thrust *= efficiency; // metabolic-efficiency tradeoff: thrifty (low-e) bodies produce less push
    forceX[i] = thrust * Math.cos(nh);
    forceY[i] = thrust * Math.sin(nh);

    if (!learn) continue;
    // Eligibility trace per synapse = pre·post (decayed). pre is the synapse's input (lat, fwd, or the
    // bias' constant 1); post is its motor output (turn for the turn weights, thrust for the thrust
    // weights). post is the PRE-clamp value so a saturated motor still earns credit.
    const turnRaw =
      learnedBrain[b + Brain.LAT_TURN]! * lat +
      learnedBrain[b + Brain.FWD_TURN]! * fwd +
      learnedBrain[b + Brain.TURN_BIAS]!;
    const thrustRaw =
      learnedBrain[b + Brain.LAT_THRUST]! * lat +
      learnedBrain[b + Brain.FWD_THRUST]! * fwd +
      learnedBrain[b + Brain.THRUST_BIAS]!;
    const keep = 1 - eligLambda;
    elig[b + Brain.LAT_TURN] = keep * elig[b + Brain.LAT_TURN]! + eligLambda * lat * turnRaw;
    elig[b + Brain.FWD_TURN] = keep * elig[b + Brain.FWD_TURN]! + eligLambda * fwd * turnRaw;
    elig[b + Brain.TURN_BIAS] = keep * elig[b + Brain.TURN_BIAS]! + eligLambda * turnRaw;
    elig[b + Brain.LAT_THRUST] = keep * elig[b + Brain.LAT_THRUST]! + eligLambda * lat * thrustRaw;
    elig[b + Brain.FWD_THRUST] = keep * elig[b + Brain.FWD_THRUST]! + eligLambda * fwd * thrustRaw;
    elig[b + Brain.THRUST_BIAS] = keep * elig[b + Brain.THRUST_BIAS]! + eligLambda * thrustRaw;
  }
}

/**
 * Energy-gated Hebbian consolidation (run after METABOLIZE, once this tick's energy is known):
 *   gate = clamp( (energy − reproThreshold) / (satiated − reproThreshold), 0, 1 )   // 0=survival, 1=full
 *   w    = clamp( genome + (w − genome)·(1−decay) + learningRate·gate·elig, ±W )
 * Learning EMERGES from the creature's state, not a knob: a well-fed creature consolidates whatever it
 * has recently been doing (the warm eligibility traces), strongest at satiation; a struggling creature
 * (gate ≤ 0) is left untouched — its instinct is preserved for the fight to survive. The learned
 * deviation decays back toward the genome instinct, so it never corrupts (or out-lives) the genome.
 */
export function learn(
  store: OrganismStore,
  learningRate: number,
  weightDecay: number,
  weightClamp: number,
): void {
  const { liveIndices, liveCount, energy, brain, learnedBrain, elig, scalarGenes } = store;
  const keep = 1 - weightDecay;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    // The gate spans the creature's OWN reproductive band (its life-history genes).
    const sg = i * SCALAR_GENE_COUNT;
    const repro = scalarGenes[sg + ScalarGene.REPRO_THRESHOLD]!;
    let satiated = scalarGenes[sg + ScalarGene.SATIATED_THRESHOLD]!;
    if (satiated < repro + MIN_BAND) satiated = repro + MIN_BAND;
    let gate = (energy[i]! - repro) / (satiated - repro);
    if (gate <= 0) continue; // survival mode → freeze the runtime brain (no spare capacity to learn)
    if (gate > 1) gate = 1;
    const rate = learningRate * gate; // peak when satiated
    const b = i * BRAIN_GENES;
    for (let g = 0; g < BRAIN_GENES; g++) {
      const w0 = brain[b + g]!; // genome instinct = the anchor the deviation relaxes toward
      let w = w0 + (learnedBrain[b + g]! - w0) * keep + rate * elig[b + g]!;
      if (w > weightClamp) w = weightClamp;
      else if (w < -weightClamp) w = -weightClamp;
      learnedBrain[b + g] = w;
    }
  }
}
