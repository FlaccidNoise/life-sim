//! The player's hold on one creature: pick, possess, release, input, heirs, and the cause of death.

use crate::creature::MARK_LINEAGE;
use crate::params::id;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

pub const CAUSE_NONE: u32 = 0;
pub const CAUSE_STARVED: u32 = 1;
pub const CAUSE_OLD_AGE: u32 = 2;
/// uid, slot, x, y, energy01, generation, hue. The floats are stored by bit pattern.
pub const HEIR_STRIDE: usize = 7;
pub const MAX_HEIRS: usize = 5;

#[derive(Default)]
pub struct Control {
    /// A uid. 0 for none.
    pub possessed: u32,
    /// Valid when `possessed != 0`. Not saved: `load` finds the slot from the uid.
    pub possessed_slot: u32,
    pub manual: bool,
    pub thrust: f32,
    pub turn: f32,
    /// The player courts. Stored, and read by no rule yet.
    pub accept: bool,
    pub death_cause: u32,
    /// Buds of the possessed body since it was possessed.
    pub buds: u32,
    /// Scratch, not saved. The last list that `write_heirs` made.
    pub heirs: Vec<u32>,
}

impl World {
    /// The slot of a live creature. Scans the pool, so it is for possess and load, never per tick.
    pub fn slot_of(&self, uid: u32) -> Option<u32> {
        let c = &self.creatures;
        (0..c.slots.high_water()).find(|&s| c.slots.is_alive(s) && c.uid[s as usize] == uid)
    }

    /// The nearest live creature whose centre is within `r` of the point. 0 if none. Of two at the
    /// same distance, the lower slot.
    pub fn pick(&self, x: f32, y: f32, r: f32) -> u32 {
        if r.is_nan() || r < 0.0 {
            return 0;
        }
        let c = &self.creatures;
        let (mut best, mut best_d2) = (0, r * r);
        for s in 0..c.slots.high_water() as usize {
            if !c.slots.is_alive(s as u32) {
                continue;
            }
            let (dx, dy) = (c.x[s] - x, c.y[s] - y);
            let d2 = dx * dx + dy * dy;
            // Both tests are false for NaN, so a point or a creature at NaN picks nothing.
            if d2 < best_d2 || (d2 == best_d2 && best == 0) {
                (best, best_d2) = (c.uid[s], d2);
            }
        }
        best
    }

    /// Sets the lineage mark on the creature and on every living creature that descends from it
    /// through living parents, and clears `death_cause` and `buds`. A descendant behind a dead
    /// parent gets no mark. The new body starts with its brain driving. False if the uid is not
    /// alive. It scans the whole pool, so it is for the player's click, never per tick.
    pub fn possess(&mut self, uid: u32) -> bool {
        let Some(slot) = self.slot_of(uid) else {
            return false;
        };
        let c = &mut self.creatures;
        // A parent has a lower uid than its child, so one pass in uid order sees each parent first.
        let mut live: Vec<(u32, usize)> = (0..c.slots.high_water() as usize)
            .filter(|&s| c.slots.is_alive(s as u32))
            .map(|s| (c.uid[s], s))
            .collect();
        live.sort_unstable();
        let mut line = vec![uid];
        for (u, s) in live {
            if u > uid && line.binary_search(&c.parent[s]).is_ok() {
                line.push(u);
                c.mark[s] |= MARK_LINEAGE;
            }
        }
        c.mark[slot as usize] |= MARK_LINEAGE;
        self.control.possessed = uid;
        self.control.possessed_slot = slot;
        self.control.death_cause = CAUSE_NONE;
        self.control.buds = 0;
        self.input(false, 0.0, 0.0, false);
        true
    }

    /// The creature keeps its mark.
    pub fn release(&mut self) {
        self.control.possessed = 0;
        self.input(false, 0.0, 0.0, false);
    }

    /// Clamps `thrust` to `[0, 1]` and `turn` to `[-1, 1]`. NaN counts as 0.
    pub fn input(&mut self, manual: bool, thrust: f32, turn: f32, accept: bool) {
        let clean = |v: f32, lo: f32| if v.is_nan() { 0.0 } else { v.clamp(lo, 1.0) };
        self.control.manual = manual;
        self.control.thrust = clean(thrust, 0.0);
        self.control.turn = clean(turn, -1.0);
        self.control.accept = accept;
    }

    /// Live creatures with the lineage mark, highest `energy01` first, ties by lower slot. At most
    /// `MAX_HEIRS`. Fills `control.heirs` and returns the count.
    pub fn write_heirs(&mut self) -> u32 {
        let c = &self.creatures;
        let per_mass = self.params.get(id::ENERGY_PER_MASS);
        let mut marked: Vec<(f32, usize)> = (0..c.slots.high_water() as usize)
            .filter(|&s| c.slots.is_alive(s as u32) && c.mark[s] & MARK_LINEAGE != 0)
            .map(|s| (c.energy01(s, per_mass), s))
            .collect();
        marked.sort_by(|a, b| b.0.total_cmp(&a.0).then(a.1.cmp(&b.1)));
        marked.truncate(MAX_HEIRS);
        self.control.heirs.clear();
        for &(energy01, s) in &marked {
            self.control.heirs.extend_from_slice(&[
                c.uid[s],
                s as u32,
                c.x[s].to_bits(),
                c.y[s].to_bits(),
                energy01.to_bits(),
                c.generation[s],
                c.hue[s].to_bits(),
            ]);
        }
        marked.len() as u32
    }
}

/// If a creature is possessed and the input is manual, the player's values replace that slot's
/// commands.
pub fn apply(world: &mut World) {
    let (c, slot) = (&world.control, world.control.possessed_slot as usize);
    if c.possessed != 0 && c.manual {
        world.creatures.cmd_thrust[slot] = c.thrust;
        world.creatures.cmd_turn[slot] = c.turn;
    }
}

/// Everything but `possessed_slot` and `heirs`, so a reload keeps the player in their body.
pub fn save(world: &World, w: &mut Writer) {
    let c = &world.control;
    w.u32(c.possessed);
    w.u32(c.manual as u32);
    w.f32(c.thrust);
    w.f32(c.turn);
    w.u32(c.accept as u32);
    w.u32(c.death_cause);
    w.u32(c.buds);
}

/// A possessed uid must be alive. The input must be what `World::input` could have stored.
pub fn load(world: &mut World, r: &mut Reader) -> Result<(), LoadError> {
    let possessed = r.u32()?;
    let possessed_slot = match possessed {
        0 => 0,
        uid => world
            .slot_of(uid)
            .ok_or(LoadError::Invalid("possessed creature is not alive"))?,
    };
    let flag = |v: u32, reason: &'static str| match v {
        0 => Ok(false),
        1 => Ok(true),
        _ => Err(LoadError::Invalid(reason)),
    };
    let manual = flag(r.u32()?, "control manual flag")?;
    let (thrust, turn) = (r.f32()?, r.f32()?);
    if !(0.0..=1.0).contains(&thrust) || !(-1.0..=1.0).contains(&turn) {
        return Err(LoadError::Invalid("control input out of range"));
    }
    let accept = flag(r.u32()?, "control accept flag")?;
    let death_cause = r.u32()?;
    if death_cause > CAUSE_OLD_AGE {
        return Err(LoadError::Invalid("death cause"));
    }
    let buds = r.u32()?;
    world.control = Control {
        possessed,
        possessed_slot,
        manual,
        thrust,
        turn,
        accept,
        death_cause,
        buds,
        heirs: Vec::new(),
    };
    Ok(())
}
