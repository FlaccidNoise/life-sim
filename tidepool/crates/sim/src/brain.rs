//! Brains: one arena for the whole population, a fixed block for each slot.
//!
//! A brain is a recurrent net. Every neuron reads the values of the step before, so the order of
//! the neurons does not change the result. A creature thinks on one tick in `think_every`.

use crate::genome::{BrainGenome, ConnGene};
use crate::math::act;
use crate::params::id;
use crate::rng::Rng;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

pub const MAX_NEURONS: usize = 96;
pub const MAX_CONNS: usize = 384;
pub const N_IN: usize = 7;
pub const N_OUT: usize = 2;
pub const IN_CONST: usize = 0;
pub const IN_ENERGY: usize = 1;
pub const IN_AGE: usize = 2;
pub const IN_SPEED: usize = 3;
pub const IN_SCENT: usize = 4;
pub const IN_GRAD_FWD: usize = 5;
pub const IN_GRAD_SIDE: usize = 6;
pub const OUT_THRUST: usize = 0;
pub const OUT_TURN: usize = 1;

/// Hidden neurons of the starter brain.
const STARTER_HIDDEN: usize = 4;
/// Connections of the starter brain: the 3 wired ones, each input to each hidden neuron, and each
/// hidden neuron to each output. The history ids of a founder are `1..=STARTER_CONNS`.
pub const STARTER_CONNS: u32 = (3 + N_IN * STARTER_HIDDEN + STARTER_HIDDEN * N_OUT) as u32;
/// `IN_CONST` to thrust. A founder with no scent swims at `act(0.9)`, 0.73 of its full thrust.
const STARTER_CRUISE: f32 = 0.9;
/// `IN_GRAD_SIDE` to turn. A gradient half off to one side gives a turn command of 0.78.
const STARTER_STEER: f32 = 2.0;
/// `IN_GRAD_FWD` to thrust. Faster up the gradient, slower down it, and never to a stop.
const STARTER_SURGE: f32 = 0.5;
/// The size of the random weights and biases. Small, so the three wired weights lead. Not zero:
/// the draft showed that evolution never recruits a connection that starts at zero.
const STARTER_WEIGHT_SIGMA: f32 = 0.1;
const STARTER_BIAS_SIGMA: f32 = 0.05;

pub struct Brains {
    /// By slot.
    pub n_neur: Vec<u16>,
    pub n_conn: Vec<u16>,
    /// `capacity * MAX_NEURONS`. `cur` is saved for live slots.
    pub cur: Vec<f32>,
    pub nxt: Vec<f32>,
    /// `capacity * MAX_NEURONS`. Rebuilt from the genomes on load.
    pub bias: Vec<f32>,
    pub alpha: Vec<f32>,
    /// `capacity * MAX_CONNS`, sorted by `dst`. Rebuilt from the genomes on load.
    pub src: Vec<u16>,
    pub dst: Vec<u16>,
    pub w: Vec<f32>,
}

impl Brains {
    pub fn new(capacity: u32) -> Brains {
        let slots = capacity as usize;
        Brains {
            n_neur: vec![0; slots],
            n_conn: vec![0; slots],
            cur: vec![0.0; slots * MAX_NEURONS],
            nxt: vec![0.0; slots * MAX_NEURONS],
            bias: vec![0.0; slots * MAX_NEURONS],
            alpha: vec![0.0; slots * MAX_NEURONS],
            src: vec![0; slots * MAX_CONNS],
            dst: vec![0; slots * MAX_CONNS],
            w: vec![0.0; slots * MAX_CONNS],
        }
    }

    /// Copies the genome into the slot's block, sorted by (dst, src, history). Zeroes activations.
    /// Connections past MAX_CONNS or to a neuron past MAX_NEURONS are dropped.
    ///
    /// A genome from `spawn` is not checked, so this holds every index inside the block: hidden
    /// neurons past the block are dropped, and a neuron with no bias or alpha in the genome gets 0.
    pub fn express(&mut self, slot: usize, g: &BrainGenome) {
        let hidden = (g.n_hidden as usize).min(MAX_NEURONS - N_IN - N_OUT);
        let n = N_IN + hidden + N_OUT;
        let neurons = slot * MAX_NEURONS..(slot + 1) * MAX_NEURONS;
        self.cur[neurons.clone()].fill(0.0);
        self.nxt[neurons.clone()].fill(0.0);
        self.bias[neurons.clone()].fill(0.0);
        self.alpha[neurons.clone()].fill(0.0);
        let first = slot * MAX_NEURONS + N_IN;
        for (to, from) in self.bias[first..][..n - N_IN].iter_mut().zip(&g.bias) {
            *to = *from;
        }
        for (to, from) in self.alpha[first..][..n - N_IN].iter_mut().zip(&g.alpha) {
            *to = *from;
        }

        let in_block =
            |c: &&ConnGene| (c.src as usize) < n && (N_IN..n).contains(&(c.dst as usize));
        let mut conns: Vec<&ConnGene> = g.conns.iter().filter(in_block).take(MAX_CONNS).collect();
        conns.sort_by_key(|c| (c.dst, c.src, c.history));
        let first = slot * MAX_CONNS;
        for (i, c) in conns.iter().enumerate() {
            self.src[first + i] = c.src;
            self.dst[first + i] = c.dst;
            self.w[first + i] = c.weight;
        }
        self.n_neur[slot] = n as u16;
        self.n_conn[slot] = conns.len() as u16;
    }

    /// The first N_IN activations.
    pub fn inputs_mut(&mut self, slot: usize) -> &mut [f32] {
        &mut self.cur[slot * MAX_NEURONS..][..N_IN]
    }

    /// The last N_OUT activations of an expressed slot.
    pub fn output(&self, slot: usize, k: usize) -> f32 {
        self.cur[slot * MAX_NEURONS + self.n_neur[slot] as usize - N_OUT + k]
    }

    /// One step of an expressed slot: `cur += alpha * (act(bias + sum(w * cur[src])) - cur)` for
    /// each neuron that is not an input, all from the values before the step.
    pub fn step_one(&mut self, slot: usize) {
        let (n, conns) = (self.n_neur[slot] as usize, self.n_conn[slot] as usize);
        // Slices of one length each, so that only the read through `src` has a bounds check.
        let cur = &mut self.cur[slot * MAX_NEURONS..][..n];
        let nxt = &mut self.nxt[slot * MAX_NEURONS..][..n];
        let bias = &self.bias[slot * MAX_NEURONS..][..n];
        let alpha = &self.alpha[slot * MAX_NEURONS..][..n];
        let src = &self.src[slot * MAX_CONNS..][..conns];
        let dst = &self.dst[slot * MAX_CONNS..][..conns];
        let w = &self.w[slot * MAX_CONNS..][..conns];
        // The connections are sorted by `dst`, so one pass over them feeds every neuron. The sum is
        // made in that order on every target.
        let mut c = 0;
        for j in N_IN..n {
            let mut sum = bias[j];
            while c < conns && dst[c] as usize == j {
                sum += w[c] * cur[src[c] as usize];
                c += 1;
            }
            nxt[j] = cur[j] + alpha[j] * (act(sum) - cur[j]);
        }
        cur[N_IN..].copy_from_slice(&nxt[N_IN..]);
    }
}

/// True on the ticks when the creature in `slot` senses and thinks: one tick in `every`, with
/// neighbouring slots on different ticks so the work is spread evenly.
pub(crate) fn thinks(tick: u32, slot: usize, every: u32) -> bool {
    tick.wrapping_add(slot as u32).is_multiple_of(every)
}

/// The founder brain. Every founder has the same shape and the same history ids
/// `1..=STARTER_CONNS`: inputs 0 to 6, hidden 7 to 10, thrust 11, turn 12. Three wired weights
/// make it swim and turn up the scent gradient. Draws the random weights in history order, then
/// the biases.
pub fn starter(rng: &mut Rng) -> BrainGenome {
    let hidden = N_IN..N_IN + STARTER_HIDDEN;
    let (thrust, turn) = (hidden.end + OUT_THRUST, hidden.end + OUT_TURN);
    let mut wires = vec![
        (IN_CONST, thrust, STARTER_CRUISE),
        (IN_GRAD_SIDE, turn, STARTER_STEER),
        (IN_GRAD_FWD, thrust, STARTER_SURGE),
    ];
    for input in 0..N_IN {
        for h in hidden.clone() {
            wires.push((input, h, rng.gauss() * STARTER_WEIGHT_SIGMA));
        }
    }
    for h in hidden {
        for out in [thrust, turn] {
            wires.push((h, out, rng.gauss() * STARTER_WEIGHT_SIGMA));
        }
    }
    let conns = (1..)
        .zip(wires)
        .map(|(history, (src, dst, weight))| ConnGene {
            src: src as u16,
            dst: dst as u16,
            weight,
            history,
        })
        .collect();
    let non_inputs = STARTER_HIDDEN + N_OUT;
    BrainGenome {
        n_hidden: STARTER_HIDDEN as u16,
        bias: (0..non_inputs)
            .map(|_| rng.gauss() * STARTER_BIAS_SIGMA)
            .collect(),
        alpha: vec![1.0; non_inputs],
        conns,
    }
}

/// Each live creature whose turn it is takes one brain step, and its outputs become its commands.
/// The commands of the others stay as they were.
pub fn step(world: &mut World) {
    let World {
        creatures: c,
        brains,
        params,
        tick,
        ..
    } = world;
    let every = params.get(id::THINK_EVERY) as u32;
    for s in 0..c.slots.high_water() as usize {
        if !c.slots.is_alive(s as u32) || !thinks(*tick, s, every) {
            continue;
        }
        brains.step_one(s);
        c.cmd_thrust[s] = brains.output(s, OUT_THRUST).max(0.0);
        c.cmd_turn[s] = brains.output(s, OUT_TURN);
    }
}

/// The activations of each live slot, in slot order. The rest of the arena comes from the genomes.
pub fn save(world: &World, w: &mut Writer) {
    let (c, b) = (&world.creatures, &world.brains);
    let mut cur = Vec::new();
    for s in (0..c.slots.high_water() as usize).filter(|&s| c.slots.is_alive(s as u32)) {
        cur.extend_from_slice(&b.cur[s * MAX_NEURONS..][..b.n_neur[s] as usize]);
    }
    w.f32s(&cur);
}

/// Reads what `save` wrote: one value per neuron of each live slot. `World::load` has already
/// expressed every live genome, so the neuron counts are known. The values are not checked.
pub fn load(world: &mut World, r: &mut Reader) -> Result<(), LoadError> {
    let (c, b) = (&world.creatures, &mut world.brains);
    let cur = r.f32s()?;
    let mut rest = cur.as_slice();
    for s in (0..c.slots.high_water() as usize).filter(|&s| c.slots.is_alive(s as u32)) {
        let (block, tail) = rest
            .split_at_checked(b.n_neur[s] as usize)
            .ok_or(LoadError::Invalid("brain activation count"))?;
        b.cur[s * MAX_NEURONS..][..block.len()].copy_from_slice(block);
        rest = tail;
    }
    if !rest.is_empty() {
        return Err(LoadError::Invalid("brain activation count"));
    }
    Ok(())
}
