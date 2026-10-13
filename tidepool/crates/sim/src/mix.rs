//! Crossover: the genome of a child from the genome of its budding parent and that of a gene donor.

use crate::genome::Genome;
use crate::params::Params;
use crate::rng::Rng;

/// A stub: a copy of `home`, with no draw.
pub fn cross(home: &Genome, _donor: &Genome, _rng: &mut Rng, _p: &Params) -> Genome {
    home.clone()
}
