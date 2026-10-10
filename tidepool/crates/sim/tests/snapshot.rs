use tidepool_sim::brain::{MAX_NEURONS, N_IN, N_OUT};
use tidepool_sim::control::{CAUSE_OLD_AGE, CAUSE_STARVED};
use tidepool_sim::creature::MAX_CREATURES;
use tidepool_sim::frame;
use tidepool_sim::genome::{BrainGenome, ConnGene, Genome};
use tidepool_sim::params::{id, Params, DEFS};
use tidepool_sim::plant::MAX_PLANTS;
use tidepool_sim::snapshot::{seal, LoadError, Writer, FORMAT_VERSION};
use tidepool_sim::stats::{STAT_BIRTHS, STAT_DEATHS, STAT_MEAN_ENERGY01};
use tidepool_sim::world::{SpawnAt, World, MAX_WORLD_SIZE};

/// Founders, plants, a changed parameter, a possessed creature, and held manual input.
fn world_at(ticks: u32) -> World {
    let mut w = World::new(9, 1536.0, 1024.0);
    w.params.set(id::REPEL, 0.5);
    w.seed_founders(400, 1200);
    assert!(w.possess(w.creatures.uid[3]));
    w.input(true, 0.8, 0.5);
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

/// The save falls between births: `world_at` has 13 by tick 1,500 and 25 by tick 3,000. So the
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

/// One change to each saved field. Each must change the hash, and the changed world must load back
/// to the same hash. A field missing from `save` fails the first check. A field that `load` drops
/// fails the second.
#[test]
fn every_saved_field_is_in_the_hash_and_survives_a_load() {
    const S: usize = 5;
    type Edit = fn(&mut World);
    let edits: &[(&str, Edit)] = &[
        ("tick", |w| w.tick += 1),
        ("next_uid", |w| w.next_uid += 1),
        ("next_history", |w| w.next_history += 1),
        ("rng_spawn", |w| w.rng_spawn.0 ^= 1),
        ("rng_mutate", |w| w.rng_mutate.0 ^= 1),
        ("rng_plants", |w| w.rng_plants.0 ^= 1),
        ("params", |w| w.params.set(id::CHEMO_GAIN, 9.0)),
        ("x", |w| w.creatures.x[S] += 1.0),
        ("y", |w| w.creatures.y[S] += 1.0),
        ("vx", |w| w.creatures.vx[S] += 1.0),
        ("vy", |w| w.creatures.vy[S] += 1.0),
        ("heading", |w| w.creatures.heading[S] += 0.01),
        ("omega", |w| w.creatures.omega[S] += 1.0),
        ("cmd_thrust", |w| w.creatures.cmd_thrust[S] += 0.1),
        ("cmd_turn", |w| w.creatures.cmd_turn[S] += 0.01),
        ("growth", |w| w.creatures.growth[S] -= 0.1),
        ("energy", |w| w.creatures.energy[S] += 1.0),
        ("age", |w| w.creatures.age[S] += 1),
        ("generation", |w| w.creatures.generation[S] += 1),
        ("parent", |w| w.creatures.parent[S] = 1),
        ("mark", |w| w.creatures.mark[S] ^= 1),
        ("bud_cooldown", |w| w.creatures.bud_cooldown[S] += 1),
        ("len", |w| w.creatures.len[S] += 1.0),
        ("wid", |w| w.creatures.wid[S] += 0.1),
        ("flagellum", |w| w.creatures.flagellum[S] += 0.1),
        ("cilia", |w| w.creatures.cilia[S] += 0.1),
        ("filter", |w| w.creatures.filter[S] += 0.1),
        ("chemo", |w| w.creatures.chemo[S] += 0.1),
        ("hue", |w| w.creatures.hue[S] += 0.1),
        ("genome body", |w| w.genomes[S].chemo += 0.1),
        ("genome hue", |w| w.genomes[S].hue += 0.1),
        ("genome bias", |w| w.genomes[S].brain.bias[0] += 0.5),
        ("genome alpha", |w| w.genomes[S].brain.alpha[0] = 0.5),
        ("brain activation", |w| {
            w.brains.cur[S * MAX_NEURONS + N_IN] += 0.5
        }),
        ("genome connections", |w| {
            let gene = ConnGene {
                src: 0,
                dst: N_IN as u16,
                weight: 1.0,
                history: 3,
            };
            w.genomes[S].brain.conns.push(gene);
        }),
        ("births", |w| w.stats.births += 1),
        ("deaths", |w| w.stats.deaths += 1),
        ("eaten", |w| w.stats.eaten += 0.5),
        ("possessed", |w| assert!(w.possess(w.creatures.uid[S]))),
        ("manual input", |w| w.input(true, 0.3, -0.2)),
        ("death cause", |w| w.kill(3, CAUSE_OLD_AGE)),
        ("plant slots", |w| w.plants.slots.free(S as u32)),
        ("plant x", |w| w.plants.x[S] += 1.0),
        ("plant y", |w| w.plants.y[S] += 1.0),
        ("plant reserve", |w| w.plants.reserve[S] *= 0.5),
        ("plant cap", |w| w.plants.cap[S] += 1.0),
        ("fertility", |w| w.fertility.v[S] = 0.123),
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

/// Bytes before the first length prefix: 5 header words and 3 generators of 2 words each.
const HEADER_BYTES: usize = 4 * (5 + 3 * 2);
/// The `f32` creature fields before the integer fields, and after them.
const FLOATS_BEFORE: usize = 10;
const FLOATS_AFTER: usize = 7;

/// A payload written by hand in the order of `World::save_payload`. A test changes one part.
struct Crafted {
    tick: u32,
    size: (f32, f32),
    next_uid: u32,
    params: Vec<f32>,
    live: Vec<u32>,
    uids: Vec<u32>,
    /// Every `f32` creature field.
    field: Vec<f32>,
    ages: Vec<u32>,
    parents: Vec<u32>,
    /// The brain of every genome.
    brain: BrainGenome,
    births: u64,
    /// The brain activations of every live slot. None for a zero per neuron.
    activations: Option<Vec<f32>>,
    /// The uid of the possessed creature, the manual flag, thrust, turn, and the death cause.
    control: (u32, u32, f32, f32, u32),
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
            ages: vec![0; n],
            parents: vec![0; n],
            brain: BrainGenome::default(),
            births: 0,
            activations: None,
            control: (0, 0, 0.0, 0.0, 0),
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
        for _ in 0..3 {
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
        p.u8s(&vec![0; self.field.len()]); // mark
        p.u32s(&vec![0; self.field.len()]); // bud_cooldown
        for _ in 0..FLOATS_AFTER {
            p.f32s(&self.field);
        }
        let genome = Genome {
            brain: self.brain.clone(),
            ..Genome::default()
        };
        for _ in &self.live {
            genome.save(&mut p);
        }
        p.u64(self.births);
        p.u64(0); // deaths
        p.u64(0f64.to_bits()); // eaten
        let neurons = N_IN + self.brain.n_hidden as usize + N_OUT;
        let zeros = vec![0.0; self.live.len() * neurons];
        p.f32s(self.activations.as_ref().unwrap_or(&zeros));
        let (possessed, manual, thrust, turn, cause) = self.control;
        p.u32(possessed);
        p.u32(manual);
        p.f32(thrust);
        p.f32(turn);
        p.u32(cause);
        p.u32s(&self.plant_slots);
        p.f32s(&self.plant_place); // x
        p.f32s(&self.plant_place); // y
        p.f32s(&self.plant_reserve);
        p.f32s(&self.plant_cap);
        p.f32s(&self.fertility);
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

fn conn(src: usize, dst: usize) -> ConnGene {
    ConnGene {
        src: src as u16,
        dst: dst as u16,
        weight: 0.5,
        history: 1,
    }
}

/// `hidden` hidden neurons, the matching bias and alpha, and the given connections.
fn brain(hidden: usize, conns: Vec<ConnGene>) -> BrainGenome {
    BrainGenome {
        n_hidden: hidden as u16,
        bias: vec![0.0; hidden + N_OUT],
        alpha: vec![1.0; hidden + N_OUT],
        conns,
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
    let most = MAX_NEURONS - N_IN - N_OUT;
    let last = N_IN + 2 + N_OUT - 1;
    // Input to hidden, hidden to output, and an output that feeds a hidden neuron: all in range.
    let good = brain(
        2,
        vec![conn(0, N_IN), conn(N_IN, last), conn(last, N_IN + 1)],
    );
    assert!(with_brain(good).load().is_ok());
    assert!(with_brain(brain(most, vec![])).load().is_ok());

    let short_bias = BrainGenome {
        bias: vec![0.0],
        ..brain(0, vec![])
    };
    let long_alpha = BrainGenome {
        alpha: vec![1.0; 9],
        ..brain(2, vec![])
    };
    for (bad, reason) in [
        (brain(most + 1, vec![]), "brain genome hidden count"),
        (short_bias, "brain genome bias or alpha count"),
        (long_alpha, "brain genome bias or alpha count"),
        (
            brain(2, vec![conn(last + 1, N_IN)]),
            "brain genome connection out of range",
        ),
        (
            brain(2, vec![conn(0, last + 1)]),
            "brain genome connection out of range",
        ),
        // An input neuron takes no connection.
        (
            brain(2, vec![conn(N_IN, N_IN - 1)]),
            "brain genome connection out of range",
        ),
        (
            brain(0, vec![conn(0, 0xFFFF)]),
            "brain genome connection out of range",
        ),
    ] {
        assert_eq!(with_brain(bad).err(), Some(LoadError::Invalid(reason)));
    }
}

#[test]
fn a_brain_part_of_the_wrong_length_is_invalid() {
    // Two creatures with the smallest brain hold 18 activations.
    for count in [0, 17, 19] {
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
        ((0, 0, 0.0, 0.0, 3), "death cause"),
    ] {
        assert_eq!(
            with_control(control).err(),
            Some(LoadError::Invalid(reason)),
            "{control:?}"
        );
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
    w.kill(0, CAUSE_STARVED);
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
        brain: brain(1, vec![conn(0, N_IN), conn(N_IN, N_IN + 1)]),
        control: (2, 1, 0.5, 0.5, 0),
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

/// `load` does not check creature values. The tick and every read of the world must survive any of
/// them.
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
    let mut conns: Vec<ConnGene> = (0..N_IN).map(|i| conn(i, hidden)).collect();
    conns.extend([conn(hidden, thrust), conn(hidden, turn), conn(turn, hidden)]);
    let live: Vec<u32> = (0..7).collect();
    let p = Crafted {
        brain: brain(1, conns),
        activations: Some(cycle(live.len() * (N_IN + 1 + N_OUT))),
        scent: cycle(SCENT_CELLS),
        // A body of size 1 pays little upkeep, so each of the 7 lives to its first thought.
        ..Crafted::new(&live, &[1.0; 7])
    };
    let mut w = p.load().expect("load");
    w.run(10);
    frame::write(&mut w, 0.0, 0.0, 64.0, 64.0);
    World::load(&w.save()).expect("the world still loads");
}
