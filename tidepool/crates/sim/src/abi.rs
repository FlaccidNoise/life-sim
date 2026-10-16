//! Every export of the WebAssembly module. No simulation rules live here.
//!
//! Safety, for every export that takes a pointer: a `World` pointer is null or came from `tp_new`
//! or `tp_load` and has not been passed to `tp_free`. A null world is a no-op that returns 0 or
//! null. A byte pointer is null or came from `tp_alloc` with the same `len`.
#![allow(clippy::missing_safety_doc)]

use std::alloc::{alloc, dealloc, Layout};
use std::cell::RefCell;
use std::ptr::{self, NonNull};

use crate::brain;
use crate::control::HEIR_STRIDE;
use crate::creature::MAX_EYES;
use crate::frame;
use crate::genome;
use crate::math::{sin_cos, wrap_angle};
use crate::params::{ParamDef, DEFS};
use crate::world::{self, World};

pub const ABI_VERSION: u32 = 9;

thread_local! {
    /// Why the last `tp_new` or `tp_load` returned null.
    static ERROR: RefCell<String> = const { RefCell::new(String::new()) };
}

fn fail(message: String) -> *mut World {
    ERROR.set(message);
    ptr::null_mut()
}

#[no_mangle]
pub extern "C" fn tp_abi_version() -> u32 {
    ABI_VERSION
}

/// Null when the size is not one that `world::size_ok` accepts.
#[no_mangle]
pub extern "C" fn tp_new(seed: u32, w: f32, h: f32) -> *mut World {
    if !world::size_ok(w, h) {
        return fail(format!(
            "world size {w} by {h} is not allowed: each side must be at least 1 and at most {}",
            world::MAX_WORLD_SIZE
        ));
    }
    Box::into_raw(Box::new(World::new(seed, w, h)))
}

#[no_mangle]
pub unsafe extern "C" fn tp_free(world: *mut World) {
    if !world.is_null() {
        drop(Box::from_raw(world));
    }
}

/// Call once, on a new world, after the parameters are set.
#[no_mangle]
pub unsafe extern "C" fn tp_seed_founders(world: *mut World, creatures: u32, plants: u32) {
    if let Some(w) = world.as_mut() {
        w.seed_founders(creatures, plants);
    }
}

#[no_mangle]
pub unsafe extern "C" fn tp_tick(world: *mut World, n: u32) {
    if let Some(w) = world.as_mut() {
        w.run(n);
    }
}

#[no_mangle]
pub unsafe extern "C" fn tp_world_w(world: *const World) -> f32 {
    world.as_ref().map_or(0.0, |w| w.w)
}

#[no_mangle]
pub unsafe extern "C" fn tp_world_h(world: *const World) -> f32 {
    world.as_ref().map_or(0.0, |w| w.h)
}

#[no_mangle]
pub unsafe extern "C" fn tp_tick_count(world: *const World) -> u32 {
    world.as_ref().map_or(0, |w| w.tick)
}

#[no_mangle]
pub unsafe extern "C" fn tp_hash(world: *const World) -> u32 {
    world.as_ref().map_or(0, World::state_hash)
}

/// The keys are the `STAT_` constants in `stats.rs`. -1 for an unknown `k`.
#[no_mangle]
pub unsafe extern "C" fn tp_stat(world: *const World, k: u32) -> f64 {
    world.as_ref().map_or(0.0, |w| w.stat(k))
}

// The parameter table. An index out of range reads as 0 or null, and writes nothing.

fn param(i: u32) -> Option<&'static ParamDef> {
    DEFS.get(i as usize)
}

#[no_mangle]
pub extern "C" fn tp_param_count() -> u32 {
    DEFS.len() as u32
}

/// UTF-8, not terminated. Valid for the life of the module.
#[no_mangle]
pub extern "C" fn tp_param_name_ptr(i: u32) -> *const u8 {
    param(i).map_or(ptr::null(), |d| d.name.as_ptr())
}

#[no_mangle]
pub extern "C" fn tp_param_name_len(i: u32) -> u32 {
    param(i).map_or(0, |d| d.name.len() as u32)
}

#[no_mangle]
pub extern "C" fn tp_param_default(i: u32) -> f32 {
    param(i).map_or(0.0, |d| d.default)
}

#[no_mangle]
pub extern "C" fn tp_param_min(i: u32) -> f32 {
    param(i).map_or(0.0, |d| d.min)
}

#[no_mangle]
pub extern "C" fn tp_param_max(i: u32) -> f32 {
    param(i).map_or(0.0, |d| d.max)
}

#[no_mangle]
pub unsafe extern "C" fn tp_param_get(world: *const World, i: u32) -> f32 {
    match (world.as_ref(), param(i)) {
        (Some(w), Some(_)) => w.params.get(i as usize),
        _ => 0.0,
    }
}

/// Clamps to the parameter's range, and moves `diet_k` to its nearest step. NaN is ignored.
#[no_mangle]
pub unsafe extern "C" fn tp_param_set(world: *mut World, i: u32, v: f32) {
    if let (Some(w), Some(_)) = (world.as_mut(), param(i)) {
        w.params.set(i as usize, v);
    }
}

// Control.

/// The uid of the nearest creature within `r` of the point. 0 if none.
#[no_mangle]
pub unsafe extern "C" fn tp_pick(world: *const World, x: f32, y: f32, r: f32) -> u32 {
    world.as_ref().map_or(0, |w| w.pick(x, y, r))
}

/// 1 if the uid is alive and is now possessed, else 0.
#[no_mangle]
pub unsafe extern "C" fn tp_possess(world: *mut World, uid: u32) -> u32 {
    world.as_mut().map_or(0, |w| w.possess(uid) as u32)
}

#[no_mangle]
pub unsafe extern "C" fn tp_release(world: *mut World) {
    if let Some(w) = world.as_mut() {
        w.release();
    }
}

/// The uid of the possessed creature. 0 for none.
#[no_mangle]
pub unsafe extern "C" fn tp_possessed(world: *const World) -> u32 {
    world.as_ref().map_or(0, |w| w.control.possessed)
}

/// For tests and the debug page: sets the first part of `kind` on the living body `uid` to `size`,
/// or adds one at the kind's founder anchor, and expresses the body and its brain again. 1 if the
/// body is alive and the kind is 1 to `KINDS`, else 0.
#[no_mangle]
pub unsafe extern "C" fn tp_set_part(world: *mut World, uid: u32, kind: u8, size: f32) -> u32 {
    let Some(w) = world.as_mut() else {
        return 0;
    };
    let Some(s) = w.slot_of(uid) else {
        return 0;
    };
    if kind == 0 || kind > genome::KINDS || !size.is_finite() {
        return 0;
    }
    let s = s as usize;
    w.genomes[s].set_size(kind, size);
    w.creatures.express(s, &w.genomes[s]);
    // A kind that declares a port changes the block: without this a save of the world did not
    // load (the activation count did not fit the block).
    w.brains.express(s, &w.genomes[s], &w.params);
    1
}

/// For tests and the debug page: puts the living body `uid` at the point, clamped to the world,
/// with the heading, wrapped. Its velocity is kept. 1 if the body is alive, else 0.
#[no_mangle]
pub unsafe extern "C" fn tp_place(
    world: *mut World,
    uid: u32,
    x: f32,
    y: f32,
    heading: f32,
) -> u32 {
    let Some(w) = world.as_mut() else {
        return 0;
    };
    let Some(s) = w.slot_of(uid) else {
        return 0;
    };
    if !(x.is_finite() && y.is_finite() && heading.is_finite()) {
        return 0;
    }
    let (s, c) = (s as usize, &mut w.creatures);
    (c.x[s], c.y[s]) = (x.clamp(0.0, w.w), y.clamp(0.0, w.h));
    c.heading[s] = wrap_angle(heading);
    (c.hs[s], c.hc[s]) = sin_cos(c.heading[s]);
    1
}

/// `manual` is 0 for the brain and any other value for the player. `accept` is 0 for a player who
/// does not court and any other value for one who does. `abilities` is a mask of the `ABILITY_`
/// bits in `control.rs`: 1 dash, 2 lunge, 4 toxin. Other bits are dropped.
#[no_mangle]
pub unsafe extern "C" fn tp_input(
    world: *mut World,
    manual: u32,
    thrust: f32,
    turn: f32,
    accept: u32,
    abilities: u32,
) {
    if let Some(w) = world.as_mut() {
        w.input(manual != 0, thrust, turn, accept != 0, abilities);
    }
}

/// A `CAUSE_` constant in `control.rs`. Set when the possessed creature dies. Cleared by the next
/// possess.
#[no_mangle]
pub unsafe extern "C" fn tp_death_cause(world: *const World) -> u32 {
    world.as_ref().map_or(0, |w| w.control.death_cause)
}

/// The uid of the body that killed the possessed creature. 0 for none. Set and cleared with
/// `tp_death_cause`.
#[no_mangle]
pub unsafe extern "C" fn tp_killer(world: *const World) -> u32 {
    world.as_ref().map_or(0, |w| w.control.killer)
}

/// The words of the readout of the killer's brain at the kill, as `tp_brain_write` lays them out.
/// 0 with no killer.
#[no_mangle]
pub unsafe extern "C" fn tp_killer_brain_len(world: *const World) -> u32 {
    world
        .as_ref()
        .map_or(0, |w| w.control.killer_brain.len() as u32)
}

/// Valid until the next tick, possess, `tp_load` of this world, or `tp_free`.
#[no_mangle]
pub unsafe extern "C" fn tp_killer_brain_ptr(world: *const World) -> *const u32 {
    world
        .as_ref()
        .map_or(ptr::null(), |w| w.control.killer_brain.as_ptr())
}

/// The words of the killer's body at the kill, as `Control::killer_body` lays them out. 0 with no
/// killer.
#[no_mangle]
pub unsafe extern "C" fn tp_killer_body_len(world: *const World) -> u32 {
    world
        .as_ref()
        .map_or(0, |w| w.control.killer_body.len() as u32)
}

/// Valid until the next tick, possess, `tp_load` of this world, or `tp_free`.
#[no_mangle]
pub unsafe extern "C" fn tp_killer_body_ptr(world: *const World) -> *const u32 {
    world
        .as_ref()
        .map_or(ptr::null(), |w| w.control.killer_body.as_ptr())
}

#[no_mangle]
pub extern "C" fn tp_heir_stride() -> u32 {
    HEIR_STRIDE as u32
}

/// Returns the number of heirs. Each is `tp_heir_stride` words at `tp_heirs_ptr`.
#[no_mangle]
pub unsafe extern "C" fn tp_heirs_write(world: *mut World) -> u32 {
    world.as_mut().map_or(0, World::write_heirs)
}

/// Valid until the next `tp_heirs_write` or `tp_free`.
#[no_mangle]
pub unsafe extern "C" fn tp_heirs_ptr(world: *const World) -> *const u32 {
    world
        .as_ref()
        .map_or(ptr::null(), |w| w.control.heirs.as_ptr())
}

#[no_mangle]
pub extern "C" fn tp_frame_header_words() -> u32 {
    frame::HEADER_WORDS
}

#[no_mangle]
pub extern "C" fn tp_frame_creature_stride() -> u32 {
    frame::CREATURE_STRIDE
}

#[no_mangle]
pub extern "C" fn tp_frame_plant_stride() -> u32 {
    frame::PLANT_STRIDE
}

#[no_mangle]
pub extern "C" fn tp_frame_debris_stride() -> u32 {
    frame::DEBRIS_STRIDE
}

#[no_mangle]
pub extern "C" fn tp_frame_cloud_stride() -> u32 {
    frame::CLOUD_STRIDE
}

/// The kills in view that the frame header has room for.
#[no_mangle]
pub extern "C" fn tp_frame_max_kills() -> u32 {
    frame::MAX_FRAME_KILLS as u32
}

/// The part words of a creature record.
#[no_mangle]
pub extern "C" fn tp_frame_part_words() -> u32 {
    frame::PART_WORDS
}

/// The eye cones that the frame header has room for.
#[no_mangle]
pub extern "C" fn tp_frame_max_eyes() -> u32 {
    MAX_EYES as u32
}

/// Returns the `u32` words written.
#[no_mangle]
pub unsafe extern "C" fn tp_frame_write(
    world: *mut World,
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
) -> u32 {
    world
        .as_mut()
        .map_or(0, |w| frame::write(w, x0, y0, x1, y1))
}

/// Valid until the next `tp_frame_write` or `tp_free`.
#[no_mangle]
pub unsafe extern "C" fn tp_frame_ptr(world: *const World) -> *const u32 {
    world.as_ref().map_or(ptr::null(), |w| w.frame.as_ptr())
}

#[no_mangle]
pub extern "C" fn tp_brain_header_words() -> u32 {
    brain::READOUT_HEADER_WORDS
}

#[no_mangle]
pub extern "C" fn tp_brain_neuron_words() -> u32 {
    brain::READOUT_NEURON_WORDS
}

#[no_mangle]
pub extern "C" fn tp_brain_conn_words() -> u32 {
    brain::READOUT_CONN_WORDS
}

/// Writes the brain of the creature with this uid: see `brain::readout`. Returns the `u32` words
/// written, and 0 for a uid that is not alive.
#[no_mangle]
pub unsafe extern "C" fn tp_brain_write(world: *mut World, uid: u32) -> u32 {
    world.as_mut().map_or(0, |w| brain::readout(w, uid))
}

/// Valid until the next `tp_brain_write` or `tp_free`.
#[no_mangle]
pub unsafe extern "C" fn tp_brain_ptr(world: *const World) -> *const u32 {
    world.as_ref().map_or(ptr::null(), |w| w.readout.as_ptr())
}

/// Null when the memory cannot be had.
#[no_mangle]
pub extern "C" fn tp_alloc(len: u32) -> *mut u8 {
    if len == 0 {
        return NonNull::dangling().as_ptr();
    }
    match Layout::array::<u8>(len as usize) {
        Ok(layout) => unsafe { alloc(layout) },
        Err(_) => ptr::null_mut(),
    }
}

#[no_mangle]
pub unsafe extern "C" fn tp_dealloc(ptr: *mut u8, len: u32) {
    if ptr.is_null() || len == 0 {
        return;
    }
    if let Ok(layout) = Layout::array::<u8>(len as usize) {
        dealloc(ptr, layout);
    }
}

/// Returns the snapshot length in bytes. The buffer is valid until the next `tp_save` or `tp_free`.
#[no_mangle]
pub unsafe extern "C" fn tp_save(world: *mut World) -> u32 {
    world.as_mut().map_or(0, |w| {
        w.save_buf = w.save();
        w.save_buf.len() as u32
    })
}

#[no_mangle]
pub unsafe extern "C" fn tp_save_ptr(world: *const World) -> *const u8 {
    world.as_ref().map_or(ptr::null(), |w| w.save_buf.as_ptr())
}

/// Null on error. `tp_error_ptr` and `tp_error_len` give the reason.
#[no_mangle]
pub unsafe extern "C" fn tp_load(ptr: *const u8, len: u32) -> *mut World {
    if ptr.is_null() {
        return fail("snapshot pointer is null".into());
    }
    match World::load(std::slice::from_raw_parts(ptr, len as usize)) {
        Ok(w) => Box::into_raw(Box::new(w)),
        Err(e) => fail(format!("snapshot rejected: {e:?}")),
    }
}

/// UTF-8, not terminated. Valid until the next `tp_new` or `tp_load`.
#[no_mangle]
pub extern "C" fn tp_error_ptr() -> *const u8 {
    ERROR.with_borrow(|e| e.as_ptr())
}

#[no_mangle]
pub extern "C" fn tp_error_len() -> u32 {
    ERROR.with_borrow(|e| e.len() as u32)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::params::id;

    fn error() -> String {
        ERROR.with_borrow(String::clone)
    }

    #[test]
    fn a_test_can_give_a_body_a_jaw_place_it_and_read_its_generation() {
        unsafe {
            let a = tp_new(1, 1536.0, 1024.0);
            tp_seed_founders(a, 10, 0);
            let w = &*a;
            let s = w.slot_of(3).expect("uid 3 lives") as usize;
            assert_eq!(w.creatures.jaw_sum[s], 0.0);
            assert_eq!(tp_set_part(a, 3, genome::KIND_JAW, 0.5), 1);
            let w = &*a;
            assert_eq!((w.creatures.jaw_sum[s], w.creatures.n_jaws[s]), (0.5, 1));
            assert_eq!(tp_set_part(a, 3, genome::KINDS + 1, 0.5), 0);
            assert_eq!(tp_set_part(a, 999, genome::KIND_JAW, 0.5), 0);
            assert_eq!(tp_place(a, 3, 100.0, -5.0, 0.0), 1);
            let c = &(*a).creatures;
            assert_eq!((c.x[s], c.y[s], c.heading[s]), (100.0, 0.0, 0.0));
            assert_eq!(tp_place(a, 999, 1.0, 1.0, 0.0), 0);
            tp_free(a);
        }
    }

    #[test]
    fn a_world_survives_save_and_load_through_the_abi() {
        unsafe {
            let a = tp_new(1, 1536.0, 1024.0);
            tp_param_set(a, id::REPEL as u32, 0.5);
            tp_seed_founders(a, 300, 0);
            assert_eq!(tp_possess(a, 7), 1);
            tp_input(a, 1, 1.0, -1.0, 1, 0xFF);
            tp_tick(a, 50);
            assert_eq!((tp_tick_count(a), tp_stat(a, 0)), (50, 300.0));
            assert_eq!((tp_world_w(a), tp_world_h(a)), (1536.0, 1024.0));
            let len = tp_save(a);
            let copy = tp_alloc(len);
            ptr::copy_nonoverlapping(tp_save_ptr(a), copy, len as usize);
            let b = tp_load(copy, len);
            tp_dealloc(copy, len);
            assert!(!b.is_null());
            assert_eq!(tp_hash(b), tp_hash(a));
            assert_eq!(
                (tp_possessed(b), tp_param_get(b, id::REPEL as u32)),
                (7, 0.5)
            );
            assert!((*b).control.accept);
            assert_eq!((*b).control.abilities, 7);
            tp_free(a);
            tp_free(b);
        }
    }

    #[test]
    fn a_bad_world_size_gives_null_and_a_message() {
        for (w, h) in [
            (0.0, 1024.0),
            (f32::from_bits(1), 1024.0),
            (1536.0, 0.5),
            (1536.0, -1.0),
            (f32::NAN, 1024.0),
            (1536.0, f32::INFINITY),
            (world::MAX_WORLD_SIZE * 2.0, 1024.0),
        ] {
            assert!(tp_new(1, w, h).is_null(), "{w} by {h}");
            assert!(error().starts_with("world size"), "{}", error());
        }
        assert_eq!(tp_error_len() as usize, error().len());
    }

    #[test]
    fn a_bad_snapshot_gives_null_and_the_reason() {
        unsafe {
            assert!(tp_load(ptr::null(), 0).is_null());
            assert_eq!(error(), "snapshot pointer is null");
            assert!(tp_load(tp_alloc(0), 0).is_null());
            assert_eq!(error(), "snapshot rejected: TooShort");
        }
    }

    #[test]
    fn a_null_world_is_a_no_op() {
        let null = ptr::null_mut();
        unsafe {
            tp_free(null);
            tp_seed_founders(null, 5, 5);
            tp_tick(null, 5);
            assert_eq!((tp_tick_count(null), tp_hash(null)), (0, 0));
            assert_eq!(tp_stat(null, 0), 0.0);
            assert_eq!((tp_world_w(null), tp_world_h(null)), (0.0, 0.0));
            assert_eq!(tp_frame_write(null, 0.0, 0.0, 1.0, 1.0), 0);
            assert!(tp_frame_ptr(null).is_null());
            assert_eq!(tp_save(null), 0);
            assert!(tp_save_ptr(null).is_null());
            tp_dealloc(ptr::null_mut(), 8);
            tp_param_set(null, 0, 1.0);
            assert_eq!(tp_param_get(null, 0), 0.0);
            tp_release(null);
            tp_input(null, 1, 1.0, 1.0, 1, 1);
            assert_eq!((tp_killer(null), tp_killer_brain_len(null)), (0, 0));
            assert!(tp_killer_brain_ptr(null).is_null());
            assert_eq!(tp_killer_body_len(null), 0);
            assert!(tp_killer_body_ptr(null).is_null());
            assert_eq!(tp_brain_write(null, 1), 0);
            assert!(tp_brain_ptr(null).is_null());
            assert_eq!((tp_pick(null, 0.0, 0.0, 9.0), tp_possess(null, 1)), (0, 0));
            assert_eq!((tp_possessed(null), tp_death_cause(null)), (0, 0));
            assert_eq!(tp_heirs_write(null), 0);
            assert!(tp_heirs_ptr(null).is_null());
        }
    }

    #[test]
    fn the_parameter_table_reads_through_the_abi_and_a_bad_index_reads_as_nothing() {
        let i = id::DRAG_FWD as u32;
        let name = unsafe {
            std::slice::from_raw_parts(tp_param_name_ptr(i), tp_param_name_len(i) as usize)
        };
        assert_eq!(name, b"drag_fwd");
        assert_eq!(
            (tp_param_default(i), tp_param_min(i), tp_param_max(i)),
            (0.08, 0.01, 0.5)
        );
        for bad in [tp_param_count(), u32::MAX] {
            assert!(tp_param_name_ptr(bad).is_null());
            assert_eq!(tp_param_name_len(bad), 0);
            assert_eq!(
                (tp_param_default(bad), tp_param_min(bad), tp_param_max(bad)),
                (0.0, 0.0, 0.0)
            );
            unsafe {
                let w = tp_new(1, 64.0, 64.0);
                let before = tp_hash(w);
                tp_param_set(w, bad, 1.0);
                assert_eq!((tp_param_get(w, bad), tp_hash(w)), (0.0, before));
                tp_free(w);
            }
        }
    }

    #[test]
    fn a_brain_reads_through_the_abi() {
        unsafe {
            let w = tp_new(1, 1536.0, 1024.0);
            tp_seed_founders(w, 20, 0);
            // A founder: 25 neurons and 65 connections.
            let words =
                tp_brain_header_words() + 25 * tp_brain_neuron_words() + 65 * tp_brain_conn_words();
            assert_eq!(tp_brain_write(w, 9), words);
            let header = std::slice::from_raw_parts(tp_brain_ptr(w), 6);
            assert_eq!(header, [9, 17, 4, 4, 65, 0]);
            assert_eq!(tp_brain_write(w, 999), 0);
            tp_free(w);
        }
    }

    #[test]
    fn a_death_and_its_heirs_read_through_the_abi() {
        unsafe {
            let w = tp_new(1, 1536.0, 1024.0);
            tp_seed_founders(w, 20, 0);
            let c = &(*w).creatures;
            let (first, second) = (tp_pick(w, c.x[3], c.y[3], 1.0), 9);
            assert_eq!((first, tp_possess(w, first)), (4, 1));
            assert_eq!((tp_possess(w, second), tp_possess(w, 999)), (1, 0));
            assert_eq!((tp_possessed(w), tp_death_cause(w)), (second, 0));
            (&mut *w).kill(8, crate::control::CAUSE_STARVED, None);
            assert_eq!((tp_possessed(w), tp_death_cause(w)), (0, 1));
            assert_eq!((tp_killer(w), tp_killer_brain_len(w)), (0, 0));
            assert_eq!((tp_heir_stride(), tp_heirs_write(w)), (7, 1));
            let heir = std::slice::from_raw_parts(tp_heirs_ptr(w), 7);
            assert_eq!((heir[0], heir[1]), (first, 3));
            assert_eq!(tp_stat(w, crate::stats::STAT_LINEAGE_ALIVE), 1.0);
            tp_free(w);
        }
    }

    #[test]
    fn a_killer_and_its_brain_at_the_kill_read_through_the_abi() {
        unsafe {
            let w = tp_new(1, 1536.0, 1024.0);
            tp_seed_founders(w, 20, 0);
            assert_eq!(tp_possess(w, 4), 1);
            // Slot 3 holds uid 4, and slot 8 holds uid 9.
            (&mut *w).kill(3, crate::control::CAUSE_EATEN, Some(8));
            assert_eq!((tp_death_cause(w), tp_killer(w)), (3, 9));
            let words =
                tp_brain_header_words() + 25 * tp_brain_neuron_words() + 65 * tp_brain_conn_words();
            assert_eq!(tp_killer_brain_len(w), words);
            let header = std::slice::from_raw_parts(tp_killer_brain_ptr(w), 6);
            assert_eq!(header, [9, 17, 4, 4, 65, 0]);
            assert_eq!(tp_killer_body_len(w), crate::control::KILLER_BODY_WORDS);
            let body = std::slice::from_raw_parts(tp_killer_body_ptr(w), 2);
            let c = &(*w).creatures;
            assert_eq!(body, [c.generation[8], c.x[8].to_bits()]);
            assert_eq!(tp_possess(w, 9), 1);
            assert_eq!((tp_killer(w), tp_killer_brain_len(w)), (0, 0));
            assert_eq!(tp_killer_body_len(w), 0);
            tp_free(w);
        }
    }
}
