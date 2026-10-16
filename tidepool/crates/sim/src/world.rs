//! The world: every piece of simulation state, the tick, and the state hash.

use crate::ability::{self, Clouds};
use crate::bite;
use crate::brain::{self, Brains};
use crate::control::{self, Control, CAUSE_EATEN, CAUSE_POISONED, CAUSE_SPIKED};
use crate::creature::{Creatures, MAX_CREATURES};
use crate::debris::{self, Debris};
use crate::energy;
use crate::field::{self, Field};
use crate::frame::KILL_LOG;
use crate::genome::{Genome, FOUNDER_HISTORIES};
use crate::grid::Grid;
use crate::mate;
use crate::math::{sin_cos, wrap_angle, PI};
use crate::motor::{self, Motor};
use crate::params::{id, Params};
use crate::plant::{self, Fertility, Plants};
use crate::repro;
use crate::rng::Rng;
use crate::sense;
use crate::snapshot::{self, crc32, LoadError, Reader, Writer};
use crate::stats::Stats;

/// Largest `w` or `h` of a world. Bounds what a caller or a snapshot can make the world allocate:
/// at this size the scent field, the largest grid, holds 4 million cells.
pub const MAX_WORLD_SIZE: f32 = 16384.0;
/// A founder is an adult at half of its energy capacity.
const FOUNDER_GROWTH: f32 = 1.0;
const FOUNDER_ENERGY01: f32 = 0.5;
/// Places tried for each founder. Each place is kept with a chance equal to its fertility.
const FOUNDER_TRIES: u32 = 8;

/// Where and what a new creature is. The genome gives the rest.
pub struct SpawnAt {
    pub x: f32,
    pub y: f32,
    pub heading: f32,
    pub growth: f32,
    pub energy01: f32,
    /// The uid of the budding parent. 0 for a creature that was not born.
    pub parent: u32,
    pub generation: u32,
    pub mark: u8,
}

pub struct World {
    pub tick: u32,
    pub w: f32,
    pub h: f32,
    pub params: Params,
    pub creatures: Creatures,
    /// By slot. A dead slot holds a stale genome.
    pub genomes: Vec<Genome>,
    /// By slot: the uid and the genome of the body that this one took genes from, held until its
    /// next bud. A dead slot holds a stale donor.
    pub donors: Vec<Option<(u32, Genome)>>,
    /// Starts at 1. 0 means none.
    pub next_uid: u32,
    /// The next history id for a new brain connection, a new hidden neuron, or a new part.
    pub next_history: u32,
    pub plants: Plants,
    pub fertility: Fertility,
    pub debris: Debris,
    pub clouds: Clouds,
    pub scent: Field,
    pub brains: Brains,
    pub control: Control,
    pub stats: Stats,
    /// One generator per subsystem, so that a change to one never moves the draws of another.
    /// Founder genomes and founder places.
    pub rng_spawn: Rng,
    /// Mutation and the heading of a newborn.
    pub rng_mutate: Rng,
    /// The fertility map, founder plants, and seeding.
    pub rng_plants: Rng,
    /// The chance that a pair exchanges genes.
    pub rng_mate: Rng,
    /// Scratch. Rebuilt every tick, never saved.
    pub grid: Grid,
    /// Scratch. Never saved.
    pub motor: Motor,
    /// Scratch. The last frame that `frame::write` made. Never saved.
    pub frame: Vec<u32>,
    /// Scratch. The last brain that `brain::readout` wrote. Never saved.
    pub readout: Vec<u32>,
    /// Scratch. The last snapshot that `tp_save` made. Never saved.
    pub save_buf: Vec<u8>,
    /// Scratch. The deaths with a killer since the last `frame::write`, at most `KILL_LOG`: the x
    /// and the y of the dead body by bit pattern, and the slot of the killer. Never saved.
    pub kills: Vec<[u32; 3]>,
}

/// True when both sides are at least 1 and at most `MAX_WORLD_SIZE`. False for NaN and infinity.
pub fn size_ok(w: f32, h: f32) -> bool {
    let in_range = |v: f32| (1.0..=MAX_WORLD_SIZE).contains(&v);
    in_range(w) && in_range(h)
}

impl World {
    /// An empty world with default parameters and a fertility map of zeros. The caller checks
    /// `size_ok(w, h)` first.
    pub fn new(seed: u32, w: f32, h: f32) -> World {
        debug_assert!(size_ok(w, h));
        let root = Rng::new(seed as u64);
        World {
            tick: 0,
            w,
            h,
            params: Params::new(),
            creatures: Creatures::default(),
            genomes: vec![Genome::default(); MAX_CREATURES as usize],
            donors: vec![None; MAX_CREATURES as usize],
            next_uid: 1,
            next_history: FOUNDER_HISTORIES + 1,
            plants: Plants::new(w, h),
            fertility: Fertility::new(w, h),
            debris: Debris::new(w, h),
            clouds: Clouds::default(),
            scent: Field::new(w, h),
            brains: Brains::new(MAX_CREATURES),
            control: Control::default(),
            stats: Stats::default(),
            rng_spawn: root.fork(1),
            rng_mutate: root.fork(2),
            rng_plants: root.fork(3),
            rng_mate: root.fork(4),
            grid: Grid::new(w, h),
            motor: Motor::default(),
            frame: Vec::new(),
            readout: Vec::new(),
            save_buf: Vec::new(),
            kills: Vec::new(),
        }
    }

    /// Allocates a slot, sets every array from the genome and `at`, and expresses the body and the
    /// brain. The new body accepts no mate, touches none, was born of no cross, and holds no donor.
    /// It fires no ability, waits on no cooldown, and has not bitten or been hit.
    /// The heading is wrapped and the place is clamped to the world. A spawn with a parent counts
    /// as a birth. None if the pool is full.
    pub fn spawn(&mut self, genome: Genome, at: SpawnAt) -> Option<u32> {
        // The last uid is never given out, so the counter cannot wrap to 0.
        if self.next_uid == u32::MAX {
            return None;
        }
        let slot = self.creatures.slots.alloc()?;
        let (s, c) = (slot as usize, &mut self.creatures);
        c.uid[s] = self.next_uid;
        self.next_uid += 1;
        (c.x[s], c.y[s]) = (at.x.clamp(0.0, self.w), at.y.clamp(0.0, self.h));
        (c.vx[s], c.vy[s], c.omega[s]) = (0.0, 0.0, 0.0);
        c.heading[s] = wrap_angle(at.heading);
        (c.hs[s], c.hc[s]) = sin_cos(c.heading[s]);
        (c.cmd_thrust[s], c.cmd_turn[s], c.cmd_accept[s]) = (0.0, 0.0, 0.0);
        (c.mate_size[s], c.mate_kin[s], c.mixed_with[s]) = (0.0, 0.0, 0);
        (c.age[s], c.bud_cooldown[s]) = (0, 0);
        (c.cmd_dash[s], c.cmd_lunge[s], c.cmd_toxin[s]) = (0.0, 0.0, 0.0);
        (c.cd_dash[s], c.cd_lunge[s], c.cd_toxin[s], c.lunge_left[s]) = (0, 0, 0, 0);
        (c.hurt[s], c.hurt_side[s], c.bit_tick[s], c.hurt_tick[s]) = (0.0, 0.0, 0, 0);
        (c.generation[s], c.parent[s], c.mark[s]) = (at.generation, at.parent, at.mark);
        c.express(s, &genome);
        c.growth[s] = at.growth;
        c.energy[s] = at.energy01 * self.params.get(id::ENERGY_PER_MASS) * c.area(s);
        self.brains.express(s, &genome, &self.params);
        self.genomes[s] = genome;
        self.donors[s] = None;
        if at.parent != 0 {
            self.stats.births = self.stats.births.saturating_add(1);
        }
        Some(slot)
    }

    /// Frees the slot and counts a death, and a death by a bite, a cloud, or a spike by its cause
    /// (rule X1 of the M4 plan). `killer` is the slot of the body that killed this one. A killer
    /// that is no longer alive counts as none. A death with a killer goes in `kills` for the frame.
    ///
    /// If the creature was possessed, records the cause, the uid of the killer or 0, and the
    /// readout of the killer's brain as it is now, and ends the possession.
    pub fn kill(&mut self, slot: u32, cause: u32, killer: Option<u32>) {
        let s = slot as usize;
        let killer = killer.filter(|&k| self.creatures.slots.is_alive(k));
        if let Some(k) = killer {
            if self.kills.len() < KILL_LOG {
                let (x, y) = (self.creatures.x[s], self.creatures.y[s]);
                self.kills.push([x.to_bits(), y.to_bits(), k]);
            }
        }
        let stats = &mut self.stats;
        match cause {
            CAUSE_EATEN => stats.kills = stats.kills.saturating_add(1),
            CAUSE_POISONED => stats.poisoned = stats.poisoned.saturating_add(1),
            CAUSE_SPIKED => stats.spiked = stats.spiked.saturating_add(1),
            _ => {}
        }
        stats.deaths = stats.deaths.saturating_add(1);
        let control = &self.control;
        if control.possessed != 0 && control.possessed_slot == slot {
            let uid = killer.map_or(0, |k| self.creatures.uid[k as usize]);
            let mut brain = Vec::new();
            if uid != 0 {
                // `readout` writes the scratch of `tp_brain_write`. The page's copy of it stays.
                let page = std::mem::take(&mut self.readout);
                brain::readout(self, uid);
                brain = std::mem::replace(&mut self.readout, page);
            }
            let c = &mut self.control;
            (c.death_cause, c.killer, c.killer_brain) = (cause, uid, brain);
            c.possessed = 0;
            c.manual = false;
        }
        // Rule F1: a share of the body's store and of what it cost to build stays as debris. A full
        // pool loses it.
        let p = &self.params;
        let corpse_share = p.get(id::CORPSE_SHARE);
        if corpse_share > 0.0 {
            if let Some(d) = self.debris.slots.alloc() {
                let c = &self.creatures;
                let mass = c.mass(s, p.get(id::PART_MASS), p.get(id::EYE_COST));
                let energy = corpse_share * (c.energy[s].max(0.0) + p.get(id::BUILD_COST) * mass);
                let (d, debris) = (d as usize, &mut self.debris);
                (debris.x[d], debris.y[d], debris.energy[d]) = (c.x[s], c.y[s], energy);
                debris.dirty = true;
            }
        }
        self.creatures.slots.free(slot);
        self.creatures.uid[s] = 0;
    }

    /// Makes the starting world: the fertility map, then the creatures, then the plants. Call it
    /// once, on a new world, after the parameters are set. It replaces the fertility map.
    ///
    /// Founders are adults (growth 1) at `energy01` 0.5, with an age uniform in
    /// `[0, lifespan / 2)`. Each one draws from `rng_spawn`, in this order: its genome, then with
    /// `founder_jaw` above 0 a chance (rule P3 of the M4 plan: below `founder_jaw`, `Genome::arm`
    /// makes it a hunter), then `FOUNDER_TRIES` places of 3 draws each (x, y, and a chance), then
    /// its heading, then its age.
    /// It takes the first place whose chance is below the fertility there, or the last place if
    /// none is. Every founder makes the same number of draws, so the fertility map moves founders
    /// but does not change their genomes.
    pub fn seed_founders(&mut self, creatures: u32, plants: u32) {
        self.fertility = Fertility::generate(
            &mut self.rng_plants,
            self.w,
            self.h,
            self.params.get(id::FERT_BLOBS) as u32,
            self.params.get(id::FERT_RADIUS),
        );
        let half_lifespan = (self.params.get(id::LIFESPAN) / 2.0) as u32;
        let jaw = self.params.get(id::FOUNDER_JAW);
        for _ in 0..creatures {
            let rng = &mut self.rng_spawn;
            let mut genome = Genome::founder(rng, &self.params);
            if jaw > 0.0 && rng.unit() < jaw {
                genome.arm(&self.params);
            }
            let (mut place, mut placed) = ((0.0, 0.0), false);
            for _ in 0..FOUNDER_TRIES {
                let (x, y, chance) = (rng.range(0.0, self.w), rng.range(0.0, self.h), rng.unit());
                if !placed {
                    place = (x, y);
                    placed = chance < self.fertility.at(x, y);
                }
            }
            let (heading, age) = (rng.range(-PI, PI), rng.below(half_lifespan));
            let at = SpawnAt {
                x: place.0,
                y: place.1,
                heading,
                growth: FOUNDER_GROWTH,
                energy01: FOUNDER_ENERGY01,
                parent: 0,
                generation: 0,
                mark: 0,
            };
            let Some(slot) = self.spawn(genome, at) else {
                break;
            };
            self.creatures.age[slot as usize] = age;
        }
        plant::seed(self, plants);
    }

    /// The phases in their fixed order, and nothing else.
    pub fn tick(&mut self) {
        self.grid
            .rebuild(&self.creatures.slots, &self.creatures.x, &self.creatures.y);
        sense::step(self);
        brain::step(self);
        control::apply(self);
        ability::step(self);
        motor::step(self);
        mate::step(self);
        bite::step(self);
        ability::clouds(self);
        energy::contact(self);
        energy::life(self);
        repro::step(self);
        plant::step(self);
        debris::step(self);
        field::step(self);
        // Wraps: a snapshot can hold any tick, and a debug build panics on overflow.
        self.tick = self.tick.wrapping_add(1);
    }

    pub fn run(&mut self, ticks: u32) {
        for _ in 0..ticks {
            self.tick();
        }
    }

    /// Every field that affects the future, live slots only. The header, the generators, the
    /// parameters, the creatures, their genomes, the counters, then one part per module in tick
    /// order.
    pub fn save_payload(&self) -> Vec<u8> {
        let mut w = Writer::new();
        w.u32(self.tick);
        w.f32(self.w);
        w.f32(self.h);
        w.u32(self.next_uid);
        w.u32(self.next_history);
        self.rng_spawn.save(&mut w);
        self.rng_mutate.save(&mut w);
        self.rng_plants.save(&mut w);
        self.rng_mate.save(&mut w);
        self.params.save(&mut w);
        self.creatures.save(&mut w);
        let c = &self.creatures;
        for s in (0..c.slots.high_water()).filter(|&s| c.slots.is_alive(s)) {
            self.genomes[s as usize].save(&mut w);
        }
        self.stats.save(&mut w);
        sense::save(self, &mut w);
        brain::save(self, &mut w);
        control::save(self, &mut w);
        ability::save(self, &mut w);
        motor::save(self, &mut w);
        mate::save(self, &mut w);
        bite::save(self, &mut w);
        energy::save(self, &mut w);
        repro::save(self, &mut w);
        plant::save(self, &mut w);
        debris::save(self, &mut w);
        field::save(self, &mut w);
        w.bytes
    }

    pub fn state_hash(&self) -> u32 {
        crc32(&self.save_payload())
    }

    /// MAGIC, FORMAT_VERSION, payload length, payload, crc32(payload). All little-endian.
    pub fn save(&self) -> Vec<u8> {
        snapshot::seal(&self.save_payload())
    }

    /// Reads in the order `save_payload` writes. Never panics. Bad data is an error, not a world.
    /// A world that loads does not panic on a tick: every value used as an index is checked here.
    pub fn load(bytes: &[u8]) -> Result<World, LoadError> {
        let mut r = Reader::new(snapshot::open(bytes)?);
        let tick = r.u32()?;
        let (w, h) = (r.f32()?, r.f32()?);
        if !size_ok(w, h) {
            return Err(LoadError::Invalid("world size"));
        }
        // The scratch state, and the state that a module's `load` fills, start as in a new world.
        let mut world = World::new(0, w, h);
        world.tick = tick;
        world.next_uid = r.u32()?;
        if world.next_uid == 0 {
            return Err(LoadError::Invalid("next uid of 0"));
        }
        world.next_history = r.u32()?;
        world.rng_spawn = Rng::load(&mut r)?;
        world.rng_mutate = Rng::load(&mut r)?;
        world.rng_plants = Rng::load(&mut r)?;
        world.rng_mate = Rng::load(&mut r)?;
        world.params = Params::load(&mut r)?;
        world.creatures = Creatures::load(&mut r)?;
        // A dead slot holds uid 0, so this reads live uids only.
        if world.creatures.uid.iter().any(|&u| u >= world.next_uid) {
            return Err(LoadError::Invalid("creature uid not below next uid"));
        }
        for s in 0..world.creatures.slots.high_water() as usize {
            if world.creatures.slots.is_alive(s as u32) {
                world.genomes[s] = Genome::load(&mut r)?;
                // The body, and the bias, alpha, and connections of the brain, are not saved. They
                // come from the genome.
                world.creatures.express(s, &world.genomes[s]);
                world.brains.express(s, &world.genomes[s], &world.params);
            }
        }
        world.stats = Stats::load(&mut r)?;
        sense::load(&mut world, &mut r)?;
        brain::load(&mut world, &mut r)?;
        control::load(&mut world, &mut r)?;
        ability::load(&mut world, &mut r)?;
        motor::load(&mut world, &mut r)?;
        mate::load(&mut world, &mut r)?;
        bite::load(&mut world, &mut r)?;
        energy::load(&mut world, &mut r)?;
        repro::load(&mut world, &mut r)?;
        plant::load(&mut world, &mut r)?;
        debris::load(&mut world, &mut r)?;
        field::load(&mut world, &mut r)?;
        r.end()?;
        Ok(world)
    }
}
