// Tidepool kernel benchmark, TypeScript variant. rust/src/lib.rs mirrors this file phase for phase.

export type Profile = 'S' | 'L';

// [nHid lo, nHid hi, nConn lo, nConn hi]
const PROFILES: Record<Profile, readonly [number, number, number, number]> = {
  S: [4, 16, 30, 90],
  L: [24, 72, 150, 350],
};

const GW = 64; // world 2048 x 8192, hash cell 32
const GH = 256;
const NCELL = GW * GH;
const INV_CELL = 1 / 32;
const SW = 256; // scent grid, cell 8
const SH = 1024;
const INV_SCELL = 1 / 8;
const MAX_X = 2047.5;
const MAX_Y = 8191.5;
const NBLOB = 40;
const SIGMA = 160;
const PI = 3.141592653589793;
const TAU = 6.283185307179586;
const SQRT3 = 1.7320508075688772;
const EYE_SPREAD = 1.2;
const RANGE = 96; // 3 hash cells, so an eye scan is the 7x7 block around the own cell
const RANGE2 = RANGE * RANGE;
const COS_HALF = 0.8253356149; // cos(0.6)
const SIN_HALF = 0.5646424734; // sin(0.6)
const COS2 = COS_HALF * COS_HALF;
const NFIXED = 6;
const NOUT = 6;
const TURN = 0.2;
const THRUST = 0.3;
const DRAG = 0.9;
const VMAX = 4;
const REPEL = 0.2;
const BODY_REACH = 16; // max sum of radii
const CONTACT = 1.25;
const CONTACT_REACH = 24; // 1.25 * 16 + VMAX: the hash is one integration step stale in the contact phase
const BITE = 0.01;
const DEPOSIT = 0.05;
const DIFF = 0.2;
const DECAY = 0.98;

export class Sim {
  readonly n: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly heading: Float32Array;
  readonly hc: Float32Array;
  readonly hs: Float32Array;
  readonly energy: Float32Array;
  readonly radius: Float32Array;
  readonly nEyes: Uint16Array;
  readonly eyeOff: Float32Array;
  readonly eyeC: Float32Array;
  readonly eyeS: Float32Array;
  readonly nIn: Uint16Array;
  readonly nNeur: Uint16Array;
  readonly neurOff: Uint32Array;
  readonly outOff: Uint32Array;
  readonly connOff: Uint32Array;
  readonly connCnt: Uint32Array;
  readonly bias: Float32Array;
  cur: Float32Array;
  nxt: Float32Array;
  readonly cSrc: Uint16Array;
  readonly cDst: Uint16Array;
  readonly cW: Float32Array;
  readonly cellOf: Uint32Array;
  readonly cellStart: Uint32Array;
  readonly cursor: Uint32Array;
  readonly sorted: Uint32Array;
  scent: Float32Array;
  scent2: Float32Array;
  // per-eye scratch for the sense scan
  readonly eAx = new Float64Array(4);
  readonly eAy = new Float64Array(4);
  readonly eBd = new Float64Array(4);
  readonly eBj = new Int32Array(4);
  // work counters, cumulative since construction
  conns = 0;
  cands = 0;
  eyes = 0;

  constructor(n: number, profile: Profile, seed: number) {
    const [hidLo, hidHi, connLo, connHi] = PROFILES[profile];
    this.n = n;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.heading = new Float32Array(n);
    this.hc = new Float32Array(n);
    this.hs = new Float32Array(n);
    this.energy = new Float32Array(n);
    this.radius = new Float32Array(n);
    this.nEyes = new Uint16Array(n);
    this.eyeOff = new Float32Array(n * 4);
    this.eyeC = new Float32Array(n * 4);
    this.eyeS = new Float32Array(n * 4);
    this.nIn = new Uint16Array(n);
    this.nNeur = new Uint16Array(n);
    this.neurOff = new Uint32Array(n);
    this.outOff = new Uint32Array(n);
    this.connOff = new Uint32Array(n);
    this.connCnt = new Uint32Array(n);
    this.cellOf = new Uint32Array(n);
    this.cellStart = new Uint32Array(NCELL + 1);
    this.cursor = new Uint32Array(NCELL);
    this.sorted = new Uint32Array(n);
    this.scent = new Float32Array(SW * SH);
    this.scent2 = new Float32Array(SW * SH);

    const maxNeur = n * (NFIXED + 12 + hidHi + NOUT);
    const maxConn = n * connHi;
    const bias = new Float32Array(maxNeur);
    const cSrc = new Uint16Array(maxConn);
    const cDst = new Uint16Array(maxConn);
    const cW = new Float32Array(maxConn);

    // xorshift32. All init arithmetic is f64 rounded once to f32, so Rust reproduces it bit for bit.
    let s = seed >>> 0;
    const next = (): number => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      return s;
    };
    const uni = (): number => next() / 4294967296;
    const gauss = (): number => {
      const a = uni();
      const b = uni();
      const c = uni();
      const d = uni();
      return (a + b + c + d - 2) * SQRT3;
    };

    const bx = new Float64Array(NBLOB);
    const by = new Float64Array(NBLOB);
    for (let b = 0; b < NBLOB; b++) {
      bx[b] = 100 + uni() * 1848;
      by[b] = 100 + uni() * 7992;
    }

    const tSrc = new Uint16Array(connHi);
    const tDst = new Uint16Array(connHi);
    const tW = new Float64Array(connHi);
    const pos = new Uint32Array(hidHi + NOUT + 1);
    let T = 0;
    let C = 0;
    for (let i = 0; i < n; i++) {
      const b = next() % NBLOB;
      let px: number;
      let py: number;
      do {
        px = bx[b] + gauss() * SIGMA;
        py = by[b] + gauss() * SIGMA;
      } while (px < 0 || px > MAX_X || py < 0 || py > MAX_Y);
      this.x[i] = px;
      this.y[i] = py;
      this.heading[i] = (uni() * 2 - 1) * PI;
      this.radius[i] = 4 + uni() * 4;
      this.energy[i] = 0.5 + uni();
      const ne = 1 + (next() % 4);
      this.nEyes[i] = ne;
      for (let e = 0; e < 4; e++) this.eyeOff[i * 4 + e] = (uni() * 2 - 1) * EYE_SPREAD;
      const nin = NFIXED + 3 * ne;
      const nh = hidLo + (next() % (hidHi - hidLo + 1));
      const nc = connLo + (next() % (connHi - connLo + 1));
      const nn = nin + nh + NOUT;
      this.nIn[i] = nin;
      this.nNeur[i] = nn;
      this.neurOff[i] = T;
      this.outOff[i] = T + nin + nh;
      for (let k = 0; k < nn; k++) bias[T + k] = uni() * 2 - 1;
      T += nn;

      const nd = nh + NOUT;
      for (let c = 0; c < nc; c++) {
        tSrc[c] = next() % nn;
        tDst[c] = nin + (next() % nd);
        tW[c] = uni() * 2 - 1;
      }
      // stable counting sort by dst
      pos.fill(0, 0, nd + 1);
      for (let c = 0; c < nc; c++) pos[tDst[c] - nin + 1]++;
      for (let k = 0; k < nd; k++) pos[k + 1] += pos[k];
      for (let c = 0; c < nc; c++) {
        const p = C + pos[tDst[c] - nin]++;
        cSrc[p] = tSrc[c];
        cDst[p] = tDst[c];
        cW[p] = tW[c];
      }
      this.connOff[i] = C;
      this.connCnt[i] = nc;
      C += nc;
    }
    this.bias = bias.subarray(0, T);
    this.cur = new Float32Array(T);
    this.nxt = new Float32Array(T);
    this.cSrc = cSrc.subarray(0, C);
    this.cDst = cDst.subarray(0, C);
    this.cW = cW.subarray(0, C);

    // Derived caches. Platform trig, so not part of stateHash.
    for (let i = 0; i < n; i++) {
      this.hc[i] = Math.cos(this.heading[i]);
      this.hs[i] = Math.sin(this.heading[i]);
    }
    for (let k = 0; k < n * 4; k++) {
      this.eyeC[k] = Math.cos(this.eyeOff[k]);
      this.eyeS[k] = Math.sin(this.eyeOff[k]);
    }
  }

  /** FNV-1a over the init state bytes, in the same array order as the Rust variant. */
  stateHash(): number {
    let h = 2166136261;
    const arrays = [
      this.x,
      this.y,
      this.heading,
      this.radius,
      this.energy,
      this.eyeOff,
      this.nEyes,
      this.nIn,
      this.nNeur,
      this.neurOff,
      this.connOff,
      this.connCnt,
      this.bias,
      this.cSrc,
      this.cDst,
      this.cW,
    ];
    for (const a of arrays) {
      const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
      for (let k = 0; k < bytes.length; k++) h = Math.imul(h ^ bytes[k], 16777619);
    }
    return h >>> 0;
  }

  // Phase 1: counting-sort spatial hash.
  grid(): void {
    const n = this.n;
    const x = this.x;
    const y = this.y;
    const cellOf = this.cellOf;
    const cellStart = this.cellStart;
    const cursor = this.cursor;
    const sorted = this.sorted;
    cellStart.fill(0);
    for (let i = 0; i < n; i++) {
      const c = ((y[i] * INV_CELL) | 0) * GW + ((x[i] * INV_CELL) | 0);
      cellOf[i] = c;
      cellStart[c + 1]++;
    }
    for (let c = 0; c < NCELL; c++) {
      cursor[c] = cellStart[c];
      cellStart[c + 1] += cellStart[c];
    }
    for (let i = 0; i < n; i++) sorted[cursor[cellOf[i]]++] = i;
  }

  // Phase 2: fixed inputs plus nearest-in-cone per eye, written into the brain's input neurons.
  sense(): void {
    const n = this.n;
    const x = this.x;
    const y = this.y;
    const vx = this.vx;
    const vy = this.vy;
    const hc = this.hc;
    const hs = this.hs;
    const energy = this.energy;
    const radius = this.radius;
    const nEyes = this.nEyes;
    const eyeC = this.eyeC;
    const eyeS = this.eyeS;
    const neurOff = this.neurOff;
    const cur = this.cur;
    const scent = this.scent;
    const cellStart = this.cellStart;
    const sorted = this.sorted;
    const ax = this.eAx;
    const ay = this.eAy;
    const bd = this.eBd;
    const bj = this.eBj;
    let cands = 0;
    let eyes = 0;
    for (let i = 0; i < n; i++) {
      const px = x[i];
      const py = y[i];
      const c = hc[i];
      const s = hs[i];
      const ne = nEyes[i];
      const base = neurOff[i];

      const gx = (px * INV_SCELL) | 0;
      const gy = (py * INV_SCELL) | 0;
      const xl = gx > 0 ? gx - 1 : 0;
      const xr = gx < SW - 1 ? gx + 1 : SW - 1;
      const yu = gy > 0 ? gy - 1 : 0;
      const yd = gy < SH - 1 ? gy + 1 : SH - 1;
      const row = gy * SW;
      const ddx = (scent[row + xr] - scent[row + xl]) * 0.5;
      const ddy = (scent[yd * SW + gx] - scent[yu * SW + gx]) * 0.5;
      cur[base] = ddx * c + ddy * s;
      cur[base + 1] = ddy * c - ddx * s;
      cur[base + 2] = scent[row + gx];
      cur[base + 3] = energy[i];
      cur[base + 4] = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
      cur[base + 5] = 1;

      for (let e = 0; e < ne; e++) {
        const ec = eyeC[i * 4 + e];
        const es = eyeS[i * 4 + e];
        ax[e] = c * ec - s * es;
        ay[e] = s * ec + c * es;
        bd[e] = RANGE2;
        bj[e] = -1;
      }
      const cx = (px * INV_CELL) | 0;
      const cy = (py * INV_CELL) | 0;
      const cx0 = cx > 3 ? cx - 3 : 0;
      const cx1 = cx < GW - 4 ? cx + 3 : GW - 1;
      const cy0 = cy > 3 ? cy - 3 : 0;
      const cy1 = cy < GH - 4 ? cy + 3 : GH - 1;
      for (let gcy = cy0; gcy <= cy1; gcy++) {
        // cells are row-major, so one row of cells is one contiguous run of `sorted`
        const k0 = cellStart[gcy * GW + cx0];
        const k1 = cellStart[gcy * GW + cx1 + 1];
        cands += k1 - k0;
        for (let k = k0; k < k1; k++) {
          const j = sorted[k];
          const dx = x[j] - px;
          const dy = y[j] - py;
          const d2 = dx * dx + dy * dy;
          if (d2 >= RANGE2 || d2 === 0) continue; // d2 === 0 also rejects self
          for (let e = 0; e < ne; e++) {
            if (d2 < bd[e]) {
              const dot = dx * ax[e] + dy * ay[e];
              if (dot > 0 && dot * dot >= COS2 * d2) {
                bd[e] = d2;
                bj[e] = j;
              }
            }
          }
        }
      }
      for (let e = 0; e < ne; e++) {
        const o = base + NFIXED + 3 * e;
        const j = bj[e];
        if (j >= 0) {
          const d = Math.sqrt(bd[e]);
          const dx = x[j] - px;
          const dy = y[j] - py;
          cur[o] = 1 - d / RANGE;
          cur[o + 1] = (ax[e] * dy - ay[e] * dx) / (d * SIN_HALF);
          cur[o + 2] = radius[j] * 0.125;
        } else {
          cur[o] = 0;
          cur[o + 1] = 0;
          cur[o + 2] = 0;
        }
      }
      eyes += ne;
    }
    this.cands += cands;
    this.eyes += eyes;
  }

  // Phase 3: one double-buffered step of every recurrent net.
  brain(): void {
    const n = this.n;
    const nIn = this.nIn;
    const nNeur = this.nNeur;
    const neurOff = this.neurOff;
    const connOff = this.connOff;
    const connCnt = this.connCnt;
    const bias = this.bias;
    const cur = this.cur;
    const nxt = this.nxt;
    const cSrc = this.cSrc;
    const cDst = this.cDst;
    const cW = this.cW;
    let conns = 0;
    for (let i = 0; i < n; i++) {
      const off = neurOff[i];
      const nn = nNeur[i];
      let c = connOff[i];
      const end = c + connCnt[i];
      for (let j = nIn[i]; j < nn; j++) {
        let sum = bias[off + j];
        while (c < end && cDst[c] === j) {
          sum += cW[c] * cur[off + cSrc[c]];
          c++;
        }
        if (sum > 3) sum = 3;
        else if (sum < -3) sum = -3;
        const s2 = sum * sum;
        nxt[off + j] = (sum * (27 + s2)) / (27 + 9 * s2);
      }
      conns += connCnt[i];
    }
    this.conns += conns;
    this.cur = nxt;
    this.nxt = cur;
  }

  // Phase 4: turn, thrust, drag, soft repulsion, then integrate and clamp.
  act(): void {
    const n = this.n;
    const x = this.x;
    const y = this.y;
    const vx = this.vx;
    const vy = this.vy;
    const heading = this.heading;
    const hc = this.hc;
    const hs = this.hs;
    const radius = this.radius;
    const outOff = this.outOff;
    const cur = this.cur;
    const cellStart = this.cellStart;
    const sorted = this.sorted;
    for (let i = 0; i < n; i++) {
      const o = outOff[i];
      let h = heading[i] + cur[o] * TURN;
      if (h > PI) h -= TAU;
      else if (h < -PI) h += TAU;
      heading[i] = h;
      const c = Math.cos(h);
      const s = Math.sin(h);
      hc[i] = c;
      hs[i] = s;
      const th = cur[o + 1] * THRUST;
      let fx = c * th;
      let fy = s * th;
      const px = x[i];
      const py = y[i];
      const ri = radius[i];
      let cx0 = ((px - BODY_REACH) * INV_CELL) | 0;
      if (cx0 < 0) cx0 = 0;
      let cx1 = ((px + BODY_REACH) * INV_CELL) | 0;
      if (cx1 > GW - 1) cx1 = GW - 1;
      let cy0 = ((py - BODY_REACH) * INV_CELL) | 0;
      if (cy0 < 0) cy0 = 0;
      let cy1 = ((py + BODY_REACH) * INV_CELL) | 0;
      if (cy1 > GH - 1) cy1 = GH - 1;
      for (let gcy = cy0; gcy <= cy1; gcy++) {
        const k0 = cellStart[gcy * GW + cx0];
        const k1 = cellStart[gcy * GW + cx1 + 1];
        for (let k = k0; k < k1; k++) {
          const j = sorted[k];
          const dx = px - x[j];
          const dy = py - y[j];
          const rs = ri + radius[j];
          const d2 = dx * dx + dy * dy;
          if (d2 < rs * rs && d2 > 0) {
            const d = Math.sqrt(d2);
            const f = ((rs - d) / d) * REPEL;
            fx += dx * f;
            fy += dy * f;
          }
        }
      }
      let nvx = (vx[i] + fx) * DRAG;
      if (nvx > VMAX) nvx = VMAX;
      else if (nvx < -VMAX) nvx = -VMAX;
      let nvy = (vy[i] + fy) * DRAG;
      if (nvy > VMAX) nvy = VMAX;
      else if (nvy < -VMAX) nvy = -VMAX;
      vx[i] = nvx;
      vy[i] = nvy;
    }
    // positions move only after every velocity is known, so the hash stays valid above
    for (let i = 0; i < n; i++) {
      let px = x[i] + vx[i];
      if (px < 0) px = 0;
      else if (px > MAX_X) px = MAX_X;
      let py = y[i] + vy[i];
      if (py < 0) py = 0;
      else if (py > MAX_Y) py = MAX_Y;
      x[i] = px;
      y[i] = py;
    }
  }

  // Phase 5: the larger of each touching pair takes energy if its output 2 is positive.
  contact(): void {
    const n = this.n;
    const x = this.x;
    const y = this.y;
    const energy = this.energy;
    const radius = this.radius;
    const outOff = this.outOff;
    const cur = this.cur;
    const cellStart = this.cellStart;
    const sorted = this.sorted;
    for (let i = 0; i < n; i++) {
      if (!(cur[outOff[i] + 2] > 0)) continue;
      const px = x[i];
      const py = y[i];
      const ri = radius[i];
      let cx0 = ((px - CONTACT_REACH) * INV_CELL) | 0;
      if (cx0 < 0) cx0 = 0;
      let cx1 = ((px + CONTACT_REACH) * INV_CELL) | 0;
      if (cx1 > GW - 1) cx1 = GW - 1;
      let cy0 = ((py - CONTACT_REACH) * INV_CELL) | 0;
      if (cy0 < 0) cy0 = 0;
      let cy1 = ((py + CONTACT_REACH) * INV_CELL) | 0;
      if (cy1 > GH - 1) cy1 = GH - 1;
      let gain = 0;
      for (let gcy = cy0; gcy <= cy1; gcy++) {
        const k0 = cellStart[gcy * GW + cx0];
        const k1 = cellStart[gcy * GW + cx1 + 1];
        for (let k = k0; k < k1; k++) {
          const j = sorted[k];
          const rj = radius[j];
          if (rj > ri || (rj === ri && j <= i)) continue; // i must be the larger; index breaks ties
          const dx = x[j] - px;
          const dy = y[j] - py;
          const rs = (ri + rj) * CONTACT;
          if (dx * dx + dy * dy < rs * rs) {
            const ej = energy[j];
            const amt = ej < BITE ? ej : BITE;
            energy[j] = ej - amt;
            gain += amt;
          }
        }
      }
      energy[i] += gain;
    }
  }

  // Phase 6: deposit, then one 5-point diffusion step with decay into the second buffer.
  diffuse(): void {
    const n = this.n;
    const x = this.x;
    const y = this.y;
    const a = this.scent;
    const out = this.scent2;
    for (let i = 0; i < n; i++)
      a[((y[i] * INV_SCELL) | 0) * SW + ((x[i] * INV_SCELL) | 0)] += DEPOSIT;
    for (let yy = 0; yy < SH; yy++) {
      const r = yy * SW;
      const ru = (yy > 0 ? yy - 1 : 0) * SW;
      const rd = (yy < SH - 1 ? yy + 1 : SH - 1) * SW;
      const c0 = a[r];
      out[r] = (c0 + DIFF * (c0 + a[r + 1] + a[ru] + a[rd] - 4 * c0)) * DECAY;
      for (let xx = 1; xx < SW - 1; xx++) {
        const c = a[r + xx];
        out[r + xx] =
          (c + DIFF * (a[r + xx - 1] + a[r + xx + 1] + a[ru + xx] + a[rd + xx] - 4 * c)) * DECAY;
      }
      const e = SW - 1;
      const c1 = a[r + e];
      out[r + e] = (c1 + DIFF * (a[r + e - 1] + c1 + a[ru + e] + a[rd + e] - 4 * c1)) * DECAY;
    }
    this.scent = out;
    this.scent2 = a;
  }

  phase(p: number): void {
    if (p === 0) this.grid();
    else if (p === 1) this.sense();
    else if (p === 2) this.brain();
    else if (p === 3) this.act();
    else if (p === 4) this.contact();
    else this.diffuse();
  }

  run(ticks: number): void {
    for (let t = 0; t < ticks; t++) {
      this.grid();
      this.sense();
      this.brain();
      this.act();
      this.contact();
      this.diffuse();
    }
  }

  counter(k: number): number {
    return k === 0 ? this.conns : k === 1 ? this.cands : this.eyes;
  }

  /** 0 mean speed, 1 mean |output|, 2 mean neighbours within eye range, 3 total energy, 4 energy sd, 5 scent sum. */
  stat(k: number): number {
    const n = this.n;
    let acc = 0;
    if (k === 0) {
      for (let i = 0; i < n; i++)
        acc += Math.sqrt(this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i]);
      return acc / n;
    }
    if (k === 1) {
      for (let i = 0; i < n; i++)
        for (let o = 0; o < NOUT; o++) acc += Math.abs(this.cur[this.outOff[i] + o]);
      return acc / (n * NOUT);
    }
    if (k === 2) {
      this.grid();
      for (let i = 0; i < n; i++) {
        const cx = (this.x[i] * INV_CELL) | 0;
        const cy = (this.y[i] * INV_CELL) | 0;
        for (let gcy = Math.max(0, cy - 3); gcy <= Math.min(GH - 1, cy + 3); gcy++) {
          const k0 = this.cellStart[gcy * GW + Math.max(0, cx - 3)];
          const k1 = this.cellStart[gcy * GW + Math.min(GW - 1, cx + 3) + 1];
          for (let q = k0; q < k1; q++) {
            const j = this.sorted[q];
            const dx = this.x[j] - this.x[i];
            const dy = this.y[j] - this.y[i];
            if (j !== i && dx * dx + dy * dy < RANGE2) acc++;
          }
        }
      }
      return acc / n;
    }
    if (k === 3 || k === 4) {
      let sq = 0;
      for (let i = 0; i < n; i++) {
        acc += this.energy[i];
        sq += this.energy[i] * this.energy[i];
      }
      const mean = acc / n;
      return k === 3 ? acc : Math.sqrt(sq / n - mean * mean);
    }
    for (let c = 0; c < SW * SH; c++) acc += this.scent[c];
    return acc;
  }
}
