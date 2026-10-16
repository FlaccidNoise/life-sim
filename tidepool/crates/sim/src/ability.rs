//! Abilities: dash, lunge, and the toxin cloud (rules A1 to A3 of the M4 plan), and the pool of
//! clouds.

use crate::control::CAUSE_POISONED;
use crate::creature;
use crate::genome::REF_WIDTH;
use crate::params::id;
use crate::pool::Slots;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

/// A budget, not a tuned number.
pub const MAX_CLOUDS: u32 = 256;

/// Every live cloud has at least 1 tick to live, a finite radius and drain of 0 or more, and a
/// maker uid that the world has given out. `load` keeps that.
pub struct Clouds {
    pub slots: Slots,
    pub x: Vec<f32>,
    pub y: Vec<f32>,
    pub radius: Vec<f32>,
    /// Ticks left to live.
    pub left: Vec<u32>,
    /// Energy per tick that the cloud takes from each body inside it but its maker.
    pub drain: Vec<f32>,
    /// The uid of the body that released the cloud. It can be dead.
    pub maker: Vec<u32>,
}

impl Default for Clouds {
    fn default() -> Clouds {
        let n = MAX_CLOUDS as usize;
        Clouds {
            slots: Slots::new(MAX_CLOUDS),
            x: vec![0.0; n],
            y: vec![0.0; n],
            radius: vec![0.0; n],
            left: vec![0; n],
            drain: vec![0.0; n],
            maker: vec![0; n],
        }
    }
}

/// Pays `cost` if the energy stays above 0. False, and nothing paid, if it would not.
fn pay(cost: f32, energy: &mut f32) -> bool {
    let paid = *energy - cost > 0.0;
    if paid {
        *energy -= cost;
    }
    paid
}

/// Dash, lunge, and toxin, after `control::apply` and before `motor::step`. Each live slot in
/// ascending order counts its cooldowns and `lunge_left` down by 1, then tries a dash, a lunge, and
/// a cloud in that order. An ability fires with its part, its command above 0, its cooldown at 0,
/// and its cost of `*_cost * area / REF_WIDTH` paid. It sets its cooldown to `ability_cooldown`. A
/// cloud needs a free place in the pool: a full pool fires nothing and charges nothing. The motor
/// holds the speed limit after this, so a dash cannot pass it.
pub fn step(world: &mut World) {
    let p = &world.params;
    let cooldown = p.get(id::ABILITY_COOLDOWN) as u32;
    let (dash_impulse, dash_spin) = (p.get(id::DASH_IMPULSE), p.get(id::DASH_SPIN));
    let (lunge_impulse, lunge_ticks) = (p.get(id::LUNGE_IMPULSE), p.get(id::LUNGE_TICKS) as u32);
    let (toxin_drain, toxin_radius) = (p.get(id::TOXIN_DRAIN), p.get(id::TOXIN_RADIUS));
    let toxin_ticks = p.get(id::TOXIN_TICKS) as u32;
    let (dash_cost, lunge_cost) = (p.get(id::DASH_COST), p.get(id::LUNGE_COST));
    let toxin_cost = p.get(id::TOXIN_COST);
    let (part_mass, eye_cost) = (p.get(id::PART_MASS), p.get(id::EYE_COST));
    let World {
        creatures: c,
        clouds,
        ..
    } = world;
    for s in 0..c.slots.high_water() as usize {
        if !c.slots.is_alive(s as u32) {
            continue;
        }
        // A count at 0 is read and not written: at Off every body is at 0 on every tick, and the
        // four stores per body cost 8% of a tick (M4 Task 8).
        for count in [
            &mut c.cd_dash,
            &mut c.cd_lunge,
            &mut c.cd_toxin,
            &mut c.lunge_left,
        ] {
            if count[s] > 0 {
                count[s] -= 1;
            }
        }
        // No command above 0: nothing can fire, and the part sums are not read.
        if c.cmd_dash[s] <= 0.0 && c.cmd_lunge[s] <= 0.0 && c.cmd_toxin[s] <= 0.0 {
            continue;
        }
        let flag = c.flag_push[s];
        if flag > 0.0
            && c.cmd_dash[s] > 0.0
            && c.cd_dash[s] == 0
            && pay(dash_cost * c.area(s) / REF_WIDTH, &mut c.energy[s])
        {
            let heft = creature::heft(c.part_sum(s, eye_cost), part_mass);
            let gain = dash_impulse * flag / heft;
            c.vx[s] += gain * c.hc[s];
            c.vy[s] += gain * c.hs[s];
            c.omega[s] += dash_spin * c.cmd_turn[s] * flag / heft;
            c.cd_dash[s] = cooldown;
        }
        let jaw = c.jaw_sum[s];
        if jaw > 0.0
            && c.cmd_lunge[s] > 0.0
            && c.cd_lunge[s] == 0
            && pay(lunge_cost * c.area(s) / REF_WIDTH, &mut c.energy[s])
        {
            let gain = lunge_impulse * jaw / creature::heft(c.part_sum(s, eye_cost), part_mass);
            c.vx[s] += gain * c.hc[s];
            c.vy[s] += gain * c.hs[s];
            c.cd_lunge[s] = cooldown;
            c.lunge_left[s] = lunge_ticks;
        }
        let gland = c.gland_sum[s];
        if gland > 0.0
            && c.cmd_toxin[s] > 0.0
            && c.cd_toxin[s] == 0
            && clouds.slots.count() < MAX_CLOUDS
            && pay(toxin_cost * c.area(s) / REF_WIDTH, &mut c.energy[s])
        {
            let k = clouds.slots.alloc().expect("the pool has room") as usize;
            (clouds.x[k], clouds.y[k]) = (c.x[s], c.y[s]);
            clouds.radius[k] = toxin_radius * c.length(s);
            clouds.left[k] = toxin_ticks;
            clouds.drain[k] = toxin_drain * gland;
            clouds.maker[k] = c.uid[s];
            c.cd_toxin[s] = cooldown;
        }
    }
}

/// The clouds drain the bodies inside them, after `bite::step`. Each live cloud in pool order takes
/// `min(drain, energy)` from each live body whose centre is inside it but its maker, in the order of
/// the creature grid of the start of the tick. The energy is lost. Bodies have moved since the grid
/// was made, by at most `v_max`, so the cloud reads the grid that far past its radius. Each cloud
/// then loses a tick and is freed at 0. After every cloud, in slot order, each body that a cloud
/// drained to 0 dies with `CAUSE_POISONED`, killed by the maker of that cloud.
pub fn clouds(world: &mut World) {
    if world.clouds.slots.count() == 0 {
        return;
    }
    let pad = world.params.get(id::V_MAX);
    let World {
        creatures: c,
        clouds,
        grid,
        ..
    } = world;
    // The slot of each body drained to 0, and the uid of the maker of the cloud that did it.
    let mut dead: Vec<(u32, u32)> = Vec::new();
    for k in 0..clouds.slots.high_water() {
        if !clouds.slots.is_alive(k) {
            continue;
        }
        let k = k as usize;
        let (x, y, r) = (clouds.x[k], clouds.y[k], clouds.radius[k]);
        let (drain, maker, reach) = (clouds.drain[k], clouds.maker[k], r + pad);
        grid.for_each_in_box(x - reach, y - reach, x + reach, y + reach, |j| {
            // A body that a bite killed on this tick is still in the grid.
            let j = j as usize;
            if !c.slots.is_alive(j as u32) || c.uid[j] == maker {
                return;
            }
            let (dx, dy) = (c.x[j] - x, c.y[j] - y);
            let take = drain.min(c.energy[j]);
            if dx * dx + dy * dy > r * r || take <= 0.0 {
                return;
            }
            c.energy[j] -= take;
            if c.energy[j] <= 0.0 {
                dead.push((j as u32, maker));
            }
        });
        clouds.left[k] -= 1;
        if clouds.left[k] == 0 {
            clouds.slots.free(k as u32);
        }
    }
    // A body drained to 0 takes nothing more, so it is in the list once.
    dead.sort_unstable();
    for (slot, maker) in dead {
        let killer = world.slot_of(maker);
        world.kill(slot, CAUSE_POISONED, killer);
    }
}

/// The live slots, then each field for those slots in the order of the struct.
pub fn save(world: &World, w: &mut Writer) {
    let c = &world.clouds;
    let live: Vec<u32> = (0..c.slots.high_water())
        .filter(|&s| c.slots.is_alive(s))
        .collect();
    let floats = |a: &[f32]| -> Vec<f32> { live.iter().map(|&s| a[s as usize]).collect() };
    let words = |a: &[u32]| -> Vec<u32> { live.iter().map(|&s| a[s as usize]).collect() };
    w.u32s(&live);
    w.f32s(&floats(&c.x));
    w.f32s(&floats(&c.y));
    w.f32s(&floats(&c.radius));
    w.u32s(&words(&c.left));
    w.f32s(&floats(&c.drain));
    w.u32s(&words(&c.maker));
}

/// Puts one value into `a` at each live slot. `Invalid` unless there is one value per live slot.
fn scatter<T>(live: &[u32], values: Vec<T>, a: &mut [T]) -> Result<(), LoadError> {
    if values.len() != live.len() {
        return Err(LoadError::Invalid("cloud field length"));
    }
    for (&s, v) in live.iter().zip(values) {
        a[s as usize] = v;
    }
    Ok(())
}

/// Reads what `save` wrote. The slot list must be strictly ascending and below `MAX_CLOUDS`, every
/// field must have one value per listed slot, and every cloud must hold what the struct says.
pub fn load(world: &mut World, r: &mut Reader) -> Result<(), LoadError> {
    let live = r.u32s()?;
    if live.windows(2).any(|p| p[0] >= p[1]) {
        return Err(LoadError::Invalid("cloud slots not ascending"));
    }
    if live.last().is_some_and(|&s| s >= MAX_CLOUDS) {
        return Err(LoadError::Invalid("cloud slot past capacity"));
    }
    let mut c = Clouds::default();
    for &s in &live {
        c.slots.mark_alive(s);
    }
    scatter(&live, r.f32s()?, &mut c.x)?;
    scatter(&live, r.f32s()?, &mut c.y)?;
    scatter(&live, r.f32s()?, &mut c.radius)?;
    scatter(&live, r.u32s()?, &mut c.left)?;
    scatter(&live, r.f32s()?, &mut c.drain)?;
    scatter(&live, r.u32s()?, &mut c.maker)?;
    // False for NaN.
    let finite = |v: f32| (0.0..f32::INFINITY).contains(&v);
    let sound = |s: usize| {
        c.left[s] > 0 && finite(c.radius[s]) && finite(c.drain[s]) && c.maker[s] < world.next_uid
    };
    if !live.iter().all(|&s| sound(s as usize)) {
        return Err(LoadError::Invalid("cloud out of range"));
    }
    world.clouds = c;
    Ok(())
}
