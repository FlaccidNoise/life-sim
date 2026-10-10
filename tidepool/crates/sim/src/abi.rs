//! Every export of the WebAssembly module. No simulation rules live here.
//!
//! Safety, for every export that takes a pointer: a `World` pointer is null or came from `tp_new`
//! or `tp_load` and has not been passed to `tp_free`. A null world is a no-op that returns 0 or
//! null. A byte pointer is null or came from `tp_alloc` with the same `len`.
#![allow(clippy::missing_safety_doc)]

use std::alloc::{alloc, dealloc, Layout};
use std::cell::RefCell;
use std::ptr::{self, NonNull};

use crate::control::HEIR_STRIDE;
use crate::frame;
use crate::params::{ParamDef, DEFS};
use crate::world::{self, World};

pub const ABI_VERSION: u32 = 2;

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

/// Clamps to the parameter's range. NaN is ignored.
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

/// `manual` is 0 for the brain and any other value for the player.
#[no_mangle]
pub unsafe extern "C" fn tp_input(world: *mut World, manual: u32, thrust: f32, turn: f32) {
    if let Some(w) = world.as_mut() {
        w.input(manual != 0, thrust, turn);
    }
}

/// A `CAUSE_` constant in `control.rs`. Set when the possessed creature dies. Cleared by the next
/// possess.
#[no_mangle]
pub unsafe extern "C" fn tp_death_cause(world: *const World) -> u32 {
    world.as_ref().map_or(0, |w| w.control.death_cause)
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
    fn a_world_survives_save_and_load_through_the_abi() {
        unsafe {
            let a = tp_new(1, 1536.0, 1024.0);
            tp_param_set(a, id::REPEL as u32, 0.5);
            tp_seed_founders(a, 300, 0);
            assert_eq!(tp_possess(a, 7), 1);
            tp_input(a, 1, 1.0, -1.0);
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
            tp_input(null, 1, 1.0, 1.0);
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
    fn a_death_and_its_heirs_read_through_the_abi() {
        unsafe {
            let w = tp_new(1, 1536.0, 1024.0);
            tp_seed_founders(w, 20, 0);
            let c = &(*w).creatures;
            let (first, second) = (tp_pick(w, c.x[3], c.y[3], 1.0), 9);
            assert_eq!((first, tp_possess(w, first)), (4, 1));
            assert_eq!((tp_possess(w, second), tp_possess(w, 999)), (1, 0));
            assert_eq!((tp_possessed(w), tp_death_cause(w)), (second, 0));
            (&mut *w).kill(8, crate::control::CAUSE_STARVED);
            assert_eq!((tp_possessed(w), tp_death_cause(w)), (0, 1));
            assert_eq!((tp_heir_stride(), tp_heirs_write(w)), (7, 1));
            let heir = std::slice::from_raw_parts(tp_heirs_ptr(w), 7);
            assert_eq!((heir[0], heir[1]), (first, 3));
            assert_eq!(tp_stat(w, crate::stats::STAT_LINEAGE_ALIVE), 1.0);
            tp_free(w);
        }
    }
}
