//! What a creature inherits: a body shape, a life history, a hue, a list of parts, and a brain.

use crate::brain::{self, MAX_NEURONS, N_IN, N_OUT};
use crate::params::{id, Params, DEFS};
use crate::rng::Rng;
use crate::snapshot::{LoadError, Reader, Writer};

#[derive(Clone)]
pub struct ConnGene {
    pub src: u16,
    pub dst: u16,
    pub weight: f32,
    pub history: u32,
}

#[derive(Clone)]
pub struct BrainGenome {
    pub n_hidden: u16,
    /// One per non-input neuron: hidden, then outputs.
    pub bias: Vec<f32>,
    /// The same length as `bias`. In `(0, 1]`.
    pub alpha: Vec<f32>,
    pub conns: Vec<ConnGene>,
}

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
/// Kinds are `1..=KINDS`. 0 means "no part" in a frame.
pub const KINDS: u8 = 6;

/// The ranges of the four body genes. Constants by decision (`docs/decisions/INDEX.md`, 2026-10-11,
/// "gene ranges stay constants"): the `len` band of `gate-evolve` is cut from `LEN_RANGE`.
pub const LEN_RANGE: (f32, f32) = (6.0, 24.0);
pub const WID_RANGE: (f32, f32) = (0.3, 0.9);
pub const EGG_RANGE: (f32, f32) = (0.2, 0.7);
pub const OLD_RANGE: (f32, f32) = (1200.0, 9600.0);
/// By kind. The four M1 kinds keep their M1 ranges.
pub const SIZE_RANGE: [(f32, f32); 7] = [
    (0.0, 0.0),
    (0.0, 1.0),
    (0.0, 1.0),
    (0.2, 1.0),
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
/// Where `set_size` puts a fin on a body that has none.
const FIN_ANCHOR: f32 = 0.6;
/// The last history id that a founder holds. Its brain connections take `1..=STARTER_CONNS`, its
/// four parts take the next four ids, and its eye takes this one.
pub const FOUNDER_HISTORIES: u32 = brain::STARTER_CONNS + FOUNDER_PARTS.len() as u32 + 1;
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

/// The smallest brain: no hidden neurons and no connections. Its outputs rest at 0.
impl Default for BrainGenome {
    fn default() -> BrainGenome {
        BrainGenome {
            n_hidden: 0,
            bias: vec![0.0; N_OUT],
            alpha: vec![1.0; N_OUT],
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

impl BrainGenome {
    fn save(&self, w: &mut Writer) {
        w.u32(self.n_hidden as u32);
        w.f32s(&self.bias);
        w.f32s(&self.alpha);
        w.u16s(&self.conns.iter().map(|c| c.src).collect::<Vec<_>>());
        w.u16s(&self.conns.iter().map(|c| c.dst).collect::<Vec<_>>());
        w.f32s(&self.conns.iter().map(|c| c.weight).collect::<Vec<_>>());
        w.u32s(&self.conns.iter().map(|c| c.history).collect::<Vec<_>>());
    }

    /// The neurons must fit a brain block, `bias` and `alpha` must have one value per non-input
    /// neuron, and every connection must run from a neuron of this brain to a non-input neuron of
    /// this brain. So the evaluator can index with a loaded genome without a check.
    fn load(r: &mut Reader) -> Result<BrainGenome, LoadError> {
        let n_hidden = r.u32()? as usize;
        if n_hidden > MAX_NEURONS - N_IN - N_OUT {
            return Err(LoadError::Invalid("brain genome hidden count"));
        }
        let (bias, alpha) = (r.f32s()?, r.f32s()?);
        if bias.len() != n_hidden + N_OUT || alpha.len() != bias.len() {
            return Err(LoadError::Invalid("brain genome bias or alpha count"));
        }
        let (src, dst, weight, history) = (r.u16s()?, r.u16s()?, r.f32s()?, r.u32s()?);
        if [dst.len(), weight.len(), history.len()] != [src.len(); 3] {
            return Err(LoadError::Invalid("brain genome connection count"));
        }
        let neurons = N_IN + n_hidden + N_OUT;
        let in_brain = |i: &u16| (*i as usize) < neurons;
        if !src.iter().all(in_brain) || !dst.iter().all(|d| in_brain(d) && *d as usize >= N_IN) {
            return Err(LoadError::Invalid("brain genome connection out of range"));
        }
        let conns = (0..src.len())
            .map(|i| ConnGene {
                src: src[i],
                dst: dst[i],
                weight: weight[i],
                history: history[i],
            })
            .collect();
        Ok(BrainGenome {
            n_hidden: n_hidden as u16,
            bias,
            alpha,
            conns,
        })
    }
}

impl Genome {
    /// The reference body, with each of len, wid, and the four part sizes moved by
    /// `gauss * founder_sigma * range` and clamped. A random hue. `brain::starter(rng, p)`. Draws in
    /// that order, which is the M1 order. `egg` is `birth_growth` and `old` is `lifespan`, with no
    /// draw. With `founder_eye` above 0 a fifth part follows, an eye of that size, with no draw.
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
                history: FOUNDER_HISTORIES,
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

    /// Len, wid, and each part size: with chance mut_rate, add gauss * mut_sigma * (max - min), clamp.
    /// Hue: add gauss * hue_sigma, wrap into [0, 1).
    /// Each brain weight, bias: with chance mut_weight_rate, add gauss * mut_weight_sigma.
    /// Each alpha: with chance mut_weight_rate, add gauss * 0.1, clamp to [0.05, 1].
    /// Weights and biases are clamped to [-8, 8]. The structure of the brain does not change yet.
    ///
    /// Draws in this order: len, wid, each part size in gene order, the hue, the weights, the
    /// biases, the alphas. That is the M1 order.
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
    ///    `*next_history`, and the counter rises.
    /// 5. Add. With chance mut_part_add, and with room, a new part goes on the end: a kind chosen
    ///    evenly, then an anchor in [0, 1), then an `extra` in [0, 1). Its size is part_new_size,
    ///    held in the range of its kind. Its id is `*next_history`, and the counter rises.
    ///
    /// In groups 3 to 5 the draw of the chance comes first. The other draws are made only if the
    /// mutation happens: a list with no part loses none and copies none, and a full list takes
    /// none.
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
        for bias in &mut g.brain.bias {
            *bias = nudged(*bias, rng, rate, sigma, limit);
        }
        for alpha in &mut g.brain.alpha {
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
            copy.history = new_history(next_history);
            g.parts.push(copy);
        }
        if chance(rng, p.get(id::MUT_PART_ADD)) && g.parts.len() < MAX_PART_GENES {
            let kind = 1 + rng.below(KINDS as u32) as u8;
            let (lo, hi) = size_range(kind);
            let (anchor, extra) = (rng.unit(), rng.unit());
            g.parts.push(PartGene {
                kind,
                anchor,
                size: p.get(id::PART_NEW_SIZE).clamp(lo, hi),
                extra,
                history: new_history(next_history),
            });
        }
        g
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
    /// not checked: `Creatures::express` is safe for any float. The brain is checked: see
    /// `BrainGenome::load`.
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
