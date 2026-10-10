//! Every export of the WebAssembly module. No simulation rules live here.
//!
//! Safety, for every export that takes a pointer: a `World` pointer is null or came from `tp_new`
//! or `tp_load` and has not been passed to `tp_free`. A null world is a no-op that returns 0 or
//! null. A byte pointer is null or came from `tp_alloc` with the same `len`.
#![allow(clippy::missing_safety_doc)]

use std::alloc::{alloc, dealloc, Layout};
use std::cell::RefCell;
use std::ptr::{self, NonNull};

use crate::frame;
use crate::world::{self, World};

pub const ABI_VERSION: u32 = 1;

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

#[no_mangle]
pub unsafe extern "C" fn tp_spawn_drifters(world: *mut World, n: u32) {
    if let Some(w) = world.as_mut() {
        w.spawn_drifters(n);
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

/// 0 creatures alive, 1 plants alive. -1 for any other `k`.
#[no_mangle]
pub unsafe extern "C" fn tp_stat(world: *const World, k: u32) -> f64 {
    match (world.as_ref(), k) {
        (Some(w), 0) => w.creatures.slots.count() as f64,
        (Some(_), 1) => 0.0,
        (Some(_), _) => -1.0,
        (None, _) => 0.0,
    }
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

    fn error() -> String {
        ERROR.with_borrow(String::clone)
    }

    #[test]
    fn a_world_survives_save_and_load_through_the_abi() {
        unsafe {
            let a = tp_new(1, 1536.0, 1024.0);
            tp_spawn_drifters(a, 300);
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
            tp_spawn_drifters(null, 5);
            tp_tick(null, 5);
            assert_eq!((tp_tick_count(null), tp_hash(null)), (0, 0));
            assert_eq!(tp_stat(null, 0), 0.0);
            assert_eq!((tp_world_w(null), tp_world_h(null)), (0.0, 0.0));
            assert_eq!(tp_frame_write(null, 0.0, 0.0, 1.0, 1.0), 0);
            assert!(tp_frame_ptr(null).is_null());
            assert_eq!(tp_save(null), 0);
            assert!(tp_save_ptr(null).is_null());
            tp_dealloc(ptr::null_mut(), 8);
        }
    }
}
