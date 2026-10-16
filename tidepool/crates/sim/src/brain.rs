//! Brains: one arena for the whole population, a fixed block for each slot.
//!
//! A brain is a recurrent net. Every neuron reads the values of the step before, so the order of
//! the neurons does not change the result. A creature thinks on one tick in `think_every`.
//!
//! A genome names its neurons (`genome::Node`). `ports` says which names a body declares, and
//! `Brains::express` turns the names into the indexes of a block.

use std::ops::Range;

use crate::creature::MAX_EYES;
use crate::genome::{
    BrainGenome, ConnGene, Genome, HiddenGene, Node, BODY, FOUNDER_EYE_HISTORY, KIND_CHEMO,
    KIND_EYE,
};
use crate::math::act;
use crate::params::{id, Params};
use crate::rng::Rng;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

/// Budgets of `docs/architecture.md` §2, not tuned numbers.
pub const MAX_NEURONS: usize = 96;
pub const MAX_CONNS: usize = 384;
/// The most out genes that a genome can hold.
pub const N_OUT_MAX: usize = 8;

// The ports of the body. Owner `BODY`. Every body declares these inputs, each at the index that
// is its port.
pub const IN_CONST: u8 = 0;
pub const IN_ENERGY: u8 = 1;
pub const IN_AGE: u8 = 2;
pub const IN_SPEED: u8 = 3;
/// The two mate inputs.
pub const IN_MATE_SIZE: u8 = 4;
pub const IN_MATE_KIN: u8 = 5;
pub const N_BODY_IN: usize = 6;
/// The three scent inputs, of a body whose chemoreceptors sum to more than 0. Owner `BODY`.
/// `IN_GRAD_SIDE` is positive when the scent rises on the side of positive angles from the heading.
pub const IN_SCENT: u8 = 16;
pub const IN_GRAD_FWD: u8 = 17;
pub const IN_GRAD_SIDE: u8 = 18;
/// The ports of one eye gene. Owner: the history id of the gene. `A` is the cone at
/// `+anchor * PI`, or the one cone of a midline eye. `B` is its mirror. A midline eye has no `B`
/// ports.
pub const EYE_FOOD_A: u8 = 0;
pub const EYE_BODY_A: u8 = 1;
pub const EYE_FOOD_B: u8 = 2;
pub const EYE_BODY_B: u8 = 3;
pub const OUT_THRUST: u8 = 128;
pub const OUT_TURN: u8 = 129;
pub const OUT_ACCEPT: u8 = 130;
/// The inputs that every body declares, in block order.
const BODY_INPUTS: [u8; N_BODY_IN] = [
    IN_CONST,
    IN_ENERGY,
    IN_AGE,
    IN_SPEED,
    IN_MATE_SIZE,
    IN_MATE_KIN,
];
const SCENT_INPUTS: [u8; 3] = [IN_SCENT, IN_GRAD_FWD, IN_GRAD_SIDE];
/// The outputs that every body declares, in block order. Their ports count up from `OUT_THRUST`.
pub const BODY_OUTPUTS: [u8; 3] = [OUT_THRUST, OUT_TURN, OUT_ACCEPT];
/// `Brains::in_scent` or `Brains::in_eye` of a slot whose body does not declare those inputs.
pub const NO_INPUT: u16 = u16::MAX;

/// Hidden neurons of the starter brain.
pub const STARTER_HIDDEN: u32 = 4;
/// The history ids that the connections of a founder brain can hold are `1..=STARTER_CONNS`. Every
/// starter brain takes 1 to 39: the 3 wired connections, each input of the M2 body and of the
/// scent to each hidden neuron, and each hidden neuron to thrust and to turn. It also takes 58 to
/// 60, the 3 connections into `accept`. The brain of a founder with an eye takes 40 to 57 as well:
/// each eye input to each hidden neuron, and the 2 wired eye connections.
pub const STARTER_CONNS: u32 = 60;
const STARTER_BIAS_SIGMA: f32 = 0.05;

/// Words of the readout that `readout` makes: the header, one neuron, and one connection.
pub const READOUT_HEADER_WORDS: u32 = 6;
pub const READOUT_NEURON_WORDS: u32 = 6;
pub const READOUT_CONN_WORDS: u32 = 3;
/// The words of the readout of a full brain: the most that `readout` writes.
pub const READOUT_MAX_WORDS: u32 = READOUT_HEADER_WORDS
    + MAX_NEURONS as u32 * READOUT_NEURON_WORDS
    + MAX_CONNS as u32 * READOUT_CONN_WORDS;
/// The kind of a hidden neuron in the readout. A neuron of the body has kind 0.
const READOUT_HIDDEN: u32 = 255;

/// The neurons that a body declares, in block order.
pub struct Ports {
    pub inputs: Vec<Node>,
    pub outputs: Vec<Node>,
}

/// Who declares what. The only place that knows.
///
/// Inputs: the 6 of the body. Then the 3 of the scent, if the chemoreceptors sum to more than 0.
/// Then the eye genes in gene order: for each cone that `Creatures::express` makes, its plant
/// input and then its body input, `A` before `B`. A cone past `MAX_EYES` declares nothing.
/// Outputs: thrust, turn, and accept. No part declares an output.
///
/// The names are all different when every part has its own history id above `BODY`, as in a
/// living world. For a hand-made genome where two eye genes share an id, or where one has the id
/// `BODY`, a name is here more than once. Each cone still has its two inputs, and a connection
/// reads the first neuron of that name.
pub fn ports(g: &Genome) -> Ports {
    let mut inputs: Vec<Node> = BODY_INPUTS.map(Node::body).into();
    if g.size_of(KIND_CHEMO) > 0.0 {
        inputs.extend(SCENT_INPUTS.map(Node::body));
    }
    let mut room = MAX_EYES;
    for part in g.parts.iter().filter(|part| part.kind == KIND_EYE) {
        // As in `Creatures::express`: an anchor is held in 0 to 1, one that is not finite counts
        // as 0, and an eye at exactly 0 or 1 is on the midline and is one cone.
        let pair = part.anchor > 0.0 && part.anchor < 1.0;
        let made = room.min(if pair { 2 } else { 1 });
        room -= made;
        let node = |port: u8| Node {
            owner: part.history,
            port,
        };
        for cone in [[EYE_FOOD_A, EYE_BODY_A], [EYE_FOOD_B, EYE_BODY_B]]
            .iter()
            .take(made)
        {
            inputs.extend(cone.map(node));
        }
    }
    Ports {
        inputs,
        outputs: BODY_OUTPUTS.map(Node::body).into(),
    }
}

/// The neurons of one brain block, by name and in block order: the inputs, the hidden genes in
/// gene order, the outputs.
struct Block {
    names: Vec<Node>,
    n_in: usize,
    n_out: usize,
}

/// An expressed connection. `src` and `dst` are indexes into the block.
struct Wire {
    dst: u16,
    src: u16,
    history: u32,
    weight: f32,
}

impl Block {
    /// Hidden genes past the room of a block are left out. `Genome::load` lets in no more than
    /// fit, and a genome from `World::spawn` is not checked.
    fn of(g: &Genome) -> Block {
        let Ports { inputs, outputs } = ports(g);
        let (n_in, n_out) = (inputs.len(), outputs.len());
        let hidden = g.brain.hidden.len().min(MAX_NEURONS - n_in - n_out);
        let mut names = inputs;
        names.extend(g.brain.hidden[..hidden].iter().map(|h| Node::hidden(h.id)));
        names.extend(outputs);
        Block { names, n_in, n_out }
    }

    /// The indexes of the hidden neurons.
    fn hidden(&self) -> Range<usize> {
        self.n_in..self.names.len() - self.n_out
    }

    /// The connections that the block expresses, sorted by (dst, src, history), so a sum is made
    /// in one order on every target. A connection with an end that is not in the block, or that
    /// runs into an input, is left out. So are those past `MAX_CONNS`. The weight of a connection
    /// whose source is a hidden neuron is times `gain`.
    fn wires(&self, g: &BrainGenome, gain: f32) -> Vec<Wire> {
        let index = |node: Node| self.names.iter().position(|n| *n == node);
        let hidden = self.hidden();
        let wire = |c: &ConnGene| {
            let (src, dst) = (index(c.src)?, index(c.dst)?);
            let scale = if hidden.contains(&src) { gain } else { 1.0 };
            (dst >= self.n_in).then_some(Wire {
                dst: dst as u16,
                src: src as u16,
                history: c.history,
                weight: c.weight * scale,
            })
        };
        let mut wires: Vec<Wire> = g.conns.iter().filter_map(wire).take(MAX_CONNS).collect();
        wires.sort_by_key(|w| (w.dst, w.src, w.history));
        wires
    }
}

pub struct Brains {
    /// By slot.
    pub n_neur: Vec<u16>,
    pub n_conn: Vec<u16>,
    /// By slot: the inputs, which come first in a block, and the outputs, which come last.
    pub n_in: Vec<u16>,
    pub n_out: Vec<u16>,
    /// By slot: the index of the first scent input and of the first eye input, or `NO_INPUT`.
    pub in_scent: Vec<u16>,
    pub in_eye: Vec<u16>,
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
    /// The `hidden_gain` that `step` last saw. NaN before the first step, so a new arena and a
    /// loaded one are both wired once more, to the same weights.
    gain: f32,
}

impl Brains {
    pub fn new(capacity: u32) -> Brains {
        let slots = capacity as usize;
        Brains {
            n_neur: vec![0; slots],
            n_conn: vec![0; slots],
            n_in: vec![0; slots],
            n_out: vec![0; slots],
            in_scent: vec![NO_INPUT; slots],
            in_eye: vec![NO_INPUT; slots],
            cur: vec![0.0; slots * MAX_NEURONS],
            nxt: vec![0.0; slots * MAX_NEURONS],
            bias: vec![0.0; slots * MAX_NEURONS],
            alpha: vec![0.0; slots * MAX_NEURONS],
            src: vec![0; slots * MAX_CONNS],
            dst: vec![0; slots * MAX_CONNS],
            w: vec![0.0; slots * MAX_CONNS],
            gain: f32::NAN,
        }
    }

    /// Turns the names of the genome into the indexes of the slot's block, and zeroes the
    /// activations. The neurons are in the order of `Block`, and the connections are those of
    /// `Block::wires` with `hidden_gain`. A connection that is not expressed costs nothing.
    ///
    /// Never panics, for any genome. An output with no `OutGene` gets bias 0 and alpha 1, as
    /// `Genome::prune` would give it.
    pub fn express(&mut self, slot: usize, g: &Genome, p: &Params) {
        let block = Block::of(g);
        let (hidden, first) = (block.hidden(), slot * MAX_NEURONS);
        let neurons = first..first + MAX_NEURONS;
        self.cur[neurons.clone()].fill(0.0);
        self.nxt[neurons.clone()].fill(0.0);
        self.bias[neurons.clone()].fill(0.0);
        self.alpha[neurons].fill(0.0);
        for (at, gene) in hidden.clone().zip(&g.brain.hidden) {
            (self.bias[first + at], self.alpha[first + at]) = (gene.bias, gene.alpha);
        }
        for (at, node) in block.names.iter().enumerate().skip(hidden.end) {
            let gene = g.brain.outs.iter().find(|gene| gene.node == *node);
            (self.bias[first + at], self.alpha[first + at]) =
                gene.map_or((0.0, 1.0), |gene| (gene.bias, gene.alpha));
        }
        // The scent inputs follow those of the body, and the eye inputs are the rest.
        let inputs = &block.names[..block.n_in];
        let scent = inputs.get(N_BODY_IN) == Some(&Node::body(IN_SCENT));
        let eyes = N_BODY_IN + if scent { SCENT_INPUTS.len() } else { 0 };
        self.in_scent[slot] = if scent { N_BODY_IN as u16 } else { NO_INPUT };
        self.in_eye[slot] = if eyes < block.n_in {
            eyes as u16
        } else {
            NO_INPUT
        };
        self.n_neur[slot] = block.names.len() as u16;
        (self.n_in[slot], self.n_out[slot]) = (block.n_in as u16, block.n_out as u16);
        self.wire(slot, &block, &g.brain, p.get(id::HIDDEN_GAIN));
    }

    /// Writes the connections of the slot's block. Touches no activation.
    fn wire(&mut self, slot: usize, block: &Block, g: &BrainGenome, gain: f32) {
        let wires = block.wires(g, gain);
        let first = slot * MAX_CONNS;
        for (i, wire) in wires.iter().enumerate() {
            self.src[first + i] = wire.src;
            self.dst[first + i] = wire.dst;
            self.w[first + i] = wire.weight;
        }
        self.n_conn[slot] = wires.len() as u16;
    }

    /// The activations of the inputs of an expressed slot.
    pub fn inputs_mut(&mut self, slot: usize) -> &mut [f32] {
        &mut self.cur[slot * MAX_NEURONS..][..self.n_in[slot] as usize]
    }

    /// The activation of an output of the body, by its port, in an expressed slot.
    pub fn output(&self, slot: usize, port: u8) -> f32 {
        let first = self.n_neur[slot] as usize - self.n_out[slot] as usize;
        self.cur[slot * MAX_NEURONS + first + (port - OUT_THRUST) as usize]
    }

    /// One step of an expressed slot: `cur += alpha * (act(bias + sum(w * cur[src])) - cur)` for
    /// each neuron that is not an input, all from the values before the step.
    pub fn step_one(&mut self, slot: usize) {
        let (n, conns) = (self.n_neur[slot] as usize, self.n_conn[slot] as usize);
        let n_in = self.n_in[slot] as usize;
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
        for j in n_in..n {
            let mut sum = bias[j];
            while c < conns && dst[c] as usize == j {
                sum += w[c] * cur[src[c] as usize];
                c += 1;
            }
            nxt[j] = cur[j] + alpha[j] * (act(sum) - cur[j]);
        }
        cur[n_in..].copy_from_slice(&nxt[n_in..]);
    }
}

/// True on the ticks when the creature in `slot` senses and thinks: one tick in `every`, with
/// neighbouring slots on different ticks so the work is spread evenly.
pub(crate) fn thinks(tick: u32, slot: usize, every: u32) -> bool {
    tick.wrapping_add(slot as u32).is_multiple_of(every)
}

/// The founder brain. Every founder has the same shape and the same history ids: the connections
/// take 1 to 39 and 58 to 60, and the 4 hidden genes take the 4 ids after the founder's eye. Three
/// wired weights make it swim and turn up the scent gradient: `starter_cruise` from `IN_CONST` to
/// thrust, `starter_steer` from `IN_GRAD_SIDE` to turn, and `starter_surge` from `IN_GRAD_FWD` to
/// thrust. Each other weight of 1 to 39 is `gauss * new_conn_sigma`. Draws those in history order,
/// then the biases of the hidden genes, then those of the outputs.
///
/// 58 to 60 run into `accept`: `starter_accept` from `IN_CONST`, then `gauss * new_conn_sigma`
/// from each of the two mate inputs, drawn in that order after the biases.
///
/// With `founder_eye` above 0 the ids 40 to 57 name the founder's eye, which is a pair: each of
/// its inputs to each hidden neuron, then two wired weights that turn the body to a plant it sees,
/// `starter_look` from `EYE_FOOD_A` to turn and minus `starter_look` from `EYE_FOOD_B` to turn.
/// The inputs are in the order of M2, the left before the right: the plant of `B`, the plant of
/// `A`, the body of `B`, the body of `A`. Their random weights are drawn last, so an eye moves no
/// draw of the brain with none.
pub fn starter(rng: &mut Rng, p: &Params) -> BrainGenome {
    let sigma = p.get(id::NEW_CONN_SIGMA);
    let hidden: Vec<Node> = (1..=STARTER_HIDDEN)
        .map(|k| Node::hidden(FOUNDER_EYE_HISTORY + k))
        .collect();
    let (thrust, turn) = (Node::body(OUT_THRUST), Node::body(OUT_TURN));
    let mut wires = vec![
        (Node::body(IN_CONST), thrust, p.get(id::STARTER_CRUISE)),
        (Node::body(IN_GRAD_SIDE), turn, p.get(id::STARTER_STEER)),
        (Node::body(IN_GRAD_FWD), thrust, p.get(id::STARTER_SURGE)),
    ];
    let plain = [
        IN_CONST,
        IN_ENERGY,
        IN_AGE,
        IN_SPEED,
        IN_SCENT,
        IN_GRAD_FWD,
        IN_GRAD_SIDE,
    ];
    for input in plain {
        for &h in &hidden {
            wires.push((Node::body(input), h, rng.gauss() * sigma));
        }
    }
    for &h in &hidden {
        for out in [thrust, turn] {
            wires.push((h, out, rng.gauss() * sigma));
        }
    }
    let mut bias = || rng.gauss() * STARTER_BIAS_SIGMA;
    let hidden_genes: Vec<HiddenGene> = hidden
        .iter()
        .map(|h| HiddenGene {
            id: h.owner,
            bias: bias(),
            alpha: 1.0,
        })
        .collect();
    let mut brain = BrainGenome::default();
    for out in &mut brain.outs {
        out.bias = bias();
    }
    brain.hidden = hidden_genes;
    let accept = Node::body(OUT_ACCEPT);
    let accepts = [
        (Node::body(IN_CONST), accept, p.get(id::STARTER_ACCEPT)),
        (Node::body(IN_MATE_SIZE), accept, rng.gauss() * sigma),
        (Node::body(IN_MATE_KIN), accept, rng.gauss() * sigma),
    ];
    if p.get(id::FOUNDER_EYE) > 0.0 {
        let eye = |port: u8| Node {
            owner: FOUNDER_EYE_HISTORY,
            port,
        };
        for input in [EYE_FOOD_B, EYE_FOOD_A, EYE_BODY_B, EYE_BODY_A] {
            for &h in &hidden {
                wires.push((eye(input), h, rng.gauss() * sigma));
            }
        }
        let look = p.get(id::STARTER_LOOK);
        wires.push((eye(EYE_FOOD_A), turn, look));
        wires.push((eye(EYE_FOOD_B), turn, -look));
    }
    let first_accept = STARTER_CONNS + 1 - accepts.len() as u32;
    let wires = (1..).zip(wires).chain((first_accept..).zip(accepts));
    brain.conns = wires
        .map(|(history, (src, dst, weight))| ConnGene {
            src,
            dst,
            weight,
            history,
        })
        .collect();
    brain
}

/// Each live creature whose turn it is takes one brain step, and its outputs become its commands.
/// The commands of the others stay as they were.
///
/// The weights of a block hold `hidden_gain`. If the parameter is not what the blocks hold, every
/// live block is wired again first, so a world behaves as its genomes and its parameters say and a
/// reload changes nothing.
pub fn step(world: &mut World) {
    let World {
        creatures: c,
        genomes,
        brains,
        params,
        tick,
        ..
    } = world;
    let every = params.get(id::THINK_EVERY) as u32;
    let live = c.slots.high_water() as usize;
    let gain = params.get(id::HIDDEN_GAIN);
    if brains.gain != gain {
        brains.gain = gain;
        for (s, g) in genomes.iter().enumerate().take(live) {
            if c.slots.is_alive(s as u32) {
                brains.wire(s, &Block::of(g), &g.brain, gain);
            }
        }
    }
    for s in 0..live {
        if !c.slots.is_alive(s as u32) || !thinks(*tick, s, every) {
            continue;
        }
        brains.step_one(s);
        c.cmd_thrust[s] = brains.output(s, OUT_THRUST).max(0.0);
        c.cmd_turn[s] = brains.output(s, OUT_TURN);
        c.cmd_accept[s] = brains.output(s, OUT_ACCEPT);
    }
}

/// Writes `world.readout` for the creature with this uid, and returns the words written: 0 for a
/// uid that is not alive. `src/protocol.ts` reads this layout.
///
/// Header: uid, inputs, hidden neurons, outputs, connections, and 1 when the player steers this
/// body. Then one record per neuron in block order: owner, port, `kind | gene index << 8`, then
/// the activation, the bias, and the alpha as floats. The kind is 0 for a neuron of the body, 255
/// for a hidden neuron with the index of its gene, and the kind of the part for a port of a part,
/// with the index of the part gene. Then one record per connection in block order:
/// `src | dst << 16` as block indexes, the weight as a float, and the history.
pub fn readout(world: &mut World, uid: u32) -> u32 {
    world.readout.clear();
    let Some(slot) = world.slot_of(uid) else {
        return 0;
    };
    let World {
        genomes,
        brains,
        control,
        params,
        readout: out,
        ..
    } = world;
    let (s, g) = (slot as usize, &genomes[slot as usize]);
    let block = Block::of(g);
    let hidden = block.hidden();
    let wires = block.wires(&g.brain, params.get(id::HIDDEN_GAIN));
    let manual = control.possessed == uid && control.manual;
    out.extend([
        uid,
        block.n_in as u32,
        hidden.len() as u32,
        block.n_out as u32,
        wires.len() as u32,
        manual as u32,
    ]);
    for (i, node) in block.names.iter().enumerate() {
        let kind = if hidden.contains(&i) {
            READOUT_HIDDEN | ((i - hidden.start) as u32) << 8
        } else if node.owner == BODY {
            0
        } else {
            let part = g.parts.iter().position(|part| part.history == node.owner);
            part.map_or(0, |k| g.parts[k].kind as u32 | (k as u32) << 8)
        };
        let at = s * MAX_NEURONS + i;
        out.extend([node.owner, node.port as u32, kind]);
        out.extend([brains.cur[at], brains.bias[at], brains.alpha[at]].map(f32::to_bits));
    }
    for wire in &wires {
        let ends = wire.src as u32 | (wire.dst as u32) << 16;
        out.extend([ends, wire.weight.to_bits(), wire.history]);
    }
    out.len() as u32
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
