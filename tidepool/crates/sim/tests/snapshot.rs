use tidepool_sim::ability::MAX_CLOUDS;
use tidepool_sim::brain::READOUT_HEADER_WORDS;
use tidepool_sim::brain::{self, IN_CONST, IN_ENERGY, MAX_NEURONS, N_OUT_MAX};
use tidepool_sim::control::{
    CAUSE_EATEN, CAUSE_OLD_AGE, CAUSE_SPIKED, CAUSE_STARVED, KILLER_BODY_WORDS,
};
use tidepool_sim::creature::{MAX_CREATURES, MAX_EYES};
use tidepool_sim::debris::MAX_DEBRIS;
use tidepool_sim::frame;
use tidepool_sim::genome::{
    BrainGenome, ConnGene, Genome, HiddenGene, Node, OutGene, KIND_EYE, MAX_CONN_GENES, MAX_HIDDEN,
};
use tidepool_sim::params::{id, Params, DEFS};
use tidepool_sim::plant::MAX_PLANTS;
use tidepool_sim::snapshot::{seal, LoadError, Writer, FORMAT_VERSION};
use tidepool_sim::stats::{STAT_BIRTHS, STAT_DEATHS, STAT_MEAN_ENERGY01};
use tidepool_sim::world::{SpawnAt, World, MAX_WORLD_SIZE};

/// The inputs and the outputs that the default body declares: `brain::ports`. It has a
/// chemoreceptor and no eye.
const N_IN: usize = 11;
const N_OUT: usize = 4;

/// Founders, plants, a changed parameter, a possessed creature, held manual input, and a piece of
/// debris and a cloud set by hand. At the defaults the piece decays by `debris_decay` each tick and
/// no filter reaches it. The cloud counts down and drains the bodies inside it (rule A3), and
/// lives longer than any run here.
fn world_at(ticks: u32) -> World {
    let mut w = World::new(9, 1536.0, 1024.0);
    w.params.set(id::REPEL, 0.5);
    w.seed_founders(400, 1200);
    assert!(w.possess(w.creatures.uid[3]));
    w.input(true, 0.8, 0.5, false, 0);
    let d = w.debris.slots.alloc().expect("debris slot") as usize;
    (w.debris.x[d], w.debris.y[d], w.debris.energy[d]) = (100.0, 200.0, 5.0);
    w.debris.dirty = true;
    let k = w.clouds.slots.alloc().expect("cloud slot") as usize;
    let c = &mut w.clouds;
    (
        c.x[k],
        c.y[k],
        c.radius[k],
        c.left[k],
        c.drain[k],
        c.maker[k],
    ) = (300.0, 400.0, 20.0, 2000, 0.5, 2);
    w.run(ticks);
    w
}

#[test]
fn load_then_run_equals_unbroken_run() {
    let saved = world_at(1000).save();
    let mut resumed = World::load(&saved).expect("load");
    resumed.run(1000);
    assert_eq!(resumed.state_hash(), world_at(2000).state_hash());
}

/// The save falls between births: `world_at` has 352 by tick 1,500 and 717 by tick 3,000. So the
/// genomes of the born, the cooldowns of their parents, and `rng_mutate` are all in the round trip.
#[test]
fn load_then_run_equals_unbroken_run_across_births() {
    let saved = world_at(1500);
    let births_at_save = saved.stat(STAT_BIRTHS);
    let mut resumed = World::load(&saved.save()).expect("load");
    resumed.run(1500);
    let unbroken = world_at(3000);
    assert!(births_at_save > 0.0, "no births before the save");
    assert!(
        unbroken.stat(STAT_BIRTHS) > births_at_save,
        "no births after the save"
    );
    assert_eq!(resumed.state_hash(), unbroken.state_hash());
}

#[test]
fn load_gives_the_same_hash_immediately() {
    let w = world_at(300);
    assert_eq!(
        World::load(&w.save()).expect("load").state_hash(),
        w.state_hash()
    );
}

#[test]
fn spawning_after_load_matches_spawning_without_it() {
    let mut a = world_at(100);
    let mut b = World::load(&a.save()).expect("load");
    a.seed_founders(10, 0);
    b.seed_founders(10, 0);
    assert_eq!(a.state_hash(), b.state_hash());
}

#[test]
fn possession_and_a_parameter_survive_a_round_trip() {
    let mut w = world_at(100);
    let uid = w.creatures.uid[3];
    w.params.set(id::DRAG_FWD, 0.2);
    let loaded = World::load(&w.save()).expect("load");
    assert_eq!(
        (loaded.control.possessed, loaded.control.possessed_slot),
        (uid, 3)
    );
    let c = &loaded.control;
    assert_eq!((c.manual, c.thrust, c.turn), (true, 0.8, 0.5));
    assert_eq!(loaded.params.get(id::DRAG_FWD), 0.2);
    assert_eq!(loaded.params.get(id::REPEL), 0.5);
    assert_eq!(loaded.creatures.mark[3] & 1, 1);
}

/// The body arrays are not saved. A load makes them again from the genomes.
#[test]
fn a_load_expresses_every_body_again() {
    let mut w = World::new(9, 1536.0, 1024.0);
    w.params.set(id::FOUNDER_EYE, 0.2);
    // Every body keeps the founder's one pair of eyes: no eye is copied, lost, or moved to the
    // midline.
    for k in [
        id::MUT_SHAPE_RATE,
        id::MUT_PART_ADD,
        id::MUT_PART_REMOVE,
        id::MUT_PART_DUP,
    ] {
        w.params.set(k, 0.0);
    }
    w.seed_founders(400, 1200);
    w.run(1500);
    let loaded = World::load(&w.save()).expect("load");
    let (a, b) = (&w.creatures, &loaded.creatures);
    let live = a.slots.high_water() as usize;
    assert!(w.stats.births > 0, "no births before the save");
    for s in (0..live).filter(|&s| a.slots.is_alive(s as u32)) {
        let floats = |c: &tidepool_sim::creature::Creatures| {
            [
                c.len[s],
                c.wid[s],
                c.hue[s],
                c.egg[s],
                c.old[s],
                c.diet[s],
                c.flag_push[s],
                c.flag_side[s],
                c.cilia[s],
                c.fin[s],
                c.filter[s],
                c.chemo[s],
                c.plain_sum[s],
                c.eye_sum[s],
            ]
        };
        assert_eq!(floats(a), floats(b), "slot {s}");
        assert_eq!((a.n_eyes[s], b.n_eyes[s]), (2, 2), "slot {s}");
        let eyes = s * MAX_EYES..s * MAX_EYES + 2;
        assert_eq!(a.eye_dir[eyes.clone()], b.eye_dir[eyes.clone()]);
        assert_eq!(a.eye_cos[eyes.clone()], b.eye_cos[eyes.clone()]);
        assert_eq!(a.eye_size[eyes.clone()], b.eye_size[eyes]);
    }
}

/// One change to each saved field. Each must change the hash, and the changed world must load back
/// to the same hash. A field missing from `save` fails the first check. A field that `load` drops
/// fails the second.
#[test]
fn every_saved_field_is_in_the_hash_and_survives_a_load() {
    const S: usize = 5;
    type Edit = fn(&mut World);
    let edits: &[(&str, Edit)] = &[
        ("tick", |w| w.tick += 1),
        // Half a unit less leaves every grid with the same count of cells, so the maps still fit.
        ("w", |w| w.w -= 0.5),
        ("h", |w| w.h -= 0.5),
        ("next_uid", |w| w.next_uid += 1),
        ("next_history", |w| w.next_history += 1),
        ("rng_spawn", |w| w.rng_spawn.0 ^= 1),
        ("rng_mutate", |w| w.rng_mutate.0 ^= 1),
        ("rng_plants", |w| w.rng_plants.0 ^= 1),
        ("rng_mate", |w| w.rng_mate.0 ^= 1),
        ("params", |w| w.params.set(id::CHEMO_GAIN, 9.0)),
        // Two founders trade uids, so each uid is still alive once and above its parent.
        ("uid", |w| w.creatures.uid.swap(S, S + 1)),
        ("x", |w| w.creatures.x[S] += 1.0),
        ("y", |w| w.creatures.y[S] += 1.0),
        ("vx", |w| w.creatures.vx[S] += 1.0),
        ("vy", |w| w.creatures.vy[S] += 1.0),
        ("heading", |w| w.creatures.heading[S] += 0.01),
        ("omega", |w| w.creatures.omega[S] += 1.0),
        ("cmd_thrust", |w| w.creatures.cmd_thrust[S] += 0.1),
        ("cmd_turn", |w| w.creatures.cmd_turn[S] += 0.01),
        ("cmd_accept", |w| w.creatures.cmd_accept[S] += 0.1),
        ("mate_size", |w| w.creatures.mate_size[S] += 0.1),
        ("mate_kin", |w| w.creatures.mate_kin[S] += 0.1),
        ("growth", |w| w.creatures.growth[S] -= 0.1),
        ("energy", |w| w.creatures.energy[S] += 1.0),
        ("age", |w| w.creatures.age[S] += 1),
        ("generation", |w| w.creatures.generation[S] += 1),
        ("parent", |w| w.creatures.parent[S] = 1),
        ("mixed_with", |w| w.creatures.mixed_with[S] = 1),
        ("mark", |w| w.creatures.mark[S] ^= 1),
        ("bud_cooldown", |w| w.creatures.bud_cooldown[S] += 1),
        ("cmd_dash", |w| w.creatures.cmd_dash[S] += 0.1),
        ("cmd_toxin", |w| w.creatures.cmd_toxin[S] += 0.1),
        ("cd_dash", |w| w.creatures.cd_dash[S] += 1),
        ("cd_toxin", |w| w.creatures.cd_toxin[S] += 1),
        ("strike_left", |w| w.creatures.strike_left[S] += 1),
        ("hurt", |w| w.creatures.hurt[S] += 0.5),
        ("hurt_side", |w| w.creatures.hurt_side[S] -= 0.5),
        ("genome len", |w| w.genomes[S].len += 1.0),
        ("genome wid", |w| w.genomes[S].wid += 0.1),
        ("genome egg", |w| w.genomes[S].egg += 0.1),
        ("genome old", |w| w.genomes[S].old += 1.0),
        ("genome hue", |w| w.genomes[S].hue += 0.1),
        ("genome diet", |w| w.genomes[S].diet += 0.1),
        // A part that changes what the body declares. `brain::load` reads one activation for
        // each neuron that the loaded genome expresses, so the block is expressed again.
        ("part kind", |w| {
            w.genomes[S].parts[0].kind = KIND_EYE;
            w.brains.express(S, &w.genomes[S], &w.params);
        }),
        ("part anchor", |w| w.genomes[S].parts[1].anchor += 0.1),
        ("part size", |w| w.genomes[S].parts[2].size += 0.1),
        ("part extra", |w| w.genomes[S].parts[3].extra += 0.1),
        ("part history", |w| w.genomes[S].parts[3].history += 1),
        ("part count", |w| {
            w.genomes[S].parts.pop();
            w.brains.express(S, &w.genomes[S], &w.params);
        }),
        ("genome bias", |w| w.genomes[S].brain.hidden[0].bias += 0.5),
        ("genome alpha", |w| w.genomes[S].brain.hidden[0].alpha = 0.5),
        ("hidden id", |w| w.genomes[S].brain.hidden[0].id += 1000),
        ("output bias", |w| w.genomes[S].brain.outs[0].bias += 0.5),
        ("output alpha", |w| w.genomes[S].brain.outs[1].alpha = 0.5),
        ("output name", |w| {
            w.genomes[S].brain.outs[1].node.port = 200
        }),
        ("output count", |w| {
            w.genomes[S].brain.outs.pop();
        }),
        // The brain gets one more hidden neuron, so the block is expressed again.
        ("hidden neuron count", |w| {
            w.genomes[S].brain.hidden.push(HiddenGene {
                id: 900,
                bias: 0.0,
                alpha: 1.0,
            });
            w.brains.express(S, &w.genomes[S], &w.params);
        }),
        // The first hidden neuron.
        ("brain activation", |w| {
            w.brains.cur[S * MAX_NEURONS + w.brains.n_in[S] as usize] += 0.5
        }),
        ("genome connections", |w| {
            let gene = ConnGene {
                src: Node::body(IN_CONST),
                dst: Node::hidden(w.genomes[S].brain.hidden[0].id),
                weight: 1.0,
                history: 3,
            };
            w.genomes[S].brain.conns.push(gene);
        }),
        ("connection source", |w| {
            w.genomes[S].brain.conns[0].src = Node::body(IN_ENERGY)
        }),
        ("connection target", |w| {
            w.genomes[S].brain.conns[0].dst.owner = 900
        }),
        ("connection weight", |w| {
            w.genomes[S].brain.conns[0].weight += 0.5
        }),
        ("connection history", |w| {
            w.genomes[S].brain.conns[0].history += 1000
        }),
        ("donor", |w| w.donors[S] = Some((2, w.genomes[2].clone()))),
        ("births", |w| w.stats.births += 1),
        ("deaths", |w| w.stats.deaths += 1),
        ("eaten", |w| w.stats.eaten += 0.5),
        ("starved_juv", |w| w.stats.starved_juv += 1),
        ("plant_deaths", |w| w.stats.plant_deaths += 1),
        ("flesh", |w| w.stats.flesh += 0.5),
        ("kills", |w| w.stats.kills += 1),
        ("poisoned", |w| w.stats.poisoned += 1),
        ("spiked", |w| w.stats.spiked += 1),
        ("debris_eaten", |w| w.stats.debris_eaten += 0.5),
        ("possessed", |w| assert!(w.possess(w.creatures.uid[S]))),
        ("manual input", |w| w.input(true, 0.3, -0.2, false, 0)),
        ("accept input", |w| w.input(true, 0.8, 0.5, true, 0)),
        ("death cause", |w| w.kill(3, CAUSE_OLD_AGE, None)),
        ("buds", |w| w.control.buds += 1),
        ("killer", |w| w.control.killer = 2),
        ("killer_brain", |w| w.control.killer_brain.push(7)),
        ("killer_body", |w| {
            w.control.killer_body = vec![7; KILLER_BODY_WORDS as usize]
        }),
        ("abilities", |w| w.input(true, 0.8, 0.5, false, 4)),
        ("cloud slots", |w| w.clouds.slots.free(0)),
        ("cloud x", |w| w.clouds.x[0] += 1.0),
        ("cloud y", |w| w.clouds.y[0] += 1.0),
        ("cloud radius", |w| w.clouds.radius[0] += 1.0),
        ("cloud left", |w| w.clouds.left[0] += 1),
        ("cloud drain", |w| w.clouds.drain[0] += 0.1),
        ("cloud maker", |w| w.clouds.maker[0] = 3),
        ("plant slots", |w| w.plants.slots.free(S as u32)),
        ("plant x", |w| w.plants.x[S] += 1.0),
        ("plant y", |w| w.plants.y[S] += 1.0),
        ("plant reserve", |w| w.plants.reserve[S] *= 0.5),
        ("plant cap", |w| w.plants.cap[S] += 1.0),
        ("fertility", |w| w.fertility.v[S] = 0.123),
        ("debris slots", |w| w.debris.slots.free(0)),
        ("debris x", |w| w.debris.x[0] += 1.0),
        ("debris y", |w| w.debris.y[0] += 1.0),
        ("debris energy", |w| w.debris.energy[0] += 1.0),
        ("scent", |w| w.scent.a[S] += 1.0),
    ];
    let base = world_at(50).state_hash();
    for (name, edit) in edits {
        let mut w = world_at(50);
        edit(&mut w);
        let hash = w.state_hash();
        assert_ne!(hash, base, "{name} is not in the hash");
        let loaded = World::load(&w.save()).unwrap_or_else(|e| panic!("{name}: {e:?}"));
        assert_eq!(loaded.state_hash(), hash, "{name} did not survive a load");
    }

    // The genome of a donor is in the hash as well, and it survives a load.
    let with_donor = |edit: fn(&mut Genome)| {
        let mut w = world_at(50);
        let mut genome = w.genomes[2].clone();
        edit(&mut genome);
        w.donors[S] = Some((2, genome));
        w
    };
    let (plain, changed) = (with_donor(|_| {}), with_donor(|g| g.len += 1.0));
    assert_ne!(changed.state_hash(), plain.state_hash());
    let loaded = World::load(&changed.save()).expect("load");
    assert_eq!(loaded.state_hash(), changed.state_hash());
}

#[test]
fn a_flipped_byte_is_rejected() {
    let mut bytes = world_at(100).save();
    let mid = bytes.len() / 2;
    bytes[mid] ^= 0x40;
    assert_eq!(World::load(&bytes).err(), Some(LoadError::BadChecksum));
}

#[test]
fn garbage_is_rejected_without_panic() {
    assert_eq!(World::load(&[]).err(), Some(LoadError::TooShort));
    assert_eq!(
        World::load(b"NOPE00000000000000000000").err(),
        Some(LoadError::BadMagic)
    );
    let mut bytes = world_at(10).save();
    bytes.truncate(bytes.len() - 9);
    assert!(World::load(&bytes).is_err());
}

// Crafted input. Every snapshot below has a valid envelope and checksum, so only `load`'s own checks
// can reject it.

/// Bytes before the first length prefix: 5 header words and 4 generators of 2 words each.
const HEADER_BYTES: usize = 4 * (5 + 4 * 2);
/// The `f32` creature fields. They come before the integer fields.
const FLOATS_BEFORE: usize = 13;
/// The `f32` creature fields of M4 that follow the integer fields: the two ability commands,
/// then, after the three counters, `hurt` and `hurt_side`.
const COMMANDS: usize = 2;
const COUNTERS: usize = 3;
const HURTS: usize = 2;

/// A payload written by hand in the order of `World::save_payload`. A test changes one part.
struct Crafted {
    tick: u32,
    size: (f32, f32),
    next_uid: u32,
    params: Vec<f32>,
    live: Vec<u32>,
    uids: Vec<u32>,
    /// Every `f32` creature field, and the hue of each genome.
    field: Vec<f32>,
    /// True: every other float of the body of each genome is the value of `field` as well.
    wild_genome: bool,
    ages: Vec<u32>,
    parents: Vec<u32>,
    /// The uid of the gene donor that each creature was born with.
    mixed_with: Vec<u32>,
    /// The brain of every genome.
    brain: BrainGenome,
    births: u64,
    /// The brain activations of every live slot. None for a zero per neuron.
    activations: Option<Vec<f32>>,
    /// The uid of the possessed creature, the manual flag, thrust, turn, and the death cause.
    control: (u32, u32, f32, f32, u32),
    /// The accept flag of the control block.
    accept: u32,
    /// The killer uid, the killer's brain and body, and the ability mask of the control block.
    killer: u32,
    killer_brain: Vec<u32>,
    killer_body: Vec<u32>,
    abilities: u32,
    /// The cloud pool. `cloud_field` is the x, the y, the radius, and the drain of every cloud.
    cloud_slots: Vec<u32>,
    cloud_field: Vec<f32>,
    cloud_left: Vec<u32>,
    cloud_maker: Vec<u32>,
    /// The debris pool. `debris_field` is the x, the y, and the energy of every piece.
    debris_slots: Vec<u32>,
    debris_field: Vec<f32>,
    /// The uid of the donor that every live slot holds, with the default genome. 0 for none.
    donor: u32,
    plant_slots: Vec<u32>,
    /// The x and the y of every plant.
    plant_place: Vec<f32>,
    plant_reserve: Vec<f32>,
    plant_cap: Vec<f32>,
    fertility: Vec<f32>,
    scent: Vec<f32>,
}

/// The cells of the fertility map and of the scent field in the 64 by 64 world of `Crafted`.
const FERTILITY_CELLS: usize = 2 * 2;
const SCENT_CELLS: usize = 8 * 8;

impl Crafted {
    /// A 64 by 64 world with `live` as the slot list and `field` as every `f32` creature field.
    fn new(live: &[u32], field: &[f32]) -> Crafted {
        let n = field.len();
        Crafted {
            tick: 0,
            size: (64.0, 64.0),
            next_uid: 1 + n as u32,
            params: Params::new().v,
            live: live.to_vec(),
            uids: (1..=n as u32).collect(),
            field: field.to_vec(),
            wild_genome: false,
            ages: vec![0; n],
            parents: vec![0; n],
            mixed_with: vec![0; n],
            brain: BrainGenome::default(),
            births: 0,
            activations: None,
            control: (0, 0, 0.0, 0.0, 0),
            accept: 0,
            killer: 0,
            killer_brain: vec![],
            killer_body: vec![],
            abilities: 0,
            cloud_slots: vec![],
            cloud_field: vec![],
            cloud_left: vec![],
            cloud_maker: vec![],
            debris_slots: vec![],
            debris_field: vec![],
            donor: 0,
            plant_slots: vec![],
            plant_place: vec![],
            plant_reserve: vec![],
            plant_cap: vec![],
            fertility: vec![0.0; FERTILITY_CELLS],
            scent: vec![0.0; SCENT_CELLS],
        }
    }

    /// No creatures, and one plant per value of `place`, in slots 0 and up, with a reserve of 1 and
    /// a cap of 2.
    fn plants(place: &[f32]) -> Crafted {
        Crafted {
            plant_slots: (0..place.len() as u32).collect(),
            plant_place: place.to_vec(),
            plant_reserve: vec![1.0; place.len()],
            plant_cap: vec![2.0; place.len()],
            ..Crafted::new(&[], &[])
        }
    }

    /// One creature per uid, in slots 0 and up.
    fn uids(tick: u32, next_uid: u32, uids: &[u32]) -> Crafted {
        let live: Vec<u32> = (0..uids.len() as u32).collect();
        Crafted {
            tick,
            next_uid,
            uids: uids.to_vec(),
            ..Crafted::new(&live, &vec![1.0; uids.len()])
        }
    }

    fn bytes(&self) -> Vec<u8> {
        let mut p = Writer::new();
        p.u32(self.tick);
        p.f32(self.size.0);
        p.f32(self.size.1);
        p.u32(self.next_uid);
        p.u32(1); // next_history
        for _ in 0..4 {
            p.u64(0); // a generator
        }
        p.f32s(&self.params);
        p.u32s(&self.live);
        p.u32s(&self.uids);
        for _ in 0..FLOATS_BEFORE {
            p.f32s(&self.field);
        }
        p.u32s(&self.ages);
        p.u32s(&vec![0; self.field.len()]); // generation
        p.u32s(&self.parents);
        p.u32s(&self.mixed_with);
        p.u8s(&vec![0; self.field.len()]); // mark
        p.u32s(&vec![0; self.field.len()]); // bud_cooldown
        for _ in 0..COMMANDS {
            p.f32s(&self.field);
        }
        for _ in 0..COUNTERS {
            p.u32s(&vec![0; self.field.len()]); // the two cooldowns and strike_left
        }
        for _ in 0..HURTS {
            p.f32s(&self.field);
        }
        // The neurons of every block. The inputs follow the parts of each genome.
        let mut neurons = 0;
        for i in 0..self.live.len() {
            // A field of the wrong length has failed the load before a genome is read.
            let v = self.field.get(i).copied().unwrap_or(0.0);
            let mut genome = Genome {
                hue: v,
                brain: self.brain.clone(),
                ..Genome::default()
            };
            if self.wild_genome {
                (genome.len, genome.wid, genome.egg, genome.old, genome.diet) = (v, v, v, v, v);
                for part in &mut genome.parts {
                    (part.anchor, part.size, part.extra) = (v, v, v);
                }
                // An eye, so that the cones are made from wild values as well.
                genome.parts[0].kind = KIND_EYE;
            }
            let ports = brain::ports(&genome);
            neurons += ports.inputs.len() + self.brain.hidden.len() + ports.outputs.len();
            genome.save(&mut p);
        }
        p.u64(self.births);
        p.u64(0); // deaths
        p.u64(0f64.to_bits()); // eaten
        p.u64(0); // starved_juv
        p.u64(0); // plant_deaths
        p.u64(0f64.to_bits()); // flesh
        p.u64(0); // kills
        p.u64(0); // poisoned
        p.u64(0); // spiked
        p.u64(0f64.to_bits()); // debris_eaten
        let zeros = vec![0.0; neurons];
        p.f32s(self.activations.as_ref().unwrap_or(&zeros));
        let (possessed, manual, thrust, turn, cause) = self.control;
        p.u32(possessed);
        p.u32(manual);
        p.f32(thrust);
        p.f32(turn);
        p.u32(self.accept);
        p.u32(cause);
        p.u32(0); // buds
        p.u32(self.killer);
        p.u32s(&self.killer_brain);
        p.u32s(&self.killer_body);
        p.u32(self.abilities);
        p.u32s(&self.cloud_slots);
        p.f32s(&self.cloud_field); // x
        p.f32s(&self.cloud_field); // y
        p.f32s(&self.cloud_field); // radius
        p.u32s(&self.cloud_left);
        p.f32s(&self.cloud_field); // drain
        p.u32s(&self.cloud_maker);
        for _ in &self.live {
            p.u32(self.donor);
            if self.donor != 0 {
                Genome::default().save(&mut p);
            }
        }
        p.u32s(&self.plant_slots);
        p.f32s(&self.plant_place); // x
        p.f32s(&self.plant_place); // y
        p.f32s(&self.plant_reserve);
        p.f32s(&self.plant_cap);
        p.f32s(&self.fertility);
        p.u32s(&self.debris_slots);
        p.f32s(&self.debris_field); // x
        p.f32s(&self.debris_field); // y
        p.f32s(&self.debris_field); // energy
        p.f32s(&self.scent);
        p.bytes
    }

    fn load(&self) -> Result<World, LoadError> {
        World::load(&seal(&self.bytes()))
    }

    fn err(&self) -> Option<LoadError> {
        self.load().err()
    }
}

fn load_err(payload: &[u8]) -> Option<LoadError> {
    World::load(&seal(payload)).err()
}

/// The id of the first hidden gene of `brain`. The others count up from it.
const HIDDEN_ID: u32 = 1000;

/// The name of neuron `i` in the block of a brain of `brain` with `hidden` hidden neurons: the
/// inputs, the hidden neurons, the outputs. An index past the block names a hidden neuron that no
/// genome holds.
fn node(i: usize, hidden: usize) -> Node {
    let ports = brain::ports(&Genome::default());
    assert_eq!((ports.inputs.len(), ports.outputs.len()), (N_IN, N_OUT));
    let unknown = |k: usize| Node::hidden(HIDDEN_ID + k as u32);
    match i.checked_sub(N_IN) {
        None => ports.inputs[i],
        Some(k) if k < hidden => Node::hidden(HIDDEN_ID + k as u32),
        Some(k) => (ports.outputs.get(k - hidden).copied()).unwrap_or(unknown(k)),
    }
}

/// `hidden` hidden neurons, an out gene for each output, and a connection for each pair of block
/// indexes.
fn brain(hidden: usize, conns: &[(usize, usize)]) -> BrainGenome {
    let hidden_genes = (0..hidden as u32).map(|k| HiddenGene {
        id: HIDDEN_ID + k,
        bias: 0.0,
        alpha: 1.0,
    });
    let conn = |&(src, dst): &(usize, usize)| ConnGene {
        src: node(src, hidden),
        dst: node(dst, hidden),
        weight: 0.5,
        history: 1,
    };
    BrainGenome {
        hidden: hidden_genes.collect(),
        conns: conns.iter().map(conn).collect(),
        ..BrainGenome::default()
    }
}

#[test]
fn a_crafted_payload_loads() {
    let w = Crafted::new(&[0, 5], &[1.0, 2.0]).load().expect("load");
    assert_eq!(w.creatures.slots.count(), 2);
    assert_eq!(w.creatures.slots.high_water(), 6);
    assert_eq!(
        (w.creatures.x[5], w.creatures.uid[5], w.next_uid),
        (2.0, 2, 3)
    );
    assert_eq!((w.creatures.hue[5], w.genomes[5].len), (2.0, 12.0));
}

#[test]
fn a_bad_slot_list_is_invalid() {
    let at_capacity = Crafted::new(&[MAX_CREATURES], &[1.0]);
    assert_eq!(
        at_capacity.err(),
        Some(LoadError::Invalid("creature slot past capacity"))
    );
    for live in [[3, 3], [5, 2]] {
        assert_eq!(
            Crafted::new(&live, &[1.0, 2.0]).err(),
            Some(LoadError::Invalid("creature slots not ascending"))
        );
    }
}

#[test]
fn a_field_of_the_wrong_length_is_invalid() {
    for field in [&[1.0][..], &[1.0, 2.0, 3.0]] {
        assert_eq!(
            Crafted::new(&[0, 1], field).err(),
            Some(LoadError::Invalid("creature field length"))
        );
    }
    // The integer fields are held to the same rule.
    let short_ages = Crafted {
        ages: vec![0],
        ..Crafted::new(&[0, 1], &[1.0, 2.0])
    };
    assert_eq!(
        short_ages.err(),
        Some(LoadError::Invalid("creature field length"))
    );
}

#[test]
fn a_bad_world_size_is_invalid() {
    for bad in [
        f32::NAN,
        f32::INFINITY,
        0.0,
        f32::from_bits(1),
        0.5,
        -64.0,
        MAX_WORLD_SIZE * 2.0,
    ] {
        for size in [(bad, 64.0), (64.0, bad)] {
            let p = Crafted {
                size,
                ..Crafted::new(&[], &[])
            };
            assert_eq!(p.err(), Some(LoadError::Invalid("world size")), "{size:?}");
        }
    }
}

#[test]
fn a_bad_uid_is_invalid() {
    for (next_uid, uids, reason) in [
        (0, &[][..], "next uid of 0"),
        (5, &[0], "creature uid of 0"),
        (5, &[2, 0], "creature uid of 0"),
        (5, &[2, 2], "creature uid repeats"),
        (5, &[3, 1, 3], "creature uid repeats"),
        (5, &[1, 5], "creature uid not below next uid"),
        (5, &[9, 1], "creature uid not below next uid"),
    ] {
        assert_eq!(
            Crafted::uids(0, next_uid, uids).err(),
            Some(LoadError::Invalid(reason)),
            "next_uid {next_uid}, uids {uids:?}"
        );
    }
}

#[test]
fn a_parent_that_is_not_older_than_its_child_is_invalid() {
    let with_parents = |parents: &[u32]| Crafted {
        parents: parents.to_vec(),
        ..Crafted::uids(0, 9, &[3, 5])
    };
    assert!(with_parents(&[2, 3]).load().is_ok());
    for parents in [[3, 0], [0, 5], [0, 8], [u32::MAX, 0]] {
        assert_eq!(
            with_parents(&parents).err(),
            Some(LoadError::Invalid("creature parent not below its uid")),
            "{parents:?}"
        );
    }
}

#[test]
fn a_bad_parameter_table_is_invalid() {
    let with_params = |params: Vec<f32>| Crafted {
        params,
        ..Crafted::new(&[0], &[1.0])
    };
    let defaults = Params::new().v;
    for count in [0, DEFS.len() - 1, DEFS.len() + 1] {
        let mut v = defaults.clone();
        v.resize(count, 0.5);
        assert_eq!(
            with_params(v).err(),
            Some(LoadError::Invalid("parameter count")),
            "{count} parameters"
        );
    }
    // `think_every` of 0 would divide by zero in the tick.
    for (k, bad) in [
        (id::THINK_EVERY, 0.0),
        (id::DRAG_FWD, 99.0),
        (id::LIFESPAN, f32::NAN),
        (id::PLANT_CELL_CAP, f32::INFINITY),
    ] {
        let mut v = defaults.clone();
        v[k] = bad;
        assert_eq!(
            with_params(v).err(),
            Some(LoadError::Invalid("parameter out of range")),
            "{} = {bad}",
            DEFS[k].name
        );
    }
}

#[test]
fn a_bad_brain_genome_is_invalid() {
    let with_brain = |brain: BrainGenome| Crafted {
        brain,
        ..Crafted::new(&[0], &[1.0])
    };
    let most = MAX_HIDDEN;
    let last = N_IN + 2 + N_OUT - 1;
    // Input to hidden, hidden to output, and an output that feeds a hidden neuron: all in range.
    let good = brain(2, &[(0, N_IN), (N_IN, last), (last, N_IN + 1)]);
    let w = with_brain(good).load().expect("load");
    assert_eq!(
        (w.brains.n_neur[0], w.brains.n_conn[0]),
        (N_IN as u16 + 2 + N_OUT as u16, 3)
    );
    assert!(with_brain(brain(most, &[])).load().is_ok());

    // A list of a brain genome holds no more than its cap. A genome has one bias and one alpha
    // for each hidden gene and each out gene, so their counts cannot be wrong.
    let many_outs = |count: usize| BrainGenome {
        outs: vec![
            OutGene {
                node: node(N_IN, 0),
                bias: 0.0,
                alpha: 1.0
            };
            count
        ],
        ..brain(0, &[])
    };
    let many_conns = |count: usize| brain(0, &vec![(0, N_IN); count]);
    assert!(with_brain(many_outs(N_OUT_MAX)).load().is_ok());
    assert!(with_brain(many_conns(MAX_CONN_GENES)).load().is_ok());
    for (bad, reason) in [
        (brain(most + 1, &[]), "brain genome hidden count"),
        (many_outs(N_OUT_MAX + 1), "brain genome output count"),
        (
            many_conns(MAX_CONN_GENES + 1),
            "brain genome connection count",
        ),
    ] {
        assert_eq!(with_brain(bad).err(), Some(LoadError::Invalid(reason)));
    }

    // A name is not checked. A connection with an end that the genome does not declare loads, is
    // not expressed, and the world runs.
    for bad in [
        brain(2, &[(last + 1, N_IN)]),
        brain(2, &[(0, last + 1)]),
        // An input neuron takes no connection.
        brain(2, &[(N_IN, N_IN - 1)]),
        brain(0, &[(0, 0xFFFF)]),
    ] {
        let mut w = with_brain(bad).load().expect("load");
        assert_eq!(w.brains.n_conn[0], 0);
        w.run(5);
    }
}

/// Port 132 was the lunge of a jaw, retired by rule P1 of the parts retune. A genome with an out
/// gene for it and a wire into it loads: no body declares 132, so neither is expressed, and the
/// next birth's `prune` drops both.
#[test]
fn a_genome_with_the_retired_port_132_loads_and_never_declares_it() {
    let retired = Node::body(132);
    let mut held = brain(0, &[]);
    held.outs.push(OutGene {
        node: retired,
        bias: 3.0,
        alpha: 1.0,
    });
    held.conns.push(ConnGene {
        src: node(0, 0),
        dst: retired,
        weight: 1.0,
        history: 1,
    });
    let mut w = Crafted {
        brain: held,
        ..Crafted::new(&[0], &[1.0])
    }
    .load()
    .expect("load");
    assert_eq!(w.brains.n_conn[0], 0);
    assert_eq!(w.brains.n_out[0] as usize, N_OUT);
    assert_eq!(w.brains.output(0, 132), brain::UNDECLARED);
    w.run(5);
    assert_eq!(w.brains.output(0, 132), brain::UNDECLARED);
    let mut child = w.genomes[0].clone();
    child.prune(0.0);
    assert!(child.brain.outs.iter().all(|gene| gene.node != retired));
    assert!(child.brain.conns.iter().all(|conn| conn.dst != retired));
}

#[test]
fn a_brain_part_of_the_wrong_length_is_invalid() {
    // Two creatures with the smallest brain hold 30 activations.
    let right = 2 * (N_IN + N_OUT);
    assert_eq!(right, 30);
    for count in [0, right - 1, right + 1] {
        let p = Crafted {
            activations: Some(vec![0.0; count]),
            ..Crafted::new(&[0, 1], &[1.0, 2.0])
        };
        assert_eq!(
            p.err(),
            Some(LoadError::Invalid("brain activation count")),
            "{count} values"
        );
    }
}

#[test]
fn a_bad_donor_is_invalid() {
    let with_donor = |donor: u32| Crafted {
        donor,
        ..Crafted::uids(0, 9, &[3, 5])
    };
    let w = with_donor(8).load().expect("load");
    // The donor is dead, and each of the two bodies holds its genome.
    assert_eq!(w.donors.iter().flatten().count(), 2);
    assert_eq!(w.donors[1].as_ref().map(|d| d.0), Some(8));
    assert!(with_donor(0).load().expect("load").donors[1].is_none());
    for donor in [9, u32::MAX] {
        assert_eq!(
            with_donor(donor).err(),
            Some(LoadError::Invalid("donor uid not below next uid"))
        );
    }

    let mixed_with = |mixed_with: &[u32]| Crafted {
        mixed_with: mixed_with.to_vec(),
        ..Crafted::uids(0, 9, &[3, 5])
    };
    assert!(mixed_with(&[2, 3]).load().is_ok());
    for bad in [[3, 0], [0, 5], [0, 8], [u32::MAX, 0]] {
        assert_eq!(
            mixed_with(&bad).err(),
            Some(LoadError::Invalid("creature donor not below its uid")),
            "{bad:?}"
        );
    }
}

#[test]
fn a_bad_control_block_is_invalid() {
    let with_control = |control| Crafted {
        control,
        ..Crafted::uids(0, 9, &[3, 5])
    };
    for (control, reason) in [
        ((4, 0, 0.0, 0.0, 0), "possessed creature is not alive"),
        ((9, 0, 0.0, 0.0, 0), "possessed creature is not alive"),
        ((5, 2, 0.0, 0.0, 0), "control manual flag"),
        ((5, 1, 1.5, 0.0, 0), "control input out of range"),
        ((5, 1, -0.1, 0.0, 0), "control input out of range"),
        ((5, 1, 0.0, -1.5, 0), "control input out of range"),
        ((5, 1, f32::NAN, 0.0, 0), "control input out of range"),
        ((5, 1, 0.0, f32::NAN, 0), "control input out of range"),
        ((0, 0, 0.0, 0.0, CAUSE_SPIKED + 1), "death cause"),
    ] {
        assert_eq!(
            with_control(control).err(),
            Some(LoadError::Invalid(reason)),
            "{control:?}"
        );
    }
    let with_accept = |accept: u32| Crafted {
        accept,
        ..Crafted::uids(0, 9, &[3, 5])
    };
    assert!(with_accept(1).load().expect("load").control.accept);
    assert_eq!(
        with_accept(2).err(),
        Some(LoadError::Invalid("control accept flag"))
    );
    // A death of M4, with its killer, the killer's brain, and the mask of the abilities held.
    let eaten = Crafted {
        control: (0, 0, 0.0, 0.0, CAUSE_EATEN),
        killer: 5,
        killer_brain: vec![5, 0, 0, 0, 0, 0],
        killer_body: vec![0; KILLER_BODY_WORDS as usize],
        abilities: 5,
        ..Crafted::uids(0, 9, &[3, 5])
    };
    let w = eaten.load().expect("load");
    let c = &w.control;
    assert_eq!((c.death_cause, c.killer, c.abilities), (CAUSE_EATEN, 5, 5));
    assert_eq!(c.killer_brain.len(), READOUT_HEADER_WORDS as usize);
    assert_eq!(c.killer_body.len(), KILLER_BODY_WORDS as usize);
    for (bad, reason) in [
        (
            Crafted {
                killer: 9,
                ..Crafted::uids(0, 9, &[3, 5])
            },
            "killer uid not below next uid",
        ),
        (
            Crafted {
                killer_body: vec![0; KILLER_BODY_WORDS as usize - 1],
                ..Crafted::uids(0, 9, &[3, 5])
            },
            "killer body length",
        ),
        (
            Crafted {
                abilities: 8,
                ..Crafted::uids(0, 9, &[3, 5])
            },
            "control ability mask",
        ),
        // 2 was the lunge, retired by rule P1 of the parts retune.
        (
            Crafted {
                abilities: 2,
                ..Crafted::uids(0, 9, &[3, 5])
            },
            "control ability mask",
        ),
    ] {
        assert_eq!(bad.err(), Some(LoadError::Invalid(reason)));
    }
}

#[test]
fn a_crafted_cloud_and_a_crafted_piece_of_debris_load() {
    let p = Crafted {
        cloud_slots: vec![3],
        cloud_field: vec![20.0],
        cloud_left: vec![5],
        cloud_maker: vec![2],
        debris_slots: vec![0, 6],
        debris_field: vec![10.0, 30.0],
        ..Crafted::uids(0, 9, &[3, 5])
    };
    let mut w = p.load().expect("load");
    let cl = &w.clouds;
    assert_eq!((cl.slots.count(), cl.slots.high_water()), (1, 4));
    assert_eq!(
        (cl.x[3], cl.radius[3], cl.left[3], cl.maker[3]),
        (20.0, 20.0, 5, 2)
    );
    let d = &w.debris;
    assert_eq!((d.slots.count(), d.slots.high_water()), (2, 7));
    assert_eq!((d.x[6], d.y[6], d.energy[6]), (30.0, 30.0, 30.0));
    // The grid of the debris is rebuilt, so the frame finds both pieces.
    frame::write(&mut w, 0.0, 0.0, 64.0, 64.0);
    assert_eq!(w.frame[34..36], [2, 1]);
}

#[test]
fn a_bad_cloud_or_debris_pool_is_invalid() {
    let cloud = |slots: &[u32], field: f32, left: u32, maker: u32| Crafted {
        cloud_slots: slots.to_vec(),
        cloud_field: vec![field; slots.len()],
        cloud_left: vec![left; slots.len()],
        cloud_maker: vec![maker; slots.len()],
        ..Crafted::uids(0, 9, &[3, 5])
    };
    let debris = |slots: &[u32], field: Vec<f32>| Crafted {
        debris_slots: slots.to_vec(),
        debris_field: field,
        ..Crafted::uids(0, 9, &[3, 5])
    };
    let cases = [
        (cloud(&[3, 3], 1.0, 5, 2), "cloud slots not ascending"),
        (cloud(&[MAX_CLOUDS], 1.0, 5, 2), "cloud slot past capacity"),
        (
            Crafted {
                cloud_left: vec![5],
                ..cloud(&[0, 1], 1.0, 5, 2)
            },
            "cloud field length",
        ),
        (cloud(&[0], 1.0, 0, 2), "cloud out of range"),
        (cloud(&[0], 1.0, 5, 9), "cloud out of range"),
        (cloud(&[0], -1.0, 5, 2), "cloud out of range"),
        (cloud(&[0], f32::NAN, 5, 2), "cloud out of range"),
        (cloud(&[0], f32::INFINITY, 5, 2), "cloud out of range"),
        (debris(&[5, 2], vec![1.0; 2]), "debris slots not ascending"),
        (
            debris(&[MAX_DEBRIS], vec![1.0]),
            "debris slot past capacity",
        ),
        (debris(&[0, 1], vec![1.0]), "debris field length"),
        (debris(&[0], vec![-0.5]), "debris energy out of range"),
        (debris(&[0], vec![f32::NAN]), "debris energy out of range"),
        (
            debris(&[0], vec![f32::INFINITY]),
            "debris energy out of range",
        ),
    ];
    for (bad, reason) in cases {
        assert_eq!(bad.err(), Some(LoadError::Invalid(reason)), "{reason}");
    }
}

#[test]
fn a_crafted_plant_loads_and_its_grid_is_rebuilt() {
    let p = Crafted {
        plant_slots: vec![0, 7],
        ..Crafted::plants(&[10.0, 40.0])
    };
    let mut w = p.load().expect("load");
    assert_eq!(
        (w.plants.slots.count(), w.plants.slots.high_water()),
        (2, 8)
    );
    let at = (
        w.plants.x[7],
        w.plants.y[7],
        w.plants.reserve[7],
        w.plants.cap[7],
    );
    assert_eq!(at, (40.0, 40.0, 1.0, 2.0));
    frame::write(&mut w, 0.0, 0.0, 64.0, 64.0);
    assert_eq!(w.frame[2], 2);
}

#[test]
fn a_bad_plant_part_is_invalid() {
    let place = [10.0, 40.0];
    let with_slots = |slots: &[u32]| Crafted {
        plant_slots: slots.to_vec(),
        ..Crafted::plants(&place)
    };
    let with_reserve_and_cap = |reserve: f32, cap: f32| Crafted {
        plant_reserve: vec![1.0, reserve],
        plant_cap: vec![2.0, cap],
        ..Crafted::plants(&place)
    };
    assert!(with_reserve_and_cap(0.0, f32::MAX).load().is_ok());
    assert!(with_reserve_and_cap(2.0, 2.0).load().is_ok());
    let cases = [
        (with_slots(&[3, 3]), "plant slots not ascending"),
        (with_slots(&[5, 2]), "plant slots not ascending"),
        (with_slots(&[0, MAX_PLANTS]), "plant slot past capacity"),
        (with_slots(&[0]), "plant field length"),
        (with_slots(&[0, 1, 2]), "plant field length"),
        (
            Crafted {
                plant_cap: vec![2.0],
                ..Crafted::plants(&place)
            },
            "plant field length",
        ),
    ];
    for (bad, reason) in cases {
        assert_eq!(bad.err(), Some(LoadError::Invalid(reason)));
    }
    // A cap of 0 would make `reserve / cap` NaN in the frame and in the growth rule.
    for (reserve, cap) in [
        (0.0, 0.0),
        (1.0, -2.0),
        (1.0, f32::NAN),
        (1.0, f32::INFINITY),
        (f32::INFINITY, f32::INFINITY),
        (f32::NAN, 2.0),
        (-0.1, 2.0),
        (2.1, 2.0),
    ] {
        assert_eq!(
            with_reserve_and_cap(reserve, cap).err(),
            Some(LoadError::Invalid("plant reserve or cap out of range")),
            "reserve {reserve}, cap {cap}"
        );
    }
}

#[test]
fn a_bad_fertility_map_or_scent_field_is_invalid() {
    let with_fertility = |fertility: Vec<f32>| Crafted {
        fertility,
        ..Crafted::plants(&[10.0])
    };
    for cells in [0, FERTILITY_CELLS - 1, FERTILITY_CELLS + 1] {
        assert_eq!(
            with_fertility(vec![0.5; cells]).err(),
            Some(LoadError::Invalid("fertility map size")),
            "{cells} cells"
        );
    }
    for bad in [f32::NAN, f32::INFINITY, -0.1, 1.1] {
        let mut v = vec![1.0; FERTILITY_CELLS];
        v[1] = bad;
        assert_eq!(
            with_fertility(v).err(),
            Some(LoadError::Invalid("fertility out of range")),
            "{bad}"
        );
    }
    for cells in [0, SCENT_CELLS - 1, SCENT_CELLS + 1] {
        let p = Crafted {
            scent: vec![0.5; cells],
            ..Crafted::plants(&[10.0])
        };
        assert_eq!(
            p.err(),
            Some(LoadError::Invalid("scent field size")),
            "{cells} cells"
        );
    }
}

#[test]
fn a_crafted_possession_loads_with_its_slot_and_steers_on_the_first_tick() {
    let p = Crafted {
        control: (2, 1, 1.0, -1.0, CAUSE_STARVED),
        ..Crafted::new(&[0, 5], &[1.0, 2.0])
    };
    let mut w = p.load().expect("load");
    assert_eq!((w.control.possessed, w.control.possessed_slot), (2, 5));
    assert_eq!(w.control.death_cause, CAUSE_STARVED);
    w.tick();
    assert_eq!(
        (w.creatures.cmd_thrust[5], w.creatures.cmd_turn[5]),
        (1.0, -1.0)
    );
}

/// A snapshot can hold a counter at the top of its range. The tick wraps. The others stop.
#[test]
fn counters_at_the_top_of_their_range_do_not_panic_or_wrap_a_uid() {
    let last = u32::MAX - 1;
    let p = Crafted {
        ages: vec![u32::MAX; 2],
        births: u64::MAX,
        ..Crafted::uids(u32::MAX, last, &[1, 2])
    };
    let mut w = p.load().expect("load");
    w.run(2);
    // An age that wrapped would be young. Both creatures die of old age on the first tick.
    assert_eq!((w.tick, w.creatures.slots.count()), (1, 0));
    assert_eq!(w.stat(STAT_DEATHS), 2.0);
    // A birth takes the last uid that can be given out.
    let child = SpawnAt {
        x: 10.0,
        y: 10.0,
        heading: 0.0,
        growth: 1.0,
        energy01: 0.5,
        parent: 1,
        generation: 1,
        mark: 0,
    };
    assert_eq!(w.spawn(Genome::default(), child), Some(0));
    assert_eq!(w.stat(STAT_BIRTHS), u64::MAX as f64);
    w.seed_founders(10, 0);
    assert_eq!((w.creatures.slots.count(), w.next_uid), (1, u32::MAX));
    assert_eq!(w.creatures.uid[0], last);
    World::load(&w.save()).expect("the world still loads");
    w.kill(0, CAUSE_STARVED, None);
    assert_eq!(w.stat(STAT_DEATHS), 3.0);
    World::load(&w.save()).expect("the empty world still loads");
}

#[test]
fn trailing_bytes_are_invalid() {
    let mut p = Crafted::new(&[0], &[1.0]).bytes();
    p.push(0);
    assert_eq!(load_err(&p), Some(LoadError::Invalid("trailing bytes")));
    let mut bytes = world_at(10).save();
    bytes.push(0);
    assert_eq!(
        World::load(&bytes).err(),
        Some(LoadError::Invalid("trailing bytes"))
    );
}

#[test]
fn a_length_prefix_past_the_end_is_truncated() {
    let mut p = Crafted::new(&[], &[]).bytes();
    p.truncate(HEADER_BYTES);
    p.extend_from_slice(&u32::MAX.to_le_bytes());
    assert_eq!(load_err(&p), Some(LoadError::Truncated));
}

#[test]
fn every_cut_of_a_payload_is_an_error() {
    let p = Crafted {
        brain: brain(1, &[(0, N_IN), (N_IN, N_IN + 1)]),
        control: (2, 1, 0.5, 0.5, 0),
        killer: 1,
        killer_brain: vec![1, 0, 0, 0, 0, 0],
        killer_body: vec![0; KILLER_BODY_WORDS as usize],
        abilities: 5,
        cloud_slots: vec![0],
        cloud_field: vec![5.0],
        cloud_left: vec![9],
        cloud_maker: vec![1],
        debris_slots: vec![2],
        debris_field: vec![4.0],
        donor: 1,
        plant_slots: vec![0, 4],
        plant_place: vec![10.0, 40.0],
        plant_reserve: vec![1.0, 2.0],
        plant_cap: vec![2.0, 2.0],
        ..Crafted::new(&[0, 1, 2], &[1.0, 2.0, 3.0])
    };
    assert!(p.load().is_ok());
    let p = p.bytes();
    for n in 0..p.len() {
        assert_eq!(load_err(&p[..n]), Some(LoadError::Truncated), "cut at {n}");
    }
}

#[test]
fn every_cut_of_a_snapshot_is_an_error() {
    let bytes = world_at(10).save();
    for n in 0..bytes.len() {
        assert!(World::load(&bytes[..n]).is_err(), "cut at {n}");
    }
}

#[test]
fn another_format_version_is_rejected() {
    let mut bytes = world_at(10).save();
    bytes[4..8].copy_from_slice(&(FORMAT_VERSION + 1).to_le_bytes());
    assert_eq!(
        World::load(&bytes).err(),
        Some(LoadError::BadVersion(FORMAT_VERSION + 1))
    );
}

/// `load` does not check creature values or the floats of a genome. The tick and every read of the
/// world must survive any of them.
#[test]
fn wild_creature_values_load_and_run_without_panic() {
    let wild = [
        f32::NAN,
        f32::INFINITY,
        f32::NEG_INFINITY,
        1e30,
        -1e30,
        10.0,
    ];
    let p = Crafted {
        control: (6, 1, 1.0, 1.0, 0),
        wild_genome: true,
        ..Crafted::new(&[0, 1, 2, 3, 4, 5], &wild)
    };
    let mut w = p.load().expect("load");
    w.run(10);
    w.seed_founders(10, 0);
    w.run(10);
    for uid in 1..=6 {
        w.possess(uid);
    }
    w.write_heirs();
    w.stat(STAT_MEAN_ENERGY01);
    w.pick(10.0, 10.0, 50.0);
    frame::write(&mut w, 0.0, 0.0, 64.0, 64.0);
    World::load(&w.save()).expect("the world still loads");
}

/// `load` does not check where a plant is or what the scent field holds. Every plant seeds at each
/// update here, so the growth, seeding, and death rules all run on these values.
#[test]
fn wild_plant_places_and_scent_values_load_and_run_without_panic() {
    let wild = [
        f32::NAN,
        f32::INFINITY,
        f32::NEG_INFINITY,
        1e30,
        -1e30,
        10.0,
    ];
    let mut scent = vec![0.0; SCENT_CELLS];
    scent[..wild.len()].copy_from_slice(&wild);
    let p = Crafted {
        fertility: vec![1.0; FERTILITY_CELLS],
        scent,
        ..Crafted::plants(&wild)
    };
    let mut w = p.load().expect("load");
    w.params.set(id::PLANT_SEED_AT, 0.1);
    w.params.set(id::PLANT_SEED_CHANCE, 1.0);
    w.run(100);
    // A seedling has the cap of its cell, not the crafted cap.
    assert!(w.plants.cap.contains(&w.params.get(id::PLANT_CAP)));
    w.scent.sample(f32::NAN, -1e30);
    w.scent.gradient(f32::INFINITY, f32::NAN);
    frame::write(&mut w, 0.0, 0.0, 64.0, 64.0);
    World::load(&w.save()).expect("the world still loads");
}

/// `load` does not check a brain activation or the scent field. Sensing and thinking must survive
/// any of them. The brain has a hidden neuron and a loop, so every wild value is read.
#[test]
fn wild_activations_and_scent_under_a_creature_load_and_run_without_panic() {
    let wild = [
        f32::NAN,
        f32::INFINITY,
        f32::NEG_INFINITY,
        1e30,
        -1e30,
        10.0,
    ];
    let cycle = |n: usize| (0..n).map(|i| wild[i % wild.len()]).collect::<Vec<f32>>();
    let (hidden, thrust, turn) = (N_IN, N_IN + 1, N_IN + 2);
    let mut conns: Vec<(usize, usize)> = (0..N_IN).map(|i| (i, hidden)).collect();
    conns.extend([(hidden, thrust), (hidden, turn), (turn, hidden)]);
    let live: Vec<u32> = (0..7).collect();
    let p = Crafted {
        brain: brain(1, &conns),
        activations: Some(cycle(live.len() * (N_IN + 1 + N_OUT))),
        scent: cycle(SCENT_CELLS),
        // An energy of 1 pays the upkeep of the default body for a few ticks, so each of the 7
        // lives to its first thought.
        ..Crafted::new(&live, &[1.0; 7])
    };
    let mut w = p.load().expect("load");
    w.run(10);
    frame::write(&mut w, 0.0, 0.0, 64.0, 64.0);
    World::load(&w.save()).expect("the world still loads");
}
