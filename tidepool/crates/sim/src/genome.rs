//! What a creature inherits: six body genes, a hue, and a brain.

use crate::brain::{self, MAX_NEURONS, N_IN, N_OUT};
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

#[derive(Clone)]
pub struct Genome {
    pub len: f32,
    pub wid: f32,
    pub flagellum: f32,
    pub cilia: f32,
    pub filter: f32,
    pub chemo: f32,
    pub hue: f32,
    pub brain: BrainGenome,
}

/// len, wid, flagellum, cilia, filter, chemo
pub const GENE_RANGE: [(f32, f32); 6] = [
    (6.0, 24.0),
    (0.3, 0.9),
    (0.0, 1.0),
    (0.0, 1.0),
    (0.2, 1.0),
    (0.0, 1.0),
];
pub const GENE_DEFAULT: [f32; 6] = [12.0, 0.5, 0.6, 0.4, 0.6, 0.5];
/// How far a founder's body gene sits from its default, as a share of the gene's range.
const FOUNDER_SIGMA: f32 = 0.05;

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

/// The default body with hue 0 and the smallest brain.
impl Default for Genome {
    fn default() -> Genome {
        let [len, wid, flagellum, cilia, filter, chemo] = GENE_DEFAULT;
        Genome {
            len,
            wid,
            flagellum,
            cilia,
            filter,
            chemo,
            hue: 0.0,
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
    /// The defaults, each moved by `gauss * FOUNDER_SIGMA * range` and clamped. A random hue.
    /// `brain::starter(rng)`. Draws in that order.
    pub fn founder(rng: &mut Rng) -> Genome {
        let mut genes = GENE_DEFAULT;
        for (gene, (lo, hi)) in genes.iter_mut().zip(GENE_RANGE) {
            *gene = (*gene + rng.gauss() * FOUNDER_SIGMA * (hi - lo)).clamp(lo, hi);
        }
        let [len, wid, flagellum, cilia, filter, chemo] = genes;
        let hue = rng.unit();
        Genome {
            len,
            wid,
            flagellum,
            cilia,
            filter,
            chemo,
            hue,
            brain: brain::starter(rng),
        }
    }

    pub fn save(&self, w: &mut Writer) {
        let genes = [
            self.len,
            self.wid,
            self.flagellum,
            self.cilia,
            self.filter,
            self.chemo,
            self.hue,
        ];
        for gene in genes {
            w.f32(gene);
        }
        self.brain.save(w);
    }

    /// The body genes are not checked. The brain is: see `BrainGenome::load`.
    pub fn load(r: &mut Reader) -> Result<Genome, LoadError> {
        Ok(Genome {
            len: r.f32()?,
            wid: r.f32()?,
            flagellum: r.f32()?,
            cilia: r.f32()?,
            filter: r.f32()?,
            chemo: r.f32()?,
            hue: r.f32()?,
            brain: BrainGenome::load(r)?,
        })
    }
}
