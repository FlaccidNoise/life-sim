//! The bite of a jaw (rule J1 of the M4 plan). The motor finds what each jaw holds, in its overlap
//! loop, and this phase moves the energy.

use crate::control::{CAUSE_EATEN, CAUSE_SPIKED};
use crate::creature::MAX_GUARDS;
use crate::genome::{KIND_SHELL, KIND_SPIKE, REF_WIDTH};
use crate::math::{pow_quarters, sin_cos};
use crate::motor::NO_TOUCH;
use crate::params::id;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

/// The squared cosine of a half angle, for the cone test of `eye.rs`.
fn cos2(half: f32) -> f32 {
    let cos = sin_cos(half).1;
    cos * cos
}

/// The side of a point in the frame of a body: 1 on the side of positive angles from the heading,
/// -1 on the other, 0 on the line of the heading.
pub(crate) fn side(y: f32) -> f32 {
    if y > 0.0 {
        1.0
    } else if y < 0.0 {
        -1.0
    } else {
        0.0
    }
}

/// With `bite_rate` at 0 it returns at once: no energy moves and no hit is recorded.
///
/// Each live slot `s` in ascending order with a body `j` in a jaw cone, as the motor found it on
/// this tick, bites `j` unless either is at 0 energy or less, `s` is lighter than
/// `bite_mass_ratio` times `j`, or `s` is full. The bite is `bite_rate` times the jaws that hold
/// `j` times the mouth of `s` times `diet^diet_k` of `s` (rule D1 of the diet plan), and
/// `lunge_bite` times that during a lunge. A spike hurts in proportion to that bite. The guards of `j` whose
/// arc holds `s`, at the places of this tick after the motor, block a share of it (shells) and
/// hurt `s` (spikes). What `j` loses `s` gains. What a spike hurts is lost.
///
/// A body taken to 0 or less is killed after the loop, in slot order: a bitten body with
/// `CAUSE_EATEN` and a biter with `CAUSE_SPIKED`, each killed by the other.
pub fn step(world: &mut World) {
    let p = &world.params;
    let rate = p.get(id::BITE_RATE);
    if rate <= 0.0 {
        return;
    }
    let (ratio, per_mass) = (p.get(id::BITE_MASS_RATIO), p.get(id::ENERGY_PER_MASS));
    let (lunge_bite, spike_hurt) = (p.get(id::LUNGE_BITE), p.get(id::SPIKE_HURT));
    let (shell_block, diet_k) = (p.get(id::SHELL_BLOCK), p.get(id::DIET_K));
    let (shell_cos2, spike_cos2) = (cos2(p.get(id::SHELL_ARC)), cos2(p.get(id::SPIKE_ARC)));
    // `World::tick` after this tick, as the frame reads a stamp.
    let stamp = world.tick.wrapping_add(1);
    let World {
        creatures: c,
        motor,
        stats,
        ..
    } = world;
    let mut dead: Vec<(u32, u32, u32)> = Vec::new();
    for s in 0..c.slots.high_water() as usize {
        if !c.slots.is_alive(s as u32) || motor.bite_target[s] == NO_TOUCH {
            continue;
        }
        let j = motor.bite_target[s] as usize;
        if c.energy[s] <= 0.0 || c.energy[j] <= 0.0 {
            continue;
        }
        if motor.mass[s] < ratio * motor.mass[j] {
            continue;
        }
        let area = c.area(s);
        let room = per_mass * area - c.energy[s];
        if room <= 0.0 {
            continue;
        }
        let mut bite =
            rate * motor.bite_jaws[s] * (area / REF_WIDTH) * pow_quarters(c.diet[s], diet_k);
        if c.lunge_left[s] > 0 {
            bite *= lunge_bite;
        }
        // The offset from `j` to `s`, in the frame of `j`, where `express` holds the guards.
        let (dx, dy) = (c.x[s] - c.x[j], c.y[s] - c.y[j]);
        let (hx, hy) = (dx * c.hc[j] + dy * c.hs[j], dy * c.hc[j] - dx * c.hs[j]);
        let d2 = hx * hx + hy * hy;
        let (mut shell, mut spike) = (0.0f32, 0.0f32);
        let first = j * MAX_GUARDS;
        for k in first..first + (c.n_guards[j] as usize).min(MAX_GUARDS) {
            let along = hx * c.guard_ax[k] + hy * c.guard_ay[k];
            let held = |cos2: f32| along > 0.0 && along * along >= cos2 * d2;
            match c.guard_kind[k] {
                KIND_SHELL if held(shell_cos2) => shell += c.guard_size[k],
                KIND_SPIKE if held(spike_cos2) => spike += c.guard_size[k],
                _ => {}
            }
        }

        let take = (bite * (1.0 - (shell_block * shell).min(1.0)))
            .min(c.energy[j])
            .min(room);
        c.energy[j] -= take;
        c.energy[s] += take;
        stats.flesh += take as f64;
        let hurt = spike_hurt * spike * bite;
        c.energy[s] -= hurt;

        c.hurt[j] += take;
        c.hurt_side[j] = side(hy);
        if take > 0.0 {
            (c.bit_tick[s], c.hurt_tick[j]) = (stamp, stamp);
        }
        if hurt > 0.0 {
            // The spike is on `j`, so the hit on `s` comes from the side where `j` is.
            c.hurt[s] += hurt;
            c.hurt_side[s] = side(dx * c.hs[s] - dy * c.hc[s]);
            c.hurt_tick[s] = stamp;
        }
        if c.energy[j] <= 0.0 {
            dead.push((j as u32, CAUSE_EATEN, s as u32));
        }
        if c.energy[s] <= 0.0 {
            dead.push((s as u32, CAUSE_SPIKED, j as u32));
        }
    }
    // A body at 0 is skipped by every later bite, so a slot is in `dead` once.
    dead.sort_unstable_by_key(|d| d.0);
    let dead: Vec<_> = dead.into_iter().map(|(s, c, k)| (s, c, Some(k))).collect();
    world.kill_all(&dead);
}

/// Writes nothing: the bite target is motor scratch, and the hurt is a creature field.
pub fn save(_world: &World, _w: &mut Writer) {}

/// Reads nothing.
pub fn load(_world: &mut World, _r: &mut Reader) -> Result<(), LoadError> {
    Ok(())
}
