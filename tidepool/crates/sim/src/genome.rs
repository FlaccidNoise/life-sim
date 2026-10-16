//! What a creature inherits: a body shape, a life history, a hue, a list of parts, and a brain.

use crate::brain::{self, Ports, N_OUT_MAX};
use crate::params::{id, Params, DEFS};
use crate::rng::Rng;
use crate::snapshot::{LoadError, Reader, Writer};

/// The name of a neuron: who owns it, and which of the owner's ports it is. A connection holds two
/// names and no index, so two genomes line up by history id and a part that is lost takes its
/// inputs with it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Node {
    pub owner: u32,
    pub port: u8,
}

/// The owner of every port that the body declares.
pub const BODY: u32 = 0;
/// The one port of a hidden neuron. Its owner is the gene's id.
pub const PORT_HIDDEN: u8 = 255;

impl Node {
    pub const fn body(port: u8) -> Node {
        Node { owner: BODY, port }
    }

    pub const fn hidden(id: u32) -> Node {
        Node {
            owner: id,
            port: PORT_HIDDEN,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct HiddenGene {
    pub id: u32,
    pub bias: f32,
    /// In `(0, 1]`.
    pub alpha: f32,
}

/// The bias and the alpha of one output neuron.
#[derive(Clone, Debug, PartialEq)]
pub struct OutGene {
    pub node: Node,
    pub bias: f32,
    pub alpha: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ConnGene {
    pub src: Node,
    pub dst: Node,
    pub weight: f32,
    pub history: u32,
}

/// The id of a hidden gene, the history of a connection, and the history of a part all come from
/// `World::next_history`. So no two genes of a world share a number, and an owner is never
/// ambiguous.
#[derive(Clone)]
pub struct BrainGenome {
    /// At most `MAX_HIDDEN`.
    pub hidden: Vec<HiddenGene>,
    /// At most `brain::N_OUT_MAX`.
    pub outs: Vec<OutGene>,
    /// At most `MAX_CONN_GENES`.
    pub conns: Vec<ConnGene>,
}

pub const MAX_HIDDEN: usize = 64;
pub const MAX_CONN_GENES: usize = brain::MAX_CONNS;

#[derive(Clone, Debug, PartialEq)]
pub struct PartGene {
    pub kind: u8,
    /// Where the part sits on the outline: 0 at the nose, 1 at the tail. Exactly 0 or 1 is on the
    /// midline and makes one part. Any other value makes a mirrored pair.
    pub anchor: f32,
    pub size: f32,
    /// Eye: cone width, 0 to 1. Other kinds do not read it.
    pub extra: f32,
    pub history: u32,
}

#[derive(Clone)]
pub struct Genome {
    pub len: f32,
    pub wid: f32,
    /// The growth of a newborn that this body buds.
    pub egg: f32,
    /// Ticks until death by old age.
    pub old: f32,
    pub hue: f32,
    /// At most `MAX_PART_GENES`.
    pub parts: Vec<PartGene>,
    pub brain: BrainGenome,
}

pub const MAX_PART_GENES: usize = 12;
pub const KIND_FLAGELLUM: u8 = 1;
pub const KIND_CILIA: u8 = 2;
pub const KIND_FILTER: u8 = 3;
pub const KIND_CHEMO: u8 = 4;
pub const KIND_FIN: u8 = 5;
pub const KIND_EYE: u8 = 6;
pub const KIND_JAW: u8 = 7;
pub const KIND_SPIKE: u8 = 8;
pub const KIND_SHELL: u8 = 9;
pub const KIND_TOXIN: u8 = 10;
/// Kinds are `1..=KINDS`. 0 means "no part" in a frame.
pub const KINDS: u8 = 10;
/// The kinds that the add-part mutation draws from.
pub const ADDABLE_KINDS: u8 = KINDS;

/// The ranges of the four body genes. Constants by decision (`docs/decisions/INDEX.md`, 2026-10-11,
/// "gene ranges stay constants"): the `len` band of `gate-evolve` is cut from `LEN_RANGE`.
pub const LEN_RANGE: (f32, f32) = (6.0, 24.0);
pub const WID_RANGE: (f32, f32) = (0.3, 0.9);
pub const EGG_RANGE: (f32, f32) = (0.2, 0.7);
pub const OLD_RANGE: (f32, f32) = (1200.0, 9600.0);
/// By kind. The four M1 kinds keep their M1 ranges.
pub const SIZE_RANGE: [(f32, f32); KINDS as usize + 1] = [
    (0.0, 0.0),
    (0.0, 1.0),
    (0.0, 1.0),
    (0.2, 1.0),
    (0.0, 1.0),
    (0.0, 1.0),
    (0.0, 1.0),
    (0.0, 1.0),
    (0.0, 1.0),
    (0.0, 1.0),
    (0.0, 1.0),
];
/// The reference body: the M1 founder. Every M2 rule gives this body the number that M1 gave it.
pub const LEN_DEFAULT: f32 = 12.0;
pub const WID_DEFAULT: f32 = 0.5;
pub const REF_WIDTH: f32 = LEN_DEFAULT * WID_DEFAULT;
pub const REF_AREA: f32 = LEN_DEFAULT * REF_WIDTH;
/// The sum of the founder's four part sizes.
pub const REF_PARTS: f32 = 2.1;
/// kind, anchor, size. In this order: it is the M1 order of draws.
pub const FOUNDER_PARTS: [(u8, f32, f32); 4] = [
    (KIND_FLAGELLUM, 1.0, 0.6),
    (KIND_CILIA, 0.5, 0.4),
    (KIND_FILTER, 0.0, 0.6),
    (KIND_CHEMO, 0.15, 0.5),
];
pub const FOUNDER_EYE_ANCHOR: f32 = 0.2;
/// Set once, from 0.4: at 0.4 the page showed a blind strip ahead of a founder
/// (`docs/findings/m2-eyes.md`).
pub const FOUNDER_EYE_EXTRA: f32 = 0.5;
/// Where `set_size` puts a fin, or a part of M4 that is not a jaw, on a body that has none.
const FIN_ANCHOR: f32 = 0.6;
/// Where `set_size` puts a jaw on a body that has none: the nose, as a hunter founder's jaw.
const JAW_ANCHOR: f32 = 0.0;
/// The history id of the founder's eye. Its brain connections take `1..=STARTER_CONNS`, its four
/// parts take the next four ids, and its eye takes this one.
pub const FOUNDER_EYE_HISTORY: u32 = brain::STARTER_CONNS + FOUNDER_PARTS.len() as u32 + 1;
/// The history id of a hunter founder's jaw (rule P3 of the M4 plan). The founder's hidden genes
/// take the ids between its eye and this one.
pub const FOUNDER_JAW_HISTORY: u32 = FOUNDER_EYE_HISTORY + brain::STARTER_HIDDEN + 1;
/// The last history id that a founder holds. The wires of its triggers take the ids after its jaw.
pub const FOUNDER_HISTORIES: u32 = FOUNDER_JAW_HISTORY + brain::TRIGGER_CONNS;
/// The largest size of a brain weight or bias. `math::act` is flat past 3, so a larger number
/// only hides later mutations.
const WEIGHT_LIMIT: f32 = 8.0;
/// The step of an alpha that mutates. An alpha has a fixed range, so its step is not a parameter.
const ALPHA_SIGMA: f32 = 0.1;
/// An alpha of 1 follows its input at once. One at the low end still moves, slowly.
const ALPHA_RANGE: (f32, f32) = (0.05, 1.0);

/// With chance `rate`, `v` moved by `gauss * step` and held in `[lo, hi]`. If not, `v` as it is.
fn nudged(v: f32, rng: &mut Rng, rate: f32, step: f32, (lo, hi): (f32, f32)) -> f32 {
    if rng.unit() < rate {
        (v + rng.gauss() * step).clamp(lo, hi)
    } else {
        v
    }
}

/// True with chance `rate`. A rate of 0 makes no draw.
fn chance(rng: &mut Rng, rate: f32) -> bool {
    rate > 0.0 && rng.unit() < rate
}

/// The id for a new gene. The counter rises. A snapshot can hold any counter, so it stops at the
/// top.
fn new_history(next_history: &mut u32) -> u32 {
    let history = *next_history;
    *next_history = history.saturating_add(1);
    history
}

/// A part size as the sums count it: one that is not finite counts as 0, and a size is held in 0
/// to 1, as in `Creatures::express`.
fn unit(v: f32) -> f32 {
    if v.is_finite() {
        v.clamp(0.0, 1.0)
    } else {
        0.0
    }
}

/// The size range of a kind. A kind outside `1..=KINDS` has no size.
fn size_range(kind: u8) -> (f32, f32) {
    SIZE_RANGE.get(kind as usize).copied().unwrap_or((0.0, 0.0))
}

/// The founder part of each M1 kind, with its default size and its history id.
fn founder_parts() -> Vec<PartGene> {
    (brain::STARTER_CONNS + 1..)
        .zip(FOUNDER_PARTS)
        .map(|(history, (kind, anchor, size))| PartGene {
            kind,
            anchor,
            size,
            extra: 0.0,
            history,
        })
        .collect()
}

/// The gene that `prune` gives a declared output that has none.
fn resting(node: Node) -> OutGene {
    OutGene {
        node,
        bias: 0.0,
        alpha: 1.0,
    }
}

/// The smallest brain: no hidden neurons and no connections. Its outputs rest at 0.
impl Default for BrainGenome {
    fn default() -> BrainGenome {
        BrainGenome {
            hidden: Vec::new(),
            outs: brain::BODY_OUTPUTS
                .map(|port| resting(Node::body(port)))
                .into(),
            conns: Vec::new(),
        }
    }
}

/// The reference body with hue 0 and the smallest brain. `egg` and `old` are the defaults of
/// `birth_growth` and `lifespan`.
impl Default for Genome {
    fn default() -> Genome {
        Genome {
            len: LEN_DEFAULT,
            wid: WID_DEFAULT,
            egg: DEFS[id::BIRTH_GROWTH].default,
            old: DEFS[id::LIFESPAN].default,
            hue: 0.0,
            parts: founder_parts(),
            brain: BrainGenome::default(),
        }
    }
}

impl Node {
    fn save(self, w: &mut Writer) {
        w.u32(self.owner);
        w.u32(self.port as u32);
    }

    fn load(r: &mut Reader) -> Result<Node, LoadError> {
        let (owner, port) = (r.u32()?, r.u32()?);
        let port = u8::try_from(port).map_err(|_| LoadError::Invalid("brain genome port"))?;
        Ok(Node { owner, port })
    }
}

/// A list length. `Invalid` above `most`, so that a load reads no more genes than a genome can
/// hold.
fn count(r: &mut Reader, most: usize, reason: &'static str) -> Result<usize, LoadError> {
    let n = r.u32()? as usize;
    if n > most {
        return Err(LoadError::Invalid(reason));
    }
    Ok(n)
}

impl BrainGenome {
    /// What a connection can run into: the hidden genes in gene order, then the outputs.
    fn targets(&self, outputs: Vec<Node>) -> Vec<Node> {
        let hidden = self.hidden.iter().map(|gene| Node::hidden(gene.id));
        hidden.chain(outputs).collect()
    }

    /// A new connection, with room and with both lists not empty: a source chosen evenly, then a
    /// target chosen evenly, then a weight of `gauss * sigma`. If the pair is joined already, the
    /// three draws are made and nothing is added. The id is `*next_history`, and the counter rises.
    fn connect(
        &mut self,
        sources: &[Node],
        targets: &[Node],
        rng: &mut Rng,
        sigma: f32,
        next_history: &mut u32,
    ) {
        if self.conns.len() >= MAX_CONN_GENES || sources.is_empty() || targets.is_empty() {
            return;
        }
        let src = sources[rng.below(sources.len() as u32) as usize];
        let dst = targets[rng.below(targets.len() as u32) as usize];
        let weight = rng.gauss() * sigma;
        self.join(src, dst, weight, next_history);
    }

    /// As `connect`, into `dst`: a source chosen evenly, then a weight. No target is drawn.
    fn connect_into(
        &mut self,
        sources: &[Node],
        dst: Node,
        rng: &mut Rng,
        sigma: f32,
        next_history: &mut u32,
    ) {
        if self.conns.len() >= MAX_CONN_GENES || sources.is_empty() {
            return;
        }
        let src = sources[rng.below(sources.len() as u32) as usize];
        let weight = rng.gauss() * sigma;
        self.join(src, dst, weight, next_history);
    }

    /// Adds the connection with a new id, unless the pair is joined already.
    fn join(&mut self, src: Node, dst: Node, weight: f32, next_history: &mut u32) {
        if !self.conns.iter().any(|c| (c.src, c.dst) == (src, dst)) {
            self.conns.push(ConnGene {
                src,
                dst,
                weight,
                history: new_history(next_history),
            });
        }
    }

    fn save(&self, w: &mut Writer) {
        w.u32(self.hidden.len() as u32);
        for gene in &self.hidden {
            w.u32(gene.id);
            w.f32(gene.bias);
            w.f32(gene.alpha);
        }
        w.u32(self.outs.len() as u32);
        for gene in &self.outs {
            gene.node.save(w);
            w.f32(gene.bias);
            w.f32(gene.alpha);
        }
        w.u32(self.conns.len() as u32);
        for gene in &self.conns {
            gene.src.save(w);
            gene.dst.save(w);
            w.f32(gene.weight);
            w.u32(gene.history);
        }
    }

    /// `Invalid` for more than `MAX_HIDDEN` hidden genes, more than `brain::N_OUT_MAX` out genes,
    /// or more than `MAX_CONN_GENES` connections. The names and the floats are not checked:
    /// `Brains::express` drops a connection whose end it cannot find, and it is safe for any float.
    fn load(r: &mut Reader) -> Result<BrainGenome, LoadError> {
        let mut hidden = Vec::new();
        for _ in 0..count(r, MAX_HIDDEN, "brain genome hidden count")? {
            hidden.push(HiddenGene {
                id: r.u32()?,
                bias: r.f32()?,
                alpha: r.f32()?,
            });
        }
        let mut outs = Vec::new();
        for _ in 0..count(r, N_OUT_MAX, "brain genome output count")? {
            outs.push(OutGene {
                node: Node::load(r)?,
                bias: r.f32()?,
                alpha: r.f32()?,
            });
        }
        let mut conns = Vec::new();
        for _ in 0..count(r, MAX_CONN_GENES, "brain genome connection count")? {
            conns.push(ConnGene {
                src: Node::load(r)?,
                dst: Node::load(r)?,
                weight: r.f32()?,
                history: r.u32()?,
            });
        }
        Ok(BrainGenome {
            hidden,
            outs,
            conns,
        })
    }
}

impl Genome {
    /// The reference body, with each of len, wid, and the four part sizes moved by
    /// `gauss * founder_sigma * range` and clamped. A random hue. `brain::starter(rng, p)`. Draws in
    /// that order, which is the M1 order. `egg` is `birth_growth` and `old` is `lifespan`, with no
    /// draw. With `founder_eye` above 0 a fifth part follows, an eye of that size, with no draw.
    /// `World::seed_founders` makes a hunter of it with `arm`.
    pub fn founder(rng: &mut Rng, p: &Params) -> Genome {
        let sigma = p.get(id::FOUNDER_SIGMA);
        let mut near = |default: f32, (lo, hi): (f32, f32)| {
            (default + rng.gauss() * sigma * (hi - lo)).clamp(lo, hi)
        };
        let len = near(LEN_DEFAULT, LEN_RANGE);
        let wid = near(WID_DEFAULT, WID_RANGE);
        let mut parts = founder_parts();
        for part in &mut parts {
            part.size = near(part.size, size_range(part.kind));
        }
        let eye = p.get(id::FOUNDER_EYE);
        if eye > 0.0 {
            parts.push(PartGene {
                kind: KIND_EYE,
                anchor: FOUNDER_EYE_ANCHOR,
                size: eye,
                extra: FOUNDER_EYE_EXTRA,
                history: FOUNDER_EYE_HISTORY,
            });
        }
        let hue = rng.unit();
        Genome {
            len,
            wid,
            egg: p.get(id::BIRTH_GROWTH),
            old: p.get(id::LIFESPAN),
            hue,
            parts,
            brain: brain::starter(rng, p),
        }
    }

    /// Rule P3 of the M4 plan: a Jaw at the nose of size `founder_jaw_size` with history
    /// `FOUNDER_JAW_HISTORY`, if the list has room, and the wires of `brain::hunter`. The founder
    /// keeps its Filter. No draw.
    pub fn arm(&mut self, p: &Params) {
        if self.parts.len() < MAX_PART_GENES {
            self.parts.push(PartGene {
                kind: KIND_JAW,
                anchor: JAW_ANCHOR,
                size: p.get(id::FOUNDER_JAW_SIZE),
                extra: 0.0,
                history: FOUNDER_JAW_HISTORY,
            });
        }
        brain::hunter(&mut self.brain, p);
    }

    /// Len, wid, and each part size: with chance mut_rate, add gauss * mut_sigma * (max - min), clamp.
    /// Hue: add gauss * hue_sigma, wrap into [0, 1).
    /// Each brain weight, bias: with chance mut_weight_rate, add gauss * mut_weight_sigma.
    /// Each alpha: with chance mut_weight_rate, add gauss * 0.1, clamp to [0.05, 1].
    /// Weights and biases are clamped to [-8, 8].
    ///
    /// Draws in this order: len, wid, each part size in gene order, the hue, the weights, the
    /// biases, the alphas. That is the M1 order. The biases are those of the hidden genes and then
    /// those of the out genes, each in gene order, and so are the alphas.
    ///
    /// Five M2 groups follow, in this order. A group whose rate is 0 makes no draw, so with every
    /// M2 rate at 0 the draws are the M1 draws.
    /// 1. Shape. Each part in gene order, its anchor and then, for an eye, its `extra`: with chance
    ///    mut_shape_rate, add gauss * mut_sigma, clamp to [0, 1].
    /// 2. Life. `egg`, then `old`: with chance mut_life_rate, add gauss * mut_sigma * (max - min),
    ///    clamp.
    /// 3. Remove. With chance mut_part_remove, one part chosen evenly is lost.
    /// 4. Duplicate. With chance mut_part_dup, and with room, one part chosen evenly is copied to
    ///    the end. The anchor of the copy gets gauss * mut_sigma and a clamp to [0, 1]. Its id is
    ///    `*next_history`, and the counter rises. Then each connection that names the original is
    ///    copied for the copy, in gene order and with room, with a new id each and no draw.
    /// 5. Add. With chance mut_part_add, and with room, a new part goes on the end: a kind chosen
    ///    evenly from `1..=ADDABLE_KINDS`, then an anchor in [0, 1), then an `extra` in [0, 1).
    ///    Its size is part_new_size, held in the range of its kind. Its id is `*next_history`, and
    ///    the counter rises. If the body declares inputs with the part that it did not declare
    ///    without it, part_wires connections follow: each as in group 8, with a source chosen
    ///    evenly from those inputs. If it declares an output that it did not declare without it,
    ///    part_wires connections into that output follow: each with a source chosen evenly from
    ///    the declared inputs and then the hidden genes, then a weight of gauss * new_conn_sigma.
    ///
    /// Four M3 groups follow, in this order. With every M3 rate at 0 and part_wires at 0 the draws
    /// are the M2 draws.
    /// 6. Remove a connection. With chance mut_conn_remove, one connection chosen evenly is lost.
    /// 7. Remove a hidden neuron. With chance mut_neuron_remove, one hidden gene chosen evenly is
    ///    lost, with each connection that names it.
    /// 8. Add a connection. With chance mut_conn_add, and with room: a source chosen evenly from
    ///    every declared neuron in block order, then a target chosen evenly from the hidden genes
    ///    and then the outputs, then a weight of gauss * new_conn_sigma. If the pair is joined
    ///    already, the three draws are made and nothing is added. A loop is allowed.
    /// 9. Add a hidden neuron. With chance mut_neuron_add, with room for one more hidden gene and
    ///    one more connection, and with a connection to split: one chosen evenly is removed. A
    ///    hidden gene with bias 0 and alpha 1 goes on the end. A connection from the old source to
    ///    it has weight 1, and one from it to the old target has the old weight. The three take
    ///    the next three ids, in that order.
    ///
    /// In groups 3 to 9 the draw of the chance comes first. The other draws are made only if the
    /// mutation happens: an empty list loses none and copies none, and a full list takes none.
    /// A part that is lost leaves its connections to `prune`.
    pub fn mutated(&self, rng: &mut Rng, p: &Params, next_history: &mut u32) -> Genome {
        let mut g = self.clone();
        let (rate, sigma) = (p.get(id::MUT_RATE), p.get(id::MUT_SIGMA));
        let mut body =
            |v: f32, (lo, hi): (f32, f32)| nudged(v, rng, rate, sigma * (hi - lo), (lo, hi));
        g.len = body(g.len, LEN_RANGE);
        g.wid = body(g.wid, WID_RANGE);
        for part in &mut g.parts {
            part.size = body(part.size, size_range(part.kind));
        }
        let hue = g.hue + rng.gauss() * p.get(id::HUE_SIGMA);
        // A hue just below 0 rounds up to exactly 1. The `%` sends that to 0.
        g.hue = (hue - hue.floor()) % 1.0;
        let (rate, sigma) = (p.get(id::MUT_WEIGHT_RATE), p.get(id::MUT_WEIGHT_SIGMA));
        let limit = (-WEIGHT_LIMIT, WEIGHT_LIMIT);
        for conn in &mut g.brain.conns {
            conn.weight = nudged(conn.weight, rng, rate, sigma, limit);
        }
        let BrainGenome { hidden, outs, .. } = &mut g.brain;
        let biases = hidden.iter_mut().map(|gene| &mut gene.bias);
        for bias in biases.chain(outs.iter_mut().map(|gene| &mut gene.bias)) {
            *bias = nudged(*bias, rng, rate, sigma, limit);
        }
        let alphas = hidden.iter_mut().map(|gene| &mut gene.alpha);
        for alpha in alphas.chain(outs.iter_mut().map(|gene| &mut gene.alpha)) {
            *alpha = nudged(*alpha, rng, rate, ALPHA_SIGMA, ALPHA_RANGE);
        }

        let sigma = p.get(id::MUT_SIGMA);
        let rate = p.get(id::MUT_SHAPE_RATE);
        if rate > 0.0 {
            for part in &mut g.parts {
                part.anchor = nudged(part.anchor, rng, rate, sigma, (0.0, 1.0));
                if part.kind == KIND_EYE {
                    part.extra = nudged(part.extra, rng, rate, sigma, (0.0, 1.0));
                }
            }
        }
        let rate = p.get(id::MUT_LIFE_RATE);
        if rate > 0.0 {
            for (gene, (lo, hi)) in [(&mut g.egg, EGG_RANGE), (&mut g.old, OLD_RANGE)] {
                *gene = nudged(*gene, rng, rate, sigma * (hi - lo), (lo, hi));
            }
        }
        if chance(rng, p.get(id::MUT_PART_REMOVE)) && !g.parts.is_empty() {
            g.parts.remove(rng.below(g.parts.len() as u32) as usize);
        }
        let count = g.parts.len();
        if chance(rng, p.get(id::MUT_PART_DUP)) && (1..MAX_PART_GENES).contains(&count) {
            let mut copy = g.parts[rng.below(count as u32) as usize].clone();
            copy.anchor = (copy.anchor + rng.gauss() * sigma).clamp(0.0, 1.0);
            let (from, to) = (copy.history, new_history(next_history));
            copy.history = to;
            g.parts.push(copy);
            // The body owns every port of owner `BODY`, so a part with that history has no wire.
            let conns = &mut g.brain.conns;
            let named =
                |c: &&ConnGene| from != BODY && (c.src.owner == from || c.dst.owner == from);
            let renamed = |node: Node| {
                let owner = if node.owner == from { to } else { node.owner };
                Node { owner, ..node }
            };
            let room = MAX_CONN_GENES.saturating_sub(conns.len());
            let wire = |c: &ConnGene| ConnGene {
                src: renamed(c.src),
                dst: renamed(c.dst),
                weight: c.weight,
                history: new_history(next_history),
            };
            let copies: Vec<ConnGene> = conns.iter().filter(named).take(room).map(wire).collect();
            conns.extend(copies);
        }
        let wire_sigma = p.get(id::NEW_CONN_SIGMA);
        if chance(rng, p.get(id::MUT_PART_ADD)) && g.parts.len() < MAX_PART_GENES {
            let wires = p.get(id::PART_WIRES) as usize;
            let before = brain::ports(&g);
            let kind = 1 + rng.below(ADDABLE_KINDS as u32) as u8;
            let (lo, hi) = size_range(kind);
            let (anchor, extra) = (rng.unit(), rng.unit());
            g.parts.push(PartGene {
                kind,
                anchor,
                size: p.get(id::PART_NEW_SIZE).clamp(lo, hi),
                extra,
                history: new_history(next_history),
            });
            let Ports { inputs, outputs } = brain::ports(&g);
            let new_inputs: Vec<Node> = (inputs.iter())
                .filter(|node| !before.inputs.contains(node))
                .copied()
                .collect();
            let targets = g.brain.targets(outputs.clone());
            for _ in 0..wires {
                g.brain
                    .connect(&new_inputs, &targets, rng, wire_sigma, next_history);
            }
            let hidden = g.brain.hidden.iter().map(|gene| Node::hidden(gene.id));
            let sources: Vec<Node> = inputs.iter().copied().chain(hidden).collect();
            for &output in outputs.iter().filter(|node| !before.outputs.contains(node)) {
                for _ in 0..wires {
                    g.brain
                        .connect_into(&sources, output, rng, wire_sigma, next_history);
                }
            }
        }

        let BrainGenome { hidden, conns, .. } = &mut g.brain;
        if chance(rng, p.get(id::MUT_CONN_REMOVE)) && !conns.is_empty() {
            conns.remove(rng.below(conns.len() as u32) as usize);
        }
        if chance(rng, p.get(id::MUT_NEURON_REMOVE)) && !hidden.is_empty() {
            let lost = Node::hidden(hidden.remove(rng.below(hidden.len() as u32) as usize).id);
            conns.retain(|c| c.src != lost && c.dst != lost);
        }
        if chance(rng, p.get(id::MUT_CONN_ADD)) {
            let Ports { inputs, outputs } = brain::ports(&g);
            let targets = g.brain.targets(outputs);
            let sources = [inputs, targets.clone()].concat();
            g.brain
                .connect(&sources, &targets, rng, wire_sigma, next_history);
        }
        let BrainGenome { hidden, conns, .. } = &mut g.brain;
        let room = hidden.len() < MAX_HIDDEN && conns.len() < MAX_CONN_GENES;
        if chance(rng, p.get(id::MUT_NEURON_ADD)) && room && !conns.is_empty() {
            let old = conns.remove(rng.below(conns.len() as u32) as usize);
            let new = Node::hidden(new_history(next_history));
            hidden.push(HiddenGene {
                id: new.owner,
                bias: 0.0,
                alpha: 1.0,
            });
            for (src, dst, weight) in [(old.src, new, 1.0), (new, old.dst, old.weight)] {
                conns.push(ConnGene {
                    src,
                    dst,
                    weight,
                    history: new_history(next_history),
                });
            }
        }
        g
    }

    /// Makes the brain genes hold what the body expresses. Runs on every genome that a birth
    /// makes, after crossover and mutation.
    ///
    /// Removes each connection with an end that the genome does not declare, or that runs into an
    /// input. Of the connections between one pair of ends, only the one with the lowest history
    /// stays. Removes the `OutGene` of an output that is not declared, and adds one with bias 0 and
    /// alpha 1 for a declared output that has none. The genes that stay keep their order.
    pub fn prune(&mut self) {
        let ports = brain::ports(self);
        let BrainGenome {
            hidden,
            outs,
            conns,
        } = &mut self.brain;
        let target = |n: Node| {
            let hidden = n.port == PORT_HIDDEN && hidden.iter().any(|gene| gene.id == n.owner);
            hidden || ports.outputs.contains(&n)
        };
        conns.retain(|c| target(c.dst) && (target(c.src) || ports.inputs.contains(&c.src)));
        let mut by_pair: Vec<usize> = (0..conns.len()).collect();
        by_pair.sort_by_key(|&i| (conns[i].src, conns[i].dst, conns[i].history));
        let mut second = vec![false; conns.len()];
        for pair in by_pair.windows(2) {
            let (first, next) = (&conns[pair[0]], &conns[pair[1]]);
            second[pair[1]] = (first.src, first.dst) == (next.src, next.dst);
        }
        let mut second = second.into_iter();
        conns.retain(|_| second.next() == Some(false));
        outs.retain(|gene| ports.outputs.contains(&gene.node));
        for node in ports.outputs {
            if !outs.iter().any(|gene| gene.node == node) {
                outs.push(resting(node));
            }
        }
    }

    /// The sum over the parts of that kind. A size that is not finite counts as 0, and a size is
    /// held in 0 to 1, as in `Creatures::express`.
    pub fn size_of(&self, kind: u8) -> f32 {
        let of_kind = self.parts.iter().filter(|part| part.kind == kind);
        // A fold from 0, because the sum of no floats is -0.
        of_kind.fold(0.0, |sum, part| sum + unit(part.size))
    }

    /// Sets the first part of the kind. With none, adds one at the founder anchor of the kind, with
    /// history 0, if the list has room. For founders and tests.
    pub fn set_size(&mut self, kind: u8, size: f32) {
        if let Some(part) = self.parts.iter_mut().find(|part| part.kind == kind) {
            part.size = size;
            return;
        }
        let founder = FOUNDER_PARTS.iter().find(|part| part.0 == kind);
        let (anchor, extra) = match (founder, kind) {
            (Some(part), _) => (part.1, 0.0),
            (None, KIND_EYE) => (FOUNDER_EYE_ANCHOR, FOUNDER_EYE_EXTRA),
            (None, KIND_JAW) => (JAW_ANCHOR, 0.0),
            (None, _) => (FIN_ANCHOR, 0.0),
        };
        if self.parts.len() < MAX_PART_GENES {
            self.parts.push(PartGene {
                kind,
                anchor,
                size,
                extra,
                history: 0,
            });
        }
    }

    /// The sizes of every part that is not an eye, summed in gene order, plus `eye_cost` times the
    /// sizes of the eyes. A size that is not finite counts as 0, and a size is held in 0 to 1, as in
    /// `Creatures::express`. So the sum is finite for any genome that `load` lets in.
    pub fn part_sum(&self, eye_cost: f32) -> f32 {
        let (mut plain, mut eyes) = (0.0, 0.0);
        for part in &self.parts {
            if part.kind == KIND_EYE {
                eyes += unit(part.size);
            } else {
                plain += unit(part.size);
            }
        }
        plain + eye_cost * eyes
    }

    pub fn save(&self, w: &mut Writer) {
        for gene in [self.len, self.wid, self.egg, self.old, self.hue] {
            w.f32(gene);
        }
        w.u32(self.parts.len() as u32);
        for part in &self.parts {
            w.u32(part.kind as u32);
            w.f32(part.anchor);
            w.f32(part.size);
            w.f32(part.extra);
            w.u32(part.history);
        }
        self.brain.save(w);
    }

    /// `Invalid` for more than `MAX_PART_GENES` parts or a kind outside `1..=KINDS`. The floats are
    /// not checked: `Creatures::express` is safe for any float. The lists of the brain are held to
    /// their caps: see `BrainGenome::load`.
    pub fn load(r: &mut Reader) -> Result<Genome, LoadError> {
        let (len, wid, egg, old, hue) = (r.f32()?, r.f32()?, r.f32()?, r.f32()?, r.f32()?);
        let count = r.u32()? as usize;
        if count > MAX_PART_GENES {
            return Err(LoadError::Invalid("genome part count"));
        }
        let mut parts = Vec::with_capacity(count);
        for _ in 0..count {
            let kind = r.u32()?;
            if !(1..=KINDS as u32).contains(&kind) {
                return Err(LoadError::Invalid("genome part kind"));
            }
            parts.push(PartGene {
                kind: kind as u8,
                anchor: r.f32()?,
                size: r.f32()?,
                extra: r.f32()?,
                history: r.u32()?,
            });
        }
        Ok(Genome {
            len,
            wid,
            egg,
            old,
            hue,
            parts,
            brain: BrainGenome::load(r)?,
        })
    }
}
