# Diet and coexistence: what the literature says (2026-10-16)

Asked for by the owner on 2026-10-16: hunters that only eat meat, and a spectrum from herbivore to
carnivore. Gathered by a `researcher` agent from primary sources where it could reach them. Every
row gives its confidence. "Not confirmed" means the agent could not read the source itself. The
decisions taken from it are in `../decisions/INDEX.md` (2026-10-16) and the plan
`../plans/2026-10-16-m4-retune-diet.md`.

**The main finding:** the shape of the trade-off matters, and so does where it acts. A diet gene that
changes only how well a body digests each food does not split a lineage into specialists at any
exponent: one generalist or one specialist wins (Rueffler et al. 2006). The gene must change how much
of each food a body takes in, or bodies must choose different foods. Then a specialist depletes its
own food, a rare type gains an edge, and the lineage can split.

## (a) Assimilation and transfer efficiency

| Finding | Source | Confidence |
|---|---|---|
| Assimilation by food type: animal prey 0.906, plants 0.545, detritus 0.158 | Lang, Ehnes, Brose & Rall 2017, *Oikos*, doi:10.1111/oik.04419 (numbers read from the fluxweb R vignette that cites it) | Medium |
| Carnivores 60% to 90%. Herbivores: seeds about 80%, young leaves 60%, old leaves 30% to 40%, wood 10% to 20% | Lecture notes, https://www.batrachos.com/en/ekoefektyvnosti/ (no original citations) | Low |
| Mean transfer efficiency between trophic levels 10%, from 48 trophic models | Pauly & Christensen 1995, *Nature* 374:255, doi:10.1038/374255a0 | Medium |
| Transfer efficiency is highly variable across marine ecosystems | Eddy et al. 2021, *TREE* 36:76, doi:10.1016/j.tree.2020.09.006 | High |
| Herbivores have longer guts and more amylase, carnivores shorter guts and more protease, omnivores between | German et al. 2015, *Zoology* review | Medium |
| Digestive capacity matches dietary load with a modest surplus | Karasov, Martínez del Río & Caviedes-Vidal 2011, *Annu Rev Physiol* 73:69, doi:10.1146/annurev-physiol-012110-142250 | High |
| A lizard population that shifted to plants evolved cecal valves in about 36 years | Herrel et al. 2008, *PNAS*, doi:10.1073/pnas.0711998105 | Medium |
| Trade-off models predict omnivory is rare, yet omnivores are common | Chubaty et al. 2014, *Ecol Evol* 4:251, doi:10.1002/ece3.923 | High |

Meat assimilation near 0.9 means a 1:1 bite is close to biology at the digestion step. The 90% loss
per trophic level is mostly metabolism and uneaten food. The fault of Tidepool's bite is that a jaw
has no trade-off, not that digestion is wrong.

## (b) The shape of the trade-off

Notation: plant intake factor `(1−d)^k`, flesh intake factor `d^k`, one gene `d` in [0, 1]. `k = 1`
is neutral. A generalist at `d = 0.5` gets `2^−k` of each.

| Finding | Source | Confidence |
|---|---|---|
| `k < 1` (a weak trade-off): the generalist is the only stable end, for every foraging trait | Rueffler, Van Dooren & Metz 2006, *Am Nat* 167:81, doi:10.1086/498275, pp. 86 to 88 | High |
| Branching needs frequency dependence. Capture and search efficiency are frequency-dependent. Conversion efficiency and handling time are not (Table 2) | Rueffler 2006 | High |
| `k > 1` on a frequency-dependent trait: the population goes to the generalist, which becomes a branching point, and ends in two specialists. Rueffler's example of a strong trade-off is `k = 1.25` | Rueffler 2006, pp. 87 to 89 | High |
| `k > 1` on conversion efficiency alone: one specialist wins, by where the population starts | Rueffler 2006, p. 89 | High |
| Bodies that choose their food make even a digestion trade-off frequency-dependent. A specialist plus an opportunist (an omnivore) can be a stable pair | Rueffler, Van Dooren & Metz 2007, *Am Nat* 169:E34, doi:10.1086/510635 | High |
| Gradual evolution rarely reaches a mix of specialists and generalists without immigration or mutations of large effect | Egas, Dieckmann & Sabelis 2004, *Am Nat* 163:518, doi:10.1086/382599 | High |
| Levins: a weak trade-off favours a generalist, a strong one a specialist, without frequency dependence | Levins 1962, *Am Nat* 96:361, doi:10.1086/282245, as summarised by Rueffler 2006 | Medium |

## (c) Stabilisers that a local rule can carry

| Stabiliser | Mechanism | Evidence | Failure modes | Confidence |
|---|---|---|---|---|
| Prey refuge | Some prey are out of reach, by place or size | Huffaker 1958, *Hilgardia* 27:343, doi:10.3733/hilg.v27n14p343 | Can destabilise locally (McNair 1986, doi:10.1016/0040-5809(86)90004-3; Krivan 1998, doi:10.1006/tpbi.1998.1351) | Medium |
| Predator interference (Beddington–DeAngelis) | Feeding rate falls as more predators are near | Predator-dependent responses fit 18 of 19 data sets better than Holling type II (Skalski & Gilliam 2001, *Ecology* 82:3083) | That the 1975 papers prove stabilisation is not confirmed | Medium |
| Prey switching | Predators attack the commoner prey more than its share | Murdoch 1969, doi:10.2307/1942352 (concept only) | Can stabilise or destabilise | Low to medium |
| Paradox of enrichment | More food input drives cycles | Rosenzweig 1971, doi:10.1126/science.171.3969.385. Laan & Fox 2019, doi:10.1111/oik.06552 | Detritus often stabilises (Moore et al. 2004, doi:10.1111/j.1461-0248.2004.00606.x). Untested for Tidepool's debris | Medium |
| Search image on common prey | Predators learn the common form, rare forms survive | Bond & Kamil 2002, *Nature* 415:609, doi:10.1038/415609a | Needs learning predators | Medium |

Tidepool's `bite_mass_ratio` is already a size refuge. Interference is the most local of the rest.

## (d) Space and migration

| Finding | Source | Confidence |
|---|---|---|
| Linked bottles kept predator and prey about 130 days. One undivided tank of the same volume lost predators in about 70, isolated bottles in about 19 | Holyoak & Lawler 1996, *Ecology* 77:1867, doi:10.2307/2265790 | Medium |
| Habitat structure helped because predators found prey outbreaks less often | Ellner et al. 2001, *Nature* 412:538, doi:10.1038/35087580 | Medium |
| Three strains coexisted with local dispersal and lost diversity with global dispersal | Kerr, Riley, Feldman & Bohannan 2002, *Nature* 418:171, doi:10.1038/nature00823 | High |
| Restricted migration favoured prudent exploiters, unrestricted migration rapacious ones | Kerr, Neuhauser, Bohannan & Dean 2006, *Nature* 442:75, doi:10.1038/nature04864 | High |
| More connectivity can synchronise local cycles and raise the risk of global extinction | Earn, Levin & Rohani 2000, *Science* 290:1360, doi:10.1126/science.290.5495.1360 | High |

Subdivision beat area. Too little migration fails, and too much synchronises patches and favours
over-exploiting hunters. No source gives an optimal rate. A well-mixed world selects rapacious
hunters, which is the shape of Tidepool's takeover.

## (e) Diet in other artificial-life simulations

| Simulation | Rule | Coexistence | Confidence |
|---|---|---|---|
| The Bibites | Meat affinity `d`, plant affinity `1 − d`. Efficiency linear in affinity (`k = 1`) with negative floors | Herbivory is the most common adaptation | Medium (community wiki) |
| Species: ALRE | Diet −1 to 1. A "Niches" option lowers food efficiency as more bodies eat that food | Players report herbivore-only worlds and carnivores that wipe out herbivores | Low (forum) |
| PolyWorld | No diet trait. Any body eats any food | "Indolent cannibals" until parents paid for offspring | High (Yaeger 1994) |
| Avida (research build) | A kill passes on 10% of the prey's store. Attacks fail under 700 prey | Predators and prey coevolved over 2 million updates | High (Wagner et al. 2013, arXiv:1310.1369) |
| Chubaty et al. 2014 | Separate intake and assimilation traits, quadratic upkeep | Herbivores, omnivores, and carnivores coexisted. Pure carnivores were rare | High |
| Evolve 4.0, Avida-ED | Not confirmed | — | — |

## What the agent recommended

A diet gene `d` with the trade-off on intake: filter intake times `(1−d)^k`, bite times `d^k`, `k`
from 1.5, swept 1.2 to 2.5. A fixed assimilation per food with the rest to debris. If that is not
enough, one stabiliser: predator interference, bite yield over `1 + c·n` for `n` other jaws near.

## Open

Not obtained: Lindeman's own table, Lang 2017 itself, Murdoch 1969's abstract. Branching thresholds
come from models with explicit resource equations: Tidepool's must be found by sweeping `k`. Whether
Tidepool's debris acts as stabilising detritus or as enrichment is untested.
