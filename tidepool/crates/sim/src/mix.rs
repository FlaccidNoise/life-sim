//! Crossover: the genome of a child from the genome of its budding parent and that of a gene donor.

use crate::genome::{Genome, MAX_CONN_GENES, MAX_HIDDEN, MAX_PART_GENES};
use crate::params::{id, Params};
use crate::rng::Rng;

/// One gene list of the child, which starts as the home's. Two genes line up when `key` gives the
/// same id for both, wherever they sit in their lists.
///
/// Each home gene in gene order: if the donor holds its id, one draw, and with chance `swap` the
/// gene takes the donor's numbers through `take`. Then each gene that only the donor holds, in the
/// donor's order: one draw, and with chance `foreign` a copy goes on the end. The second pass ends
/// when the list holds `most` genes, and it draws nothing after that.
fn mix<G: Clone, K: PartialEq>(
    rng: &mut Rng,
    (swap, foreign): (f32, f32),
    (child, donor): (&mut Vec<G>, &[G]),
    most: usize,
    key: impl Fn(&G) -> K,
    take: impl Fn(&mut G, &G),
) {
    for gene in child.iter_mut() {
        if let Some(theirs) = donor.iter().find(|d| key(d) == key(gene)) {
            if rng.unit() < swap {
                take(gene, theirs);
            }
        }
    }
    for theirs in donor {
        if child.len() >= most {
            break;
        }
        if !child.iter().any(|gene| key(gene) == key(theirs)) && rng.unit() < foreign {
            child.push(theirs.clone());
        }
    }
}

/// The home genome, with some genes from the donor. A gene that both hold takes the donor's
/// numbers with chance `mix_swap`. A gene that only the donor holds is taken with chance
/// `mix_foreign`, while its list has room. A gene that only the home holds stays. The hue is the
/// home's: a lineage keeps its colour.
///
/// Parts and connections line up by history id, hidden genes by id, and out genes by the output
/// that they name. A shared gene keeps the home's kind and the home's two ends.
///
/// Draws in this order: `len`, `wid`, `egg`, `old`, `diet`, the parts, the hidden genes, the out genes,
/// the connections. In each list the shared genes come first, in the home's order, and then the
/// donor's own, in the donor's order. See `mix` for what makes a draw.
///
/// The child can hold a connection with an end that it does not declare: `Genome::prune` removes
/// it, after the mutation.
pub fn cross(home: &Genome, donor: &Genome, rng: &mut Rng, p: &Params) -> Genome {
    let rates = (p.get(id::MIX_SWAP), p.get(id::MIX_FOREIGN));
    let mut g = home.clone();
    for (gene, theirs) in [
        (&mut g.len, donor.len),
        (&mut g.wid, donor.wid),
        (&mut g.egg, donor.egg),
        (&mut g.old, donor.old),
        (&mut g.diet, donor.diet),
    ] {
        if rng.unit() < rates.0 {
            *gene = theirs;
        }
    }
    mix(
        rng,
        rates,
        (&mut g.parts, &donor.parts),
        MAX_PART_GENES,
        |part| part.history,
        |part, d| (part.anchor, part.size, part.extra) = (d.anchor, d.size, d.extra),
    );
    mix(
        rng,
        rates,
        (&mut g.brain.hidden, &donor.brain.hidden),
        MAX_HIDDEN,
        |gene| gene.id,
        |gene, d| (gene.bias, gene.alpha) = (d.bias, d.alpha),
    );
    // No room: the body declares the outputs, so no out gene is taken.
    mix(
        rng,
        rates,
        (&mut g.brain.outs, &donor.brain.outs),
        0,
        |gene| gene.node,
        |gene, d| (gene.bias, gene.alpha) = (d.bias, d.alpha),
    );
    mix(
        rng,
        rates,
        (&mut g.brain.conns, &donor.brain.conns),
        MAX_CONN_GENES,
        |conn| conn.history,
        |conn, d| conn.weight = d.weight,
    );
    g
}
