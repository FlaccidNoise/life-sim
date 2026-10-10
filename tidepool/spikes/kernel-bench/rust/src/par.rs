//! Stretch variant: the sense and brain phases across threads with rayon. Native only, feature `par`.
//! Every other phase stays single-threaded, so this is an estimate of what threading those two could add.

use crate::{brain_one, sense_one, Sim, NFIXED};
use rayon::prelude::*;

const BLOCK: usize = 64; // creatures per parallel task

/// Splits a neuron pool into one mutable slice per block of creatures.
fn blocks<'a>(pool: &'a mut [f32], neur_off: &[u32], n: usize) -> Vec<(usize, &'a mut [f32])> {
    let mut out = Vec::with_capacity(n / BLOCK + 1);
    let mut rest = pool;
    let mut i0 = 0;
    while i0 < n {
        let i1 = (i0 + BLOCK).min(n);
        let len = if i1 < n { (neur_off[i1] - neur_off[i0]) as usize } else { rest.len() };
        let (head, tail) = std::mem::take(&mut rest).split_at_mut(len);
        out.push((i0, head));
        rest = tail;
        i0 = i1;
    }
    out
}

impl Sim {
    pub fn sense_par(&mut self) {
        let Sim {
            n, x, y, vx, vy, hc, hs, energy, radius, n_eyes, eye_c, eye_s, neur_off, cur, scent, cell_start,
            sorted, cands, eyes, ..
        } = self;
        let n = *n;
        let (c, e) = blocks(cur, neur_off, n)
            .into_par_iter()
            .map(|(i0, block)| {
                let base = neur_off[i0] as usize;
                let mut cand = 0u64;
                let mut eye = 0u64;
                for i in i0..(i0 + BLOCK).min(n) {
                    let ne = n_eyes[i] as usize;
                    let o = neur_off[i] as usize - base;
                    let inp = &mut block[o..o + NFIXED + 3 * ne];
                    cand += sense_one(
                        i, inp, x, y, vx, vy, hc, hs, energy, radius, eye_c, eye_s, scent, cell_start, sorted,
                    );
                    eye += ne as u64;
                }
                (cand, eye)
            })
            .reduce(|| (0, 0), |a, b| (a.0 + b.0, a.1 + b.1));
        *cands += c;
        *eyes += e;
    }

    pub fn brain_par(&mut self) {
        let Sim { n, n_in, n_neur, neur_off, conn_off, conn_cnt, bias, cur, nxt, c_src, c_dst, c_w, conns, .. } = self;
        let n = *n;
        let cur_ref: &[f32] = cur;
        let total: u64 = blocks(nxt, neur_off, n)
            .into_par_iter()
            .map(|(i0, block)| {
                let base = neur_off[i0] as usize;
                let mut acc = 0u64;
                for i in i0..(i0 + BLOCK).min(n) {
                    let off = neur_off[i] as usize;
                    let nn = n_neur[i] as usize;
                    let c0 = conn_off[i] as usize;
                    let cnt = conn_cnt[i] as usize;
                    brain_one(
                        n_in[i] as usize,
                        &bias[off..off + nn],
                        &cur_ref[off..off + nn],
                        &mut block[off - base..off - base + nn],
                        &c_src[c0..c0 + cnt],
                        &c_dst[c0..c0 + cnt],
                        &c_w[c0..c0 + cnt],
                    );
                    acc += cnt as u64;
                }
                acc
            })
            .sum();
        *conns += total;
        std::mem::swap(cur, nxt);
    }

    pub fn phase_par(&mut self, p: u32) {
        match p {
            1 => self.sense_par(),
            2 => self.brain_par(),
            _ => self.phase(p),
        }
    }

    pub fn run_par(&mut self, ticks: u32) {
        for _ in 0..ticks {
            self.grid();
            self.sense_par();
            self.brain_par();
            self.act();
            self.contact();
            self.diffuse();
        }
    }
}
