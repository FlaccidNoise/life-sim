import { type Config } from './config';
import { Rng } from './rng';
import { FoodField } from './food-field';
import { carveNoise } from './wall-gen/noise';
import { carveCA } from './wall-gen/ca';
import { carveRooms } from './wall-gen/rooms';

// Generator palette, indexed by genType. CA (caves) is the pocket-eroding biome (genType 1).
const GENERATORS = [carveNoise, carveCA, carveRooms] as const;
const ERODING_GEN = 1; // CA caves erode food pockets to a small core; noise/rooms keep the full footprint

/**
 * Indestructible terrain on a FINE occupancy grid (decoupled from the coarse food grid). Static,
 * config-derived (a separate Rng seeded from config.seed — never world.rng — so the organism stream is
 * untouched and reset() reproduces it). Owns two derived masks: a food-resolution `foodBlocked` (for
 * damming) and a fine `prox` distance-to-wall field (for the smooth neural wall-sense gradient).
 *
 * Increment 1 ships the noise generator + connectivity guarantee. Voronoi regions + CA/rooms land in
 * Increment 7 behind the same `generate()` (this file's public surface does not change).
 */
const SALT = 0x9e3779b9; // decouples the wall RNG substream from any other config.seed use

function wrapDelta(d: number, size: number): number {
  const h = size * 0.5;
  if (d > h) return d - size;
  if (d < -h) return d + size;
  return d;
}
function wrap(v: number, size: number): number {
  const m = v % size;
  return m < 0 ? m + size : m;
}

export class Walls {
  readonly cols: number;
  readonly rows: number;
  readonly foodCols: number;
  readonly foodRows: number;
  private readonly cellW: number;
  private readonly cellH: number;
  private readonly solid: Uint8Array; // fine occupancy, 0 open / 1 solid
  private readonly foodBlocked: Uint8Array; // food-res derived mask, 1 = dammed
  private readonly prox: Float32Array; // fine clamped hop-distance to nearest solid (cells)
  private readonly proxCap: number;
  private readonly _active: boolean;
  private pocketCells: number[] = []; // fine-cell index of each food-pocket centroid (cached in generate)
  private region: Int32Array = new Int32Array(0); // fine-cell → Voronoi region index (built in generate)
  private regionGen: Int32Array = new Int32Array(0); // region index → genType (which generator carved it)

  constructor(
    private readonly worldWidth: number,
    private readonly worldHeight: number,
    cols: number,
    rows: number,
    cfg: Config,
  ) {
    this.cols = cols;
    this.rows = rows;
    this.foodCols = cfg.foodCols;
    this.foodRows = cfg.foodRows;
    this.cellW = worldWidth / cols;
    this.cellH = worldHeight / rows;
    this.solid = new Uint8Array(cols * rows);
    this.foodBlocked = new Uint8Array(cfg.foodCols * cfg.foodRows);
    this.prox = new Float32Array(cols * rows);
    this.proxCap = Math.max(2, Math.ceil(cfg.wallSenseRange / this.cellW) + 2);
    this._active = cfg.wallRegionCount > 0;
    this.generate(cfg);
  }

  get active(): boolean {
    return this._active;
  }

  private cellIdx(c: number, r: number): number {
    return r * this.cols + c;
  }
  private colOf(x: number): number {
    const c = Math.floor(x / this.cellW);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }
  private rowOf(y: number): number {
    const r = Math.floor(y / this.cellH);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  isSolidAt(x: number, y: number): boolean {
    if (!this._active) return false;
    return this.solid[this.cellIdx(this.colOf(x), this.rowOf(y))] === 1;
  }

  /** PUBLIC read-only accessor: the Voronoi biome index at world position (x,y), or -1 when walls are
   *  inactive. Pure read — no state change, no RNG — so it is determinism-safe (used by region-probe to
   *  partition the world by wall-biome). Mirrors isSolidAt. */
  regionAt(x: number, y: number): number {
    if (!this._active) return -1;
    return this.region[this.cellIdx(this.colOf(x), this.rowOf(y))]!;
  }

  isFoodCellBlocked(foodCol: number, foodRow: number): boolean {
    if (!this._active) return false;
    return this.foodBlocked[foodRow * this.foodCols + foodCol] === 1;
  }
  foodBlockedMask(): Uint8Array {
    return this.foodBlocked;
  }

  /** Toroidal sampled raycast: true if a solid fine cell lies strictly between the two points. */
  losBlocked(x0: number, y0: number, x1: number, y1: number): boolean {
    if (!this._active) return false;
    const dx = wrapDelta(x1 - x0, this.worldWidth);
    const dy = wrapDelta(y1 - y0, this.worldHeight);
    const dist = Math.hypot(dx, dy);
    const steps = Math.ceil(dist / (0.5 * Math.min(this.cellW, this.cellH)));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (this.isSolidAt(wrap(x0 + dx * t, this.worldWidth), wrap(y0 + dy * t, this.worldHeight)))
        return true;
    }
    return false;
  }

  /**
   * Swept (substepped) slide from open (ox,oy) over intended displacement (dx,dy), checked in hops no
   * larger than one wall cell so a fast move cannot tunnel through a thin wall. At each hop the next
   * position is tested toroidally; if solid, the hop's sub-move is axis-separated (try x then y, advance
   * whichever is open, mark the blocked axis; both solid → stop). Returns the final PRE-WRAP position
   * (the caller commits the toroidal wrap) and which axes were blocked.
   */
  sweptCollide(
    ox: number,
    oy: number,
    dx: number,
    dy: number,
  ): { x: number; y: number; blockedX: boolean; blockedY: boolean } {
    const ww = this.worldWidth;
    const wh = this.worldHeight;
    const n = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / Math.min(this.cellW, this.cellH)),
    );
    const hx = dx / n;
    const hy = dy / n;
    let cx = ox;
    let cy = oy;
    let blockedX = false;
    let blockedY = false;
    for (let s = 0; s < n; s++) {
      const nx = cx + hx;
      const ny = cy + hy;
      if (!this.isSolidAt(wrap(nx, ww), wrap(ny, wh))) {
        cx = nx;
        cy = ny;
        continue;
      }
      const xOpen = hx !== 0 && !this.isSolidAt(wrap(nx, ww), wrap(cy, wh));
      const yOpen = hy !== 0 && !this.isSolidAt(wrap(cx, ww), wrap(ny, wh));
      if (xOpen) {
        cx = nx;
        blockedY = true;
      } else if (yOpen) {
        cy = ny;
        blockedX = true;
      } else {
        blockedX = blockedX || hx !== 0;
        blockedY = blockedY || hy !== 0;
        break;
      }
    }
    return { x: cx, y: cy, blockedX, blockedY };
  }

  /** PUBLIC read-only proximity accessor: clamped hop-distance (in fine cells, [0, proxCap]) from the
   *  nearest solid wall cell to the world position (x,y). 0 = on/at a wall, proxCap = "far"/no wall near.
   *  When walls are inactive the whole field is proxCap (uniformly far). Pure read — no state change.
   *  Used by the food field's wall-tied channel placement to bias channel-A pockets toward walls. */
  proximityAt(x: number, y: number): number {
    if (!this._active) return this.proxCap;
    return this.prox[this.cellIdx(this.colOf(x), this.rowOf(y))]!;
  }

  /** Central difference of the proximity field (points AWAY from walls). Zero when inactive. */
  proxGradAt(x: number, y: number, step: number): { gx: number; gy: number } {
    if (!this._active) return { gx: 0, gy: 0 };
    const inv = 1 / (2 * step);
    const ww = this.worldWidth;
    const wh = this.worldHeight;
    const xpos = this.prox[this.cellIdx(this.colOf(wrap(x + step, ww)), this.rowOf(wrap(y, wh)))]!;
    const xneg = this.prox[this.cellIdx(this.colOf(wrap(x - step, ww)), this.rowOf(wrap(y, wh)))]!;
    const ypos = this.prox[this.cellIdx(this.colOf(wrap(x, ww)), this.rowOf(wrap(y + step, wh)))]!;
    const yneg = this.prox[this.cellIdx(this.colOf(wrap(x, ww)), this.rowOf(wrap(y - step, wh)))]!;
    return {
      gx: (xpos - xneg) * inv,
      gy: (ypos - yneg) * inv,
    };
  }

  /** Write the fine grid as 0/255 row-major for the render layer. */
  fillTexture(out: Uint8Array): void {
    for (let i = 0; i < this.solid.length; i++) out[i] = this.solid[i] ? 255 : 0;
  }

  // ── generation ────────────────────────────────────────────────────────────

  private generate(cfg: Config): void {
    if (!this._active) {
      this.deriveMasks();
      return;
    }
    const rng = new Rng((cfg.seed ^ SALT) >>> 0);
    // Inc 7: partition into Voronoi biome regions, carve each by a different generator, composite
    // toroidally. region[i] → regionGen[region[i]] picks which generator's full-grid pattern wins at i.
    this.buildRegions(cfg, rng);
    const { cols, rows } = this;
    const patterns: Uint8Array[] = GENERATORS.map((gen) => {
      const p = new Uint8Array(cols * rows);
      gen(p, cols, rows, cfg.wallDensity, rng); // each consumes rng in a fixed order → deterministic
      return p;
    });
    for (let i = 0; i < this.solid.length; i++)
      this.solid[i] = patterns[this.regionGen[this.region[i]!]!]![i]!;
    this.openPockets(cfg);
    this.connectPockets(cfg);
    this.deriveMasks();
  }

  /** Scatter `wallRegionCount` seeds (wall Rng), assign each fine cell to its nearest seed by toroidal
   *  distance → region map, and give each region a generator (cycled by index). */
  private buildRegions(cfg: Config, rng: Rng): void {
    const { cols, rows } = this;
    const n = cfg.wallRegionCount;
    const seedC = new Float64Array(n);
    const seedR = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      seedC[k] = rng.float() * cols;
      seedR[k] = rng.float() * rows;
    }
    this.regionGen = new Int32Array(n);
    for (let k = 0; k < n; k++) this.regionGen[k] = k % GENERATORS.length;
    this.region = new Int32Array(cols * rows);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        let best = 0;
        let bestD = Infinity;
        for (let k = 0; k < n; k++) {
          const dc = wrapDelta(c - seedC[k]!, cols);
          const dr = wrapDelta(r - seedR[k]!, rows);
          const d = dc * dc + dr * dr;
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
        this.region[r * cols + c] = best;
      }
  }

  /** Force food-pocket cells open. Region-dependent (Inc 7): cells in pocket-eroding biomes (CA caves)
   *  stay walled by the footprint pass and only a `wallPocketCoreRadius` core around each pocket centre is
   *  opened; non-eroding biomes open the full footprint. Uses the pocket fertility map via seedPatches. */
  private openPockets(cfg: Config): void {
    if (cfg.foodPatchCount <= 0) return;
    const fert = this.pocketFertility(cfg);
    const { cols, rows, foodCols, foodRows } = this;
    for (let r = 0; r < rows; r++) {
      const fr = Math.min(foodRows - 1, Math.floor((r / rows) * foodRows));
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (this.regionErodes(i)) continue; // eroding biome: footprint stays walled, core opened below
        const fc = Math.min(foodCols - 1, Math.floor((c / cols) * foodCols));
        if (fert[fr * foodCols + fc]! > 0.3) this.solid[i] = 0;
      }
    }
    // Eroding regions: open just a small core disc around each pocket centre so the pocket isn't sealed.
    const core = cfg.wallPocketCoreRadius;
    for (const p of this.pocketCentroids(cfg)) {
      const cc = this.colOf(p.x);
      const cr = this.rowOf(p.y);
      if (!this.regionErodes(cr * cols + cc)) continue;
      for (let rr = -core; rr <= core; rr++)
        for (let dc = -core; dc <= core; dc++)
          if (rr * rr + dc * dc <= core * core) {
            const oc = (cc + dc + cols) % cols;
            const or = (cr + rr + rows) % rows;
            this.solid[or * cols + oc] = 0;
          }
    }
  }

  private regionErodes(cellIdx: number): boolean {
    return this.regionGen[this.region[cellIdx]!] === ERODING_GEN;
  }

  /** Reproduce the food fertility map deterministically (same SALT-free seed path as the food field). */
  private pocketFertility(cfg: Config): Float32Array {
    const f = new FoodField(
      this.worldWidth,
      this.worldHeight,
      cfg.foodCols,
      cfg.foodRows,
      cfg.foodCap,
      cfg.foodInit,
    );
    const rng = new Rng((cfg.seed ^ (SALT * 3)) >>> 0); // own substream — does not touch world.rng
    f.seedPatches(cfg.foodPatchCount, cfg.foodPatchRadius, cfg.foodBaseFertility, rng);
    return f.fertilityMap();
  }

  /** Carve straight toroidal corridors chaining every pocket centroid → all pockets share a component. */
  private connectPockets(cfg: Config): void {
    if (cfg.foodPatchCount <= 0) return;
    const centroids = this.pocketCentroids(cfg);
    this.pocketCells = centroids.map((p) => this.cellIdx(this.colOf(p.x), this.rowOf(p.y)));
    for (let i = 1; i < centroids.length; i++)
      this.carveCorridor(centroids[i - 1]!, centroids[i]!, cfg.wallCorridorRadius);
  }

  private pocketCentroids(cfg: Config): { x: number; y: number }[] {
    // Same RNG path as seedPatches' centre draws (it draws pc=rng.float()*cols, pr=rng.float()*rows).
    const rng = new Rng((cfg.seed ^ (SALT * 3)) >>> 0);
    const out: { x: number; y: number }[] = [];
    for (let p = 0; p < cfg.foodPatchCount; p++) {
      const pc = rng.float() * cfg.foodCols;
      const pr = rng.float() * cfg.foodRows;
      out.push({
        x: (pc / cfg.foodCols) * this.worldWidth,
        y: (pr / cfg.foodRows) * this.worldHeight,
      });
    }
    return out;
  }

  private carveCorridor(
    a: { x: number; y: number },
    b: { x: number; y: number },
    radius: number,
  ): void {
    const dx = wrapDelta(b.x - a.x, this.worldWidth);
    const dy = wrapDelta(b.y - a.y, this.worldHeight);
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / Math.min(this.cellW, this.cellH)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = this.colOf(wrap(a.x + dx * t, this.worldWidth));
      const cy = this.rowOf(wrap(a.y + dy * t, this.worldHeight));
      for (let rr = -radius; rr <= radius; rr++)
        for (let cc = -radius; cc <= radius; cc++) {
          const c = (cx + cc + this.cols) % this.cols;
          const r = (cy + rr + this.rows) % this.rows;
          this.solid[r * this.cols + c] = 0;
        }
    }
  }

  private deriveMasks(): void {
    this.deriveFoodBlocked();
    this.deriveProx();
  }

  /** A food cell is dammed when > half the fine cells it covers are solid. */
  private deriveFoodBlocked(): void {
    const { cols, rows, foodCols, foodRows } = this;
    const fx = cols / foodCols;
    const fy = rows / foodRows;
    for (let fr = 0; fr < foodRows; fr++)
      for (let fc = 0; fc < foodCols; fc++) {
        let solidN = 0;
        let total = 0;
        for (let r = Math.floor(fr * fy); r < Math.floor((fr + 1) * fy); r++)
          for (let c = Math.floor(fc * fx); c < Math.floor((fc + 1) * fx); c++) {
            total++;
            if (this.solid[r * cols + c]) solidN++;
          }
        this.foodBlocked[fr * foodCols + fc] = total > 0 && solidN * 2 > total ? 1 : 0;
      }
  }

  /** Multi-source toroidal BFS hop-distance to the nearest solid cell, clamped to proxCap. */
  private deriveProx(): void {
    const { cols, rows, proxCap } = this;
    const n = cols * rows;
    const dist = new Int32Array(n).fill(-1);
    let frontier: number[] = [];
    for (let i = 0; i < n; i++)
      if (this.solid[i]) {
        dist[i] = 0;
        frontier.push(i);
      }
    if (frontier.length === 0) {
      this.prox.fill(proxCap); // no walls → uniformly "far", flat gradient
      return;
    }
    let d = 0;
    while (frontier.length && d < proxCap) {
      const next: number[] = [];
      for (const idx of frontier) {
        const c = idx % cols;
        const r = (idx - c) / cols;
        const nbrs = [
          ((r - 1 + rows) % rows) * cols + c,
          ((r + 1) % rows) * cols + c,
          r * cols + ((c - 1 + cols) % cols),
          r * cols + ((c + 1) % cols),
        ];
        for (const ni of nbrs)
          if (dist[ni] === -1) {
            dist[ni] = d + 1;
            next.push(ni);
          }
      }
      frontier = next;
      d++;
    }
    for (let i = 0; i < n; i++)
      this.prox[i] = dist[i] === -1 ? proxCap : Math.min(proxCap, dist[i]!);
  }

  /** Overall solid fraction of the fine grid (0 when inactive). */
  solidFraction(): number {
    if (!this._active) return 0;
    let n = 0;
    for (let i = 0; i < this.solid.length; i++) n += this.solid[i]!;
    return n / this.solid.length;
  }

  /** TEST HELPER: solid fraction of each Voronoi region (distinct generators → distinct densities). */
  regionSolidFractions(): number[] {
    const n = this.regionGen.length;
    const solidN = new Array<number>(n).fill(0);
    const total = new Array<number>(n).fill(0);
    for (let i = 0; i < this.region.length; i++) {
      const k = this.region[i]!;
      total[k]!++;
      if (this.solid[i]) solidN[k]!++;
    }
    return solidN.map((s, k) => (total[k]! > 0 ? s / total[k]! : 0));
  }

  /** TEST HELPER: are all food-pocket centroids in one connected open component? */
  allPocketsConnected(): boolean {
    if (this.pocketCells.length <= 1) return true;
    const { cols, rows } = this;
    const n = cols * rows;
    const seen = new Uint8Array(n);
    const start = this.pocketCells[0]!;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const idx = stack.pop()!;
      const c = idx % cols;
      const r = (idx - c) / cols;
      const nbrs = [
        ((r - 1 + rows) % rows) * cols + c,
        ((r + 1) % rows) * cols + c,
        r * cols + ((c - 1 + cols) % cols),
        r * cols + ((c + 1) % cols),
      ];
      for (const ni of nbrs)
        if (!this.solid[ni] && !seen[ni]) {
          seen[ni] = 1;
          stack.push(ni);
        }
    }
    for (let i = 1; i < this.pocketCells.length; i++) if (!seen[this.pocketCells[i]!]) return false;
    return true;
  }
}
