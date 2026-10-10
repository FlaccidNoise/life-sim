//! Brains: one arena for the whole population, a fixed block for each slot.
//!
//! STUB until Task 15. The arena has its final shape. `express`, `output`, and `step_one` do
//! nothing yet, the starter brain is the smallest one, and `step` is a random wander.

use crate::genome::BrainGenome;
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

/// Stub only. Task 15 deletes both, with the wander.
const WANDER_THRUST: f32 = 0.6;
const WANDER_TURN_STEP: f32 = 0.2;

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
    /// STUB: does nothing. `World::spawn` and `World::load` already call it.
    pub fn express(&mut self, _slot: usize, _g: &BrainGenome) {}

    /// The first N_IN activations.
    pub fn inputs_mut(&mut self, slot: usize) -> &mut [f32] {
        &mut self.cur[slot * MAX_NEURONS..][..N_IN]
    }

    /// The last N_OUT activations. STUB: 0.
    pub fn output(&self, _slot: usize, _k: usize) -> f32 {
        0.0
    }

    /// STUB: does nothing.
    pub fn step_one(&mut self, _slot: usize) {}
}

/// The founder brain. STUB: the smallest brain, and no draw from `rng`.
pub fn starter(_rng: &mut Rng) -> BrainGenome {
    BrainGenome::default()
}

/// STUB: every creature swims forward and its turn command walks at random.
pub fn step(world: &mut World) {
    let World {
        creatures: c,
        rng_wander,
        ..
    } = world;
    for s in 0..c.slots.high_water() as usize {
        if !c.slots.is_alive(s as u32) {
            continue;
        }
        c.cmd_thrust[s] = WANDER_THRUST;
        c.cmd_turn[s] = (c.cmd_turn[s] + rng_wander.gauss() * WANDER_TURN_STEP).clamp(-1.0, 1.0);
    }
}

/// STUB: writes nothing. Task 15 saves `cur` for the live slots.
pub fn save(_world: &World, _w: &mut Writer) {}

/// STUB: reads nothing. `World::load` has already expressed every live genome.
pub fn load(_world: &mut World, _r: &mut Reader) -> Result<(), LoadError> {
    Ok(())
}
