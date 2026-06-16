/**
 * Intra-organism energy transfer (§4.5, load-bearing). For each live bond, energy
 * diffuses from the higher-energy endpoint to the lower at `rate · gap`, arriving
 * scaled by `efficiency` (<1; the rest is lost in transit). Without this only
 * autotrophs are viable — it lets photo cells feed structural/neuron/mover siblings.
 * Deterministic (ascending live-bond order); allocation-free. `rate` should be in
 * (0, 0.5] to avoid overshoot/oscillation. Runs at METABOLIZE (§4.3 step 7), just
 * after the per-cell gains/costs so it redistributes the tick's harvest.
 */
export function transferEnergy(
  liveBonds: Uint32Array,
  count: number,
  cellA: Uint32Array,
  cellB: Uint32Array,
  energy: Float32Array,
  rate: number,
  efficiency: number,
): void {
  for (let k = 0; k < count; k++) {
    const s = liveBonds[k]!;
    const a = cellA[s]!;
    const b = cellB[s]!;
    const ea = energy[a]!;
    const eb = energy[b]!;
    if (ea > eb) {
      const m = rate * (ea - eb);
      energy[a] = ea - m;
      energy[b] = eb + m * efficiency;
    } else if (eb > ea) {
      const m = rate * (eb - ea);
      energy[b] = eb - m;
      energy[a] = ea + m * efficiency;
    }
  }
}
