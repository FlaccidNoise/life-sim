import { type Genome } from './genome';

/**
 * A developed body in abstract LOCAL space (seed at origin, heading 0) — the output of
 * deterministic isolated development (§4.7). Flat parallel arrays indexed by instance
 * 0..count-1 (instance order = BFS emit order = allocation order at instantiation). Bonds
 * carry local-instance endpoints + relative stiffness (rest length is computed from world
 * positions at instantiation, matching spawnSwimmer). `totalEnergy` is the maternal
 * provisioning requirement; `truncated` is set if a cap fired.
 */
export interface DevelopedBody {
  count: number;
  geneOf: number[];
  cellType: number[];
  radius: number[];
  mass: number[];
  initialEnergy: number[];
  bias: number[];
  sensorChannel: number[];
  localX: number[];
  localY: number[];
  localHeading: number[];
  bonds: { a: number; b: number; stiffness: number }[];
  synapses: { pre: number; post: number; weight: number }[];
  motors: { mover: number; turn: number; thrust: number }[];
  totalEnergy: number;
  truncated: boolean;
}

const TWO_PI = Math.PI * 2;

/**
 * Grow `genome` into a `DevelopedBody`. PURE — draws NO RNG (the seed→reproducible-body
 * guarantee), so two calls with the same genome are byte-identical. BFS over a rule queue
 * (children appended → processed level-order); turtle-graphics placement. Bounded by
 * `maxCells` (cells-per-organism cap) + `maxDepth` (recursion cap); either sets `truncated`.
 * Task 4 appends the gene-keyed bond/connection/motor tables.
 */
export function develop(genome: Genome, maxCells: number, maxDepth: number): DevelopedBody {
  const body: DevelopedBody = {
    count: 0,
    geneOf: [],
    cellType: [],
    radius: [],
    mass: [],
    initialEnergy: [],
    bias: [],
    sensorChannel: [],
    localX: [],
    localY: [],
    localHeading: [],
    bonds: [],
    synapses: [],
    motors: [],
    totalEnergy: 0,
    truncated: false,
  };
  const genes = genome.genes;
  const seed = genome.seedGene;
  if (seed < 0 || seed >= genes.length || maxCells <= 0) return body;

  const depthOf: number[] = [];
  const emit = (gene: number, x: number, y: number, heading: number, depth: number): number => {
    const gn = genes[gene]!;
    const i = body.count++;
    body.geneOf[i] = gene;
    body.cellType[i] = gn.cellType;
    body.radius[i] = gn.radius;
    body.mass[i] = gn.mass;
    body.initialEnergy[i] = gn.initialEnergy;
    body.bias[i] = gn.bias;
    body.sensorChannel[i] = gn.sensorChannel;
    body.localX[i] = x;
    body.localY[i] = y;
    body.localHeading[i] = heading;
    depthOf[i] = depth;
    body.totalEnergy += gn.initialEnergy;
    return i;
  };

  emit(seed, 0, 0, 0, 0);
  for (let head = 0; head < body.count; head++) {
    const parentGene = body.geneOf[head]!;
    const px = body.localX[head]!;
    const py = body.localY[head]!;
    const ph = body.localHeading[head]!;
    const pd = depthOf[head]!;
    for (let ri = 0; ri < genome.divisionRules.length; ri++) {
      const rule = genome.divisionRules[ri]!;
      if (rule.parentGene !== parentGene) continue;
      if (rule.childGene < 0 || rule.childGene >= genes.length) continue;
      const reps = rule.repeat > 0 ? rule.repeat : 1;
      const stepAngle = TWO_PI / reps;
      for (let k = 0; k < reps; k++) {
        if (pd + 1 > maxDepth) {
          body.truncated = true;
          break;
        }
        if (body.count >= maxCells) {
          body.truncated = true;
          return body;
        }
        const ch = ph + rule.angle + k * stepAngle;
        const cx = px + rule.dist * Math.cos(ch);
        const cy = py + rule.dist * Math.sin(ch);
        const child = emit(rule.childGene, cx, cy, ch, pd + 1);
        body.bonds.push({ a: head, b: child, stiffness: rule.stiffness });
      }
    }
  }

  // Gene → its instance indices, for the gene-keyed rule tables.
  const instOf: number[][] = [];
  for (let gi = 0; gi < genes.length; gi++) instOf[gi] = [];
  for (let i = 0; i < body.count; i++) instOf[body.geneOf[i]!]!.push(i);

  // Bond rules: a bond between every instance-pair of (geneA, geneB) — non-tree cohesion.
  for (let ri = 0; ri < genome.bondRules.length; ri++) {
    const r = genome.bondRules[ri]!;
    const as = instOf[r.geneA];
    const bs = instOf[r.geneB];
    if (!as || !bs) continue;
    if (r.geneA === r.geneB) {
      for (let p = 0; p < as.length; p++)
        for (let q = p + 1; q < as.length; q++)
          body.bonds.push({ a: as[p]!, b: as[q]!, stiffness: r.stiffness });
    } else {
      for (let p = 0; p < as.length; p++)
        for (let q = 0; q < bs.length; q++)
          body.bonds.push({ a: as[p]!, b: bs[q]!, stiffness: r.stiffness });
    }
  }

  // Connection rules: a synapse between every instance-pair (preGene → postGene), §4.6.
  for (let ri = 0; ri < genome.connectionRules.length; ri++) {
    const r = genome.connectionRules[ri]!;
    const ps = instOf[r.preGene];
    const qs = instOf[r.postGene];
    if (!ps || !qs) continue;
    for (let p = 0; p < ps.length; p++)
      for (let q = 0; q < qs.length; q++) {
        const pre = ps[p]!;
        const post = qs[q]!;
        if (pre !== post) body.synapses.push({ pre, post, weight: r.weight });
      }
  }

  // Motor rules: bind the k-th instances (1:1 for singleton genes — the critter).
  for (let ri = 0; ri < genome.motorRules.length; ri++) {
    const r = genome.motorRules[ri]!;
    const ms = instOf[r.moverGene];
    const ts = instOf[r.turnGene];
    const hs = instOf[r.thrustGene];
    if (!ms || !ts || !hs) continue;
    const n = Math.min(ms.length, ts.length, hs.length);
    for (let k = 0; k < n; k++) body.motors.push({ mover: ms[k]!, turn: ts[k]!, thrust: hs[k]! });
  }

  return body;
}
