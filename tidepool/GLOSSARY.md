# Tidepool

A browser game in which you play one creature among creatures that each run an evolved neural network. Sources: `docs/design.md` (what) and `docs/architecture.md` (how).

## Creatures

**Creature**:
One living body in the world, with a genome, a brain, and energy. Outside the core it is named by its `uid`.
_Avoid_: organism, critter, agent, cell

**uid**:
A creature's permanent `u32` identity from a birth counter. 0 means none. A `uid` is never reused.
_Avoid_: id, index (a **slot** is the reusable index)

**Slot**:
A creature's position in the struct-of-arrays pools of `World`. A slot is reused after a death.
_Avoid_: id, entity

**Genome**:
The heritable data of a creature: its part genes and its brain genome (`Genome`, `PartGene`, `BrainGenome`).
_Avoid_: DNA, chromosome

**Part**:
A body piece declared by a part gene that grants an ability and declares brain inputs and outputs. A part does what it looks like it does.
_Avoid_: organ, module, component

**Brain**:
A creature's recurrent neural network, grown from node genes and connection genes. A creature thinks on one tick in `think_every`.
_Avoid_: AI, controller, net

## Reproduction

**Budding**:
A creature with enough energy making a mutated copy of itself, alone (`repro::step`).
_Avoid_: spawning, cloning, splitting

**Mixing**:
Two creatures in contact that both accept exchanging genes, so the next brood of each is a crossover with the partner. The tick phase is `mate` and the chance is `mix_rate`.
_Avoid_: sex, breeding

**Lineage**:
Everything descended, parent to child, from one creature. Every creature has one parent, the one that budded it. A gene donor is a cross-link, not a parent.
_Avoid_: family, species, line (in code and docs)

## Play

**Possess**:
To take control of a creature. Its outputs are replaced by player input when manual (tick phase `control`). The possessed creature still runs on the same rules as every other.
_Avoid_: spawn as, become, select

**Skip**:
The fast-forward of many generations with no player, after the player's creature dies.
_Avoid_: time-jump, fast-forward (in code and docs)

**Heir**:
A living descendant offered to the player after a skip, to possess next.
_Avoid_: respawn, successor

## Simulation

**Tick**:
One step of the world, run in a fixed order of phases (`docs/architecture.md` §5.2).
_Avoid_: frame (a frame is the packed buffer sent to the page), step

**State hash**:
The CRC32 of the saved bytes of `World`. Equal hashes in native and WASM are what determinism means here.
_Avoid_: checksum, fingerprint

**Snapshot**:
The byte buffer `World::save` writes and `World::load` reads: magic `TDPL`, format version, payload, CRC32.
_Avoid_: save file, dump

**Param**:
A named tunable `f32` in the table in `params.rs`, with a default, a minimum, and a maximum.
_Avoid_: constant, setting, knob

**Gate**:
A headless check with a pass threshold (`make gates`) that counts only after it has rejected a known-bad input (`docs/gates.md`).
_Avoid_: test, benchmark
