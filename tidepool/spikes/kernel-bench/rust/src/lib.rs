//! Tidepool kernel benchmark, Rust variant. Mirrors ts/kernel.ts phase for phase.
//! Safe indexing throughout, no intrinsics. The only `unsafe` is the C ABI at the bottom.

#[cfg(feature = "par")]
mod par;

const GW: usize = 64; // world 2048 x 8192, hash cell 32
const GH: usize = 256;
const NCELL: usize = GW * GH;
const INV_CELL: f32 = 1.0 / 32.0;
const SW: usize = 256; // scent grid, cell 8
const SH: usize = 1024;
const INV_SCELL: f32 = 1.0 / 8.0;
const MAX_X: f32 = 2047.5;
const MAX_Y: f32 = 8191.5;
const NBLOB: usize = 40;
const SIGMA: f64 = 160.0;
const PI: f32 = 3.141592653589793;
const TAU: f32 = 6.283185307179586;
const SQRT3: f64 = 1.7320508075688772;
const EYE_SPREAD: f64 = 1.2;
const RANGE: f32 = 96.0; // 3 hash cells, so an eye scan is the 7x7 block around the own cell
const RANGE2: f32 = RANGE * RANGE;
const COS_HALF: f32 = 0.8253356149; // cos(0.6)
const SIN_HALF: f32 = 0.5646424734; // sin(0.6)
const COS2: f32 = COS_HALF * COS_HALF;
const NFIXED: usize = 6;
const NOUT: usize = 6;
const TURN: f32 = 0.2;
const THRUST: f32 = 0.3;
const DRAG: f32 = 0.9;
const VMAX: f32 = 4.0;
const REPEL: f32 = 0.2;
const BODY_REACH: f32 = 16.0; // max sum of radii
const CONTACT: f32 = 1.25;
const CONTACT_REACH: f32 = 24.0; // 1.25 * 16 + VMAX: the hash is one integration step stale in the contact phase
const BITE: f32 = 0.01;
const DEPOSIT: f32 = 0.05;
const DIFF: f32 = 0.2;
const DECAY: f32 = 0.98;

struct Rng(u32);

impl Rng {
    fn next(&mut self) -> u32 {
        let mut s = self.0;
        s ^= s << 13;
        s ^= s >> 17;
        s ^= s << 5;
        self.0 = s;
        s
    }
    fn uni(&mut self) -> f64 {
        self.next() as f64 / 4294967296.0
    }
    fn gauss(&mut self) -> f64 {
        let a = self.uni();
        let b = self.uni();
        let c = self.uni();
        let d = self.uni();
        (a + b + c + d - 2.0) * SQRT3
    }
}

pub struct Sim {
    n: usize,
    x: Vec<f32>,
    y: Vec<f32>,
    vx: Vec<f32>,
    vy: Vec<f32>,
    heading: Vec<f32>,
    hc: Vec<f32>,
    hs: Vec<f32>,
    energy: Vec<f32>,
    radius: Vec<f32>,
    n_eyes: Vec<u16>,
    eye_off: Vec<f32>,
    eye_c: Vec<f32>,
    eye_s: Vec<f32>,
    n_in: Vec<u16>,
    n_neur: Vec<u16>,
    neur_off: Vec<u32>,
    out_off: Vec<u32>,
    conn_off: Vec<u32>,
    conn_cnt: Vec<u32>,
    bias: Vec<f32>,
    cur: Vec<f32>,
    nxt: Vec<f32>,
    c_src: Vec<u16>,
    c_dst: Vec<u16>,
    c_w: Vec<f32>,
    cell_of: Vec<u32>,
    cell_start: Vec<u32>,
    cursor: Vec<u32>,
    sorted: Vec<u32>,
    scent: Vec<f32>,
    scent2: Vec<f32>,
    // work counters, cumulative since construction
    conns: u64,
    cands: u64,
    eyes: u64,
}

#[inline(always)]
fn act_fn(x: f32) -> f32 {
    let x = x.clamp(-3.0, 3.0);
    let x2 = x * x;
    x * (27.0 + x2) / (27.0 + 9.0 * x2)
}

fn fnv(mut h: u32, bytes: impl Iterator<Item = u8>) -> u32 {
    for b in bytes {
        h = (h ^ b as u32).wrapping_mul(16777619);
    }
    h
}

impl Sim {
    /// `profile`: 0 = S, anything else = L.
    pub fn new(n: usize, profile: u32, seed: u32) -> Sim {
        let (hid_lo, hid_hi, conn_lo, conn_hi): (u32, u32, u32, u32) =
            if profile == 0 { (4, 16, 30, 90) } else { (24, 72, 150, 350) };
        let mut s = Sim {
            n,
            x: Vec::with_capacity(n),
            y: Vec::with_capacity(n),
            vx: vec![0.0; n],
            vy: vec![0.0; n],
            heading: Vec::with_capacity(n),
            hc: Vec::with_capacity(n),
            hs: Vec::with_capacity(n),
            energy: Vec::with_capacity(n),
            radius: Vec::with_capacity(n),
            n_eyes: Vec::with_capacity(n),
            eye_off: Vec::with_capacity(n * 4),
            eye_c: Vec::with_capacity(n * 4),
            eye_s: Vec::with_capacity(n * 4),
            n_in: Vec::with_capacity(n),
            n_neur: Vec::with_capacity(n),
            neur_off: Vec::with_capacity(n),
            out_off: Vec::with_capacity(n),
            conn_off: Vec::with_capacity(n),
            conn_cnt: Vec::with_capacity(n),
            bias: Vec::new(),
            cur: Vec::new(),
            nxt: Vec::new(),
            c_src: Vec::new(),
            c_dst: Vec::new(),
            c_w: Vec::new(),
            cell_of: vec![0; n],
            cell_start: vec![0; NCELL + 1],
            cursor: vec![0; NCELL],
            sorted: vec![0; n],
            scent: vec![0.0; SW * SH],
            scent2: vec![0.0; SW * SH],
            conns: 0,
            cands: 0,
            eyes: 0,
        };

        // xorshift32. All init arithmetic is f64 rounded once to f32, so it matches the TypeScript bit for bit.
        let mut r = Rng(seed);
        let mut bx = [0f64; NBLOB];
        let mut by = [0f64; NBLOB];
        for b in 0..NBLOB {
            bx[b] = 100.0 + r.uni() * 1848.0;
            by[b] = 100.0 + r.uni() * 7992.0;
        }

        let mut tmp: Vec<(u16, u16, f32)> = Vec::with_capacity(conn_hi as usize);
        let mut pos = vec![0usize; (hid_hi as usize) + NOUT + 1];
        for _ in 0..n {
            let b = (r.next() % NBLOB as u32) as usize;
            let (px, py) = loop {
                let px = bx[b] + r.gauss() * SIGMA;
                let py = by[b] + r.gauss() * SIGMA;
                if !(px < 0.0 || px > MAX_X as f64 || py < 0.0 || py > MAX_Y as f64) {
                    break (px, py);
                }
            };
            s.x.push(px as f32);
            s.y.push(py as f32);
            s.heading.push(((r.uni() * 2.0 - 1.0) * 3.141592653589793) as f32);
            s.radius.push((4.0 + r.uni() * 4.0) as f32);
            s.energy.push((0.5 + r.uni()) as f32);
            let ne = 1 + r.next() % 4;
            s.n_eyes.push(ne as u16);
            for _ in 0..4 {
                s.eye_off.push(((r.uni() * 2.0 - 1.0) * EYE_SPREAD) as f32);
            }
            let nin = NFIXED as u32 + 3 * ne;
            let nh = hid_lo + r.next() % (hid_hi - hid_lo + 1);
            let nc = conn_lo + r.next() % (conn_hi - conn_lo + 1);
            let nn = nin + nh + NOUT as u32;
            let t = s.bias.len() as u32;
            s.n_in.push(nin as u16);
            s.n_neur.push(nn as u16);
            s.neur_off.push(t);
            s.out_off.push(t + nin + nh);
            for _ in 0..nn {
                s.bias.push((r.uni() * 2.0 - 1.0) as f32);
            }

            let nd = nh + NOUT as u32;
            tmp.clear();
            for _ in 0..nc {
                let src = r.next() % nn;
                let dst = nin + r.next() % nd;
                let w = r.uni() * 2.0 - 1.0;
                tmp.push((src as u16, dst as u16, w as f32));
            }
            // stable counting sort by dst
            let nd = nd as usize;
            let nin = nin as usize;
            let c0 = s.c_src.len();
            pos[..=nd].fill(0);
            for &(_, dst, _) in &tmp {
                pos[dst as usize - nin + 1] += 1;
            }
            for k in 0..nd {
                pos[k + 1] += pos[k];
            }
            s.c_src.resize(c0 + tmp.len(), 0);
            s.c_dst.resize(c0 + tmp.len(), 0);
            s.c_w.resize(c0 + tmp.len(), 0.0);
            for &(src, dst, w) in &tmp {
                let p = c0 + pos[dst as usize - nin];
                pos[dst as usize - nin] += 1;
                s.c_src[p] = src;
                s.c_dst[p] = dst;
                s.c_w[p] = w;
            }
            s.conn_off.push(c0 as u32);
            s.conn_cnt.push(nc);
        }
        s.cur = vec![0.0; s.bias.len()];
        s.nxt = vec![0.0; s.bias.len()];

        // Derived caches. Platform trig, so not part of state_hash.
        for i in 0..n {
            s.hc.push(s.heading[i].cos());
            s.hs.push(s.heading[i].sin());
        }
        for k in 0..n * 4 {
            s.eye_c.push(s.eye_off[k].cos());
            s.eye_s.push(s.eye_off[k].sin());
        }
        s
    }

    /// FNV-1a over the init state bytes, in the same array order as the TypeScript variant.
    pub fn state_hash(&self) -> u32 {
        let f = |h, a: &[f32]| fnv(h, a.iter().flat_map(|v| v.to_le_bytes()));
        let u16s = |h, a: &[u16]| fnv(h, a.iter().flat_map(|v| v.to_le_bytes()));
        let u32s = |h, a: &[u32]| fnv(h, a.iter().flat_map(|v| v.to_le_bytes()));
        let mut h = 2166136261u32;
        h = f(h, &self.x);
        h = f(h, &self.y);
        h = f(h, &self.heading);
        h = f(h, &self.radius);
        h = f(h, &self.energy);
        h = f(h, &self.eye_off);
        h = u16s(h, &self.n_eyes);
        h = u16s(h, &self.n_in);
        h = u16s(h, &self.n_neur);
        h = u32s(h, &self.neur_off);
        h = u32s(h, &self.conn_off);
        h = u32s(h, &self.conn_cnt);
        h = f(h, &self.bias);
        h = u16s(h, &self.c_src);
        h = u16s(h, &self.c_dst);
        h = f(h, &self.c_w);
        h
    }

    // Phase 1: counting-sort spatial hash.
    pub fn grid(&mut self) {
        let Sim { n, x, y, cell_of, cell_start, cursor, sorted, .. } = self;
        let n = *n;
        cell_start.fill(0);
        for i in 0..n {
            let c = (y[i] * INV_CELL) as usize * GW + (x[i] * INV_CELL) as usize;
            cell_of[i] = c as u32;
            cell_start[c + 1] += 1;
        }
        for c in 0..NCELL {
            cursor[c] = cell_start[c];
            cell_start[c + 1] += cell_start[c];
        }
        for i in 0..n {
            let c = cell_of[i] as usize;
            sorted[cursor[c] as usize] = i as u32;
            cursor[c] += 1;
        }
    }

    // Phase 2: fixed inputs plus nearest-in-cone per eye, written into the brain's input neurons.
    pub fn sense(&mut self) {
        let Sim {
            n, x, y, vx, vy, hc, hs, energy, radius, n_eyes, eye_c, eye_s, neur_off, cur, scent, cell_start,
            sorted, cands, eyes, ..
        } = self;
        let n = *n;
        let mut cand_acc = 0u64;
        let mut eye_acc = 0u64;
        for i in 0..n {
            let ne = n_eyes[i] as usize;
            let base = neur_off[i] as usize;
            let inp = &mut cur[base..base + NFIXED + 3 * ne];
            cand_acc += sense_one(i, inp, x, y, vx, vy, hc, hs, energy, radius, eye_c, eye_s, scent, cell_start, sorted);
            eye_acc += ne as u64;
        }
        *cands += cand_acc;
        *eyes += eye_acc;
    }

    // Phase 3: one double-buffered step of every recurrent net.
    pub fn brain(&mut self) {
        let Sim { n, n_in, n_neur, neur_off, conn_off, conn_cnt, bias, cur, nxt, c_src, c_dst, c_w, conns, .. } = self;
        let n = *n;
        let mut conn_acc = 0u64;
        for i in 0..n {
            let off = neur_off[i] as usize;
            let nn = n_neur[i] as usize;
            let c0 = conn_off[i] as usize;
            let cnt = conn_cnt[i] as usize;
            brain_one(
                n_in[i] as usize,
                &bias[off..off + nn],
                &cur[off..off + nn],
                &mut nxt[off..off + nn],
                &c_src[c0..c0 + cnt],
                &c_dst[c0..c0 + cnt],
                &c_w[c0..c0 + cnt],
            );
            conn_acc += cnt as u64;
        }
        *conns += conn_acc;
        std::mem::swap(cur, nxt);
    }

    // Phase 4: turn, thrust, drag, soft repulsion, then integrate and clamp.
    pub fn act(&mut self) {
        let Sim { n, x, y, vx, vy, heading, hc, hs, radius, out_off, cur, cell_start, sorted, .. } = self;
        let n = *n;
        for i in 0..n {
            let o = out_off[i] as usize;
            let mut h = heading[i] + cur[o] * TURN;
            if h > PI {
                h -= TAU;
            } else if h < -PI {
                h += TAU;
            }
            heading[i] = h;
            let c = h.cos();
            let s = h.sin();
            hc[i] = c;
            hs[i] = s;
            let th = cur[o + 1] * THRUST;
            let mut fx = c * th;
            let mut fy = s * th;
            let px = x[i];
            let py = y[i];
            let ri = radius[i];
            let cx0 = (((px - BODY_REACH) * INV_CELL) as i32).max(0) as usize;
            let cx1 = (((px + BODY_REACH) * INV_CELL) as usize).min(GW - 1);
            let cy0 = (((py - BODY_REACH) * INV_CELL) as i32).max(0) as usize;
            let cy1 = (((py + BODY_REACH) * INV_CELL) as usize).min(GH - 1);
            for gcy in cy0..=cy1 {
                let k0 = cell_start[gcy * GW + cx0] as usize;
                let k1 = cell_start[gcy * GW + cx1 + 1] as usize;
                for &j in &sorted[k0..k1] {
                    let j = j as usize;
                    let dx = px - x[j];
                    let dy = py - y[j];
                    let rs = ri + radius[j];
                    let d2 = dx * dx + dy * dy;
                    if d2 < rs * rs && d2 > 0.0 {
                        let d = d2.sqrt();
                        let f = (rs - d) / d * REPEL;
                        fx += dx * f;
                        fy += dy * f;
                    }
                }
            }
            vx[i] = ((vx[i] + fx) * DRAG).clamp(-VMAX, VMAX);
            vy[i] = ((vy[i] + fy) * DRAG).clamp(-VMAX, VMAX);
        }
        // positions move only after every velocity is known, so the hash stays valid above
        for i in 0..n {
            x[i] = (x[i] + vx[i]).clamp(0.0, MAX_X);
            y[i] = (y[i] + vy[i]).clamp(0.0, MAX_Y);
        }
    }

    // Phase 5: the larger of each touching pair takes energy if its output 2 is positive.
    pub fn contact(&mut self) {
        let Sim { n, x, y, energy, radius, out_off, cur, cell_start, sorted, .. } = self;
        let n = *n;
        for i in 0..n {
            if !(cur[out_off[i] as usize + 2] > 0.0) {
                continue;
            }
            let px = x[i];
            let py = y[i];
            let ri = radius[i];
            let cx0 = (((px - CONTACT_REACH) * INV_CELL) as i32).max(0) as usize;
            let cx1 = (((px + CONTACT_REACH) * INV_CELL) as usize).min(GW - 1);
            let cy0 = (((py - CONTACT_REACH) * INV_CELL) as i32).max(0) as usize;
            let cy1 = (((py + CONTACT_REACH) * INV_CELL) as usize).min(GH - 1);
            let mut gain = 0.0f32;
            for gcy in cy0..=cy1 {
                let k0 = cell_start[gcy * GW + cx0] as usize;
                let k1 = cell_start[gcy * GW + cx1 + 1] as usize;
                for &j in &sorted[k0..k1] {
                    let j = j as usize;
                    let rj = radius[j];
                    if rj > ri || (rj == ri && j <= i) {
                        continue; // i must be the larger; index breaks ties
                    }
                    let dx = x[j] - px;
                    let dy = y[j] - py;
                    let rs = (ri + rj) * CONTACT;
                    if dx * dx + dy * dy < rs * rs {
                        let ej = energy[j];
                        let amt = if ej < BITE { ej } else { BITE };
                        energy[j] = ej - amt;
                        gain += amt;
                    }
                }
            }
            energy[i] += gain;
        }
    }

    // Phase 6: deposit, then one 5-point diffusion step with decay into the second buffer.
    pub fn diffuse(&mut self) {
        let Sim { n, x, y, scent, scent2, .. } = self;
        let n = *n;
        for i in 0..n {
            scent[(y[i] * INV_SCELL) as usize * SW + (x[i] * INV_SCELL) as usize] += DEPOSIT;
        }
        for yy in 0..SH {
            let r = yy * SW;
            let ru = yy.saturating_sub(1) * SW;
            let rd = (yy + 1).min(SH - 1) * SW;
            let row = &scent[r..r + SW];
            let up = &scent[ru..ru + SW];
            let dn = &scent[rd..rd + SW];
            let out = &mut scent2[r..r + SW];
            let c0 = row[0];
            out[0] = (c0 + DIFF * (c0 + row[1] + up[0] + dn[0] - 4.0 * c0)) * DECAY;
            for xx in 1..SW - 1 {
                let c = row[xx];
                out[xx] = (c + DIFF * (row[xx - 1] + row[xx + 1] + up[xx] + dn[xx] - 4.0 * c)) * DECAY;
            }
            let e = SW - 1;
            let c1 = row[e];
            out[e] = (c1 + DIFF * (row[e - 1] + c1 + up[e] + dn[e] - 4.0 * c1)) * DECAY;
        }
        std::mem::swap(scent, scent2);
    }

    pub fn phase(&mut self, p: u32) {
        match p {
            0 => self.grid(),
            1 => self.sense(),
            2 => self.brain(),
            3 => self.act(),
            4 => self.contact(),
            _ => self.diffuse(),
        }
    }

    pub fn run(&mut self, ticks: u32) {
        for _ in 0..ticks {
            self.grid();
            self.sense();
            self.brain();
            self.act();
            self.contact();
            self.diffuse();
        }
    }

    pub fn counter(&self, k: u32) -> u64 {
        match k {
            0 => self.conns,
            1 => self.cands,
            _ => self.eyes,
        }
    }

    /// 0 mean speed, 1 mean |output|, 2 mean neighbours within eye range, 3 total energy, 4 energy sd, 5 scent sum.
    pub fn stat(&mut self, k: u32) -> f64 {
        let n = self.n;
        let mut acc = 0f64;
        match k {
            0 => {
                for i in 0..n {
                    acc += ((self.vx[i] * self.vx[i] + self.vy[i] * self.vy[i]) as f64).sqrt();
                }
                acc / n as f64
            }
            1 => {
                for i in 0..n {
                    for o in 0..NOUT {
                        acc += self.cur[self.out_off[i] as usize + o].abs() as f64;
                    }
                }
                acc / (n * NOUT) as f64
            }
            2 => {
                self.grid();
                for i in 0..n {
                    let cx = (self.x[i] * INV_CELL) as usize;
                    let cy = (self.y[i] * INV_CELL) as usize;
                    for gcy in cy.saturating_sub(3)..=(cy + 3).min(GH - 1) {
                        let k0 = self.cell_start[gcy * GW + cx.saturating_sub(3)] as usize;
                        let k1 = self.cell_start[gcy * GW + (cx + 3).min(GW - 1) + 1] as usize;
                        for &j in &self.sorted[k0..k1] {
                            let j = j as usize;
                            let dx = self.x[j] - self.x[i];
                            let dy = self.y[j] - self.y[i];
                            if j != i && dx * dx + dy * dy < RANGE2 {
                                acc += 1.0;
                            }
                        }
                    }
                }
                acc / n as f64
            }
            3 | 4 => {
                let mut sq = 0f64;
                for i in 0..n {
                    let e = self.energy[i] as f64;
                    acc += e;
                    sq += e * e;
                }
                let mean = acc / n as f64;
                if k == 3 { acc } else { (sq / n as f64 - mean * mean).sqrt() }
            }
            _ => self.scent.iter().map(|&v| v as f64).sum(),
        }
    }
}

/// Senses for creature `i` into its input neurons. Returns the neighbour candidates visited.
#[inline(always)]
#[allow(clippy::too_many_arguments)]
fn sense_one(
    i: usize,
    inp: &mut [f32],
    x: &[f32],
    y: &[f32],
    vx: &[f32],
    vy: &[f32],
    hc: &[f32],
    hs: &[f32],
    energy: &[f32],
    radius: &[f32],
    eye_c: &[f32],
    eye_s: &[f32],
    scent: &[f32],
    cell_start: &[u32],
    sorted: &[u32],
) -> u64 {
    let px = x[i];
    let py = y[i];
    let c = hc[i];
    let s = hs[i];
    let ne = (inp.len() - NFIXED) / 3;

    let gx = (px * INV_SCELL) as usize;
    let gy = (py * INV_SCELL) as usize;
    let xl = gx.saturating_sub(1);
    let xr = (gx + 1).min(SW - 1);
    let yu = gy.saturating_sub(1);
    let yd = (gy + 1).min(SH - 1);
    let row = gy * SW;
    let ddx = (scent[row + xr] - scent[row + xl]) * 0.5;
    let ddy = (scent[yd * SW + gx] - scent[yu * SW + gx]) * 0.5;
    inp[0] = ddx * c + ddy * s;
    inp[1] = ddy * c - ddx * s;
    inp[2] = scent[row + gx];
    inp[3] = energy[i];
    inp[4] = (vx[i] * vx[i] + vy[i] * vy[i]).sqrt();
    inp[5] = 1.0;

    let mut ax = [0f32; 4];
    let mut ay = [0f32; 4];
    let mut bd = [RANGE2; 4];
    let mut bj = [-1i32; 4];
    for e in 0..ne {
        let ec = eye_c[i * 4 + e];
        let es = eye_s[i * 4 + e];
        ax[e] = c * ec - s * es;
        ay[e] = s * ec + c * es;
    }
    let cx = (px * INV_CELL) as usize;
    let cy = (py * INV_CELL) as usize;
    let cx0 = cx.saturating_sub(3);
    let cx1 = (cx + 3).min(GW - 1);
    let cy0 = cy.saturating_sub(3);
    let cy1 = (cy + 3).min(GH - 1);
    let mut cands = 0u64;
    for gcy in cy0..=cy1 {
        // cells are row-major, so one row of cells is one contiguous run of `sorted`
        let k0 = cell_start[gcy * GW + cx0] as usize;
        let k1 = cell_start[gcy * GW + cx1 + 1] as usize;
        cands += (k1 - k0) as u64;
        for &j in &sorted[k0..k1] {
            let j = j as usize;
            let dx = x[j] - px;
            let dy = y[j] - py;
            let d2 = dx * dx + dy * dy;
            if d2 >= RANGE2 || d2 == 0.0 {
                continue; // d2 == 0 also rejects self
            }
            for e in 0..ne {
                if d2 < bd[e] {
                    let dot = dx * ax[e] + dy * ay[e];
                    if dot > 0.0 && dot * dot >= COS2 * d2 {
                        bd[e] = d2;
                        bj[e] = j as i32;
                    }
                }
            }
        }
    }
    for e in 0..ne {
        let o = NFIXED + 3 * e;
        if bj[e] >= 0 {
            let j = bj[e] as usize;
            let d = bd[e].sqrt();
            let dx = x[j] - px;
            let dy = y[j] - py;
            inp[o] = 1.0 - d / RANGE;
            inp[o + 1] = (ax[e] * dy - ay[e] * dx) / (d * SIN_HALF);
            inp[o + 2] = radius[j] * 0.125;
        } else {
            inp[o] = 0.0;
            inp[o + 1] = 0.0;
            inp[o + 2] = 0.0;
        }
    }
    cands
}

/// One step of one net. All slices are that creature's own neurons and connections.
#[inline(always)]
fn brain_one(nin: usize, bias: &[f32], prev: &[f32], next: &mut [f32], src: &[u16], dst: &[u16], w: &[f32]) {
    let cnt = src.len();
    let mut c = 0;
    for j in nin..next.len() {
        let mut sum = bias[j];
        while c < cnt && dst[c] as usize == j {
            sum += w[c] * prev[src[c] as usize];
            c += 1;
        }
        next[j] = act_fn(sum);
    }
}

// C ABI for the WebAssembly build. The handle is a leaked Box<Sim>.

#[no_mangle]
pub extern "C" fn sim_new(n: u32, profile: u32, seed: u32) -> *mut Sim {
    Box::into_raw(Box::new(Sim::new(n as usize, profile, seed)))
}

/// # Safety
/// `p` must come from `sim_new` and not be used again.
#[no_mangle]
pub unsafe extern "C" fn sim_free(p: *mut Sim) {
    drop(Box::from_raw(p));
}

/// # Safety
/// `p` must be a live handle from `sim_new`.
#[no_mangle]
pub unsafe extern "C" fn sim_run(p: *mut Sim, ticks: u32) {
    (*p).run(ticks);
}

/// # Safety
/// `p` must be a live handle from `sim_new`.
#[no_mangle]
pub unsafe extern "C" fn sim_phase(p: *mut Sim, phase: u32) {
    (*p).phase(phase);
}

/// # Safety
/// `p` must be a live handle from `sim_new`.
#[no_mangle]
pub unsafe extern "C" fn sim_counter(p: *mut Sim, k: u32) -> f64 {
    (*p).counter(k) as f64
}

/// # Safety
/// `p` must be a live handle from `sim_new`.
#[no_mangle]
pub unsafe extern "C" fn sim_stat(p: *mut Sim, k: u32) -> f64 {
    (*p).stat(k)
}

/// # Safety
/// `p` must be a live handle from `sim_new`.
#[no_mangle]
pub unsafe extern "C" fn sim_hash(p: *mut Sim) -> u32 {
    (*p).state_hash()
}
