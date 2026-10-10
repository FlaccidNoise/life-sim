use tidepool_sim::creature::MAX_CREATURES;
use tidepool_sim::snapshot::{seal, LoadError, Writer, FORMAT_VERSION};
use tidepool_sim::world::{World, MAX_WORLD_SIZE};

fn world_at(ticks: u32) -> World {
    let mut w = World::new(9, 1536.0, 1024.0);
    w.spawn_drifters(400);
    w.run(ticks);
    w
}

#[test]
fn load_then_run_equals_unbroken_run() {
    let saved = world_at(500).save();
    let mut resumed = World::load(&saved).expect("load");
    resumed.run(500);
    assert_eq!(resumed.state_hash(), world_at(1000).state_hash());
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
    a.spawn_drifters(10);
    b.spawn_drifters(10);
    assert_eq!(a.state_hash(), b.state_hash());
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

fn raw_payload(
    tick: u32,
    (w, h): (f32, f32),
    next_uid: u32,
    live: &[u32],
    uids: &[u32],
    field: &[f32],
) -> Vec<u8> {
    let mut p = Writer::new();
    p.u32(tick);
    p.f32(w);
    p.f32(h);
    p.u32(next_uid);
    p.u32(0);
    p.u32(0);
    p.u32s(live);
    p.u32s(uids);
    for _ in 0..5 {
        p.f32s(field);
    }
    p.bytes
}

/// A payload with `live` as the slot list and `field` as every creature field.
fn payload(w: f32, h: f32, live: &[u32], field: &[f32]) -> Vec<u8> {
    let n = field.len() as u32;
    let uids: Vec<u32> = (1..=n).collect();
    raw_payload(0, (w, h), 1 + n, live, &uids, field)
}

/// A 64 by 64 world with one creature per uid, in slots 0 and up.
fn uid_payload(tick: u32, next_uid: u32, uids: &[u32]) -> Vec<u8> {
    let live: Vec<u32> = (0..uids.len() as u32).collect();
    let field = vec![1.0; uids.len()];
    raw_payload(tick, (64.0, 64.0), next_uid, &live, uids, &field)
}

fn load_err(payload: &[u8]) -> Option<LoadError> {
    World::load(&seal(payload)).err()
}

#[test]
fn a_crafted_payload_loads() {
    let w = World::load(&seal(&payload(64.0, 64.0, &[0, 5], &[1.0, 2.0]))).expect("load");
    assert_eq!(w.creatures.slots.count(), 2);
    assert_eq!(w.creatures.slots.high_water(), 6);
    assert_eq!(
        (w.creatures.x[5], w.creatures.uid[5], w.next_uid),
        (2.0, 2, 3)
    );
}

#[test]
fn a_bad_slot_list_is_invalid() {
    let at_capacity = payload(64.0, 64.0, &[MAX_CREATURES], &[1.0]);
    assert_eq!(
        load_err(&at_capacity),
        Some(LoadError::Invalid("creature slot past capacity"))
    );
    for live in [[3, 3], [5, 2]] {
        let p = payload(64.0, 64.0, &live, &[1.0, 2.0]);
        assert_eq!(
            load_err(&p),
            Some(LoadError::Invalid("creature slots not ascending"))
        );
    }
}

#[test]
fn a_field_of_the_wrong_length_is_invalid() {
    for field in [&[1.0][..], &[1.0, 2.0, 3.0]] {
        let p = payload(64.0, 64.0, &[0, 1], field);
        assert_eq!(
            load_err(&p),
            Some(LoadError::Invalid("creature field length"))
        );
    }
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
        for (w, h) in [(bad, 64.0), (64.0, bad)] {
            let p = payload(w, h, &[], &[]);
            assert_eq!(
                load_err(&p),
                Some(LoadError::Invalid("world size")),
                "{w} x {h}"
            );
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
            load_err(&uid_payload(0, next_uid, uids)),
            Some(LoadError::Invalid(reason)),
            "next_uid {next_uid}, uids {uids:?}"
        );
    }
}

/// A snapshot can hold a counter at the top of its range. The tick wraps and the uid counter stops.
#[test]
fn counters_at_the_top_of_their_range_do_not_panic_or_wrap_a_uid() {
    let last = u32::MAX - 1;
    let mut w = World::load(&seal(&uid_payload(u32::MAX, last, &[1, 2]))).expect("load");
    w.run(2);
    assert_eq!(w.tick, 1);
    w.spawn_drifters(10);
    assert_eq!((w.creatures.slots.count(), w.next_uid), (3, u32::MAX));
    assert_eq!(w.creatures.uid[2], last);
    World::load(&w.save()).expect("the world still loads");
}

#[test]
fn trailing_bytes_are_invalid() {
    let mut p = payload(64.0, 64.0, &[0], &[1.0]);
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
    let mut p = payload(64.0, 64.0, &[], &[]);
    p.truncate(24);
    p.extend_from_slice(&u32::MAX.to_le_bytes());
    assert_eq!(load_err(&p), Some(LoadError::Truncated));
}

#[test]
fn every_cut_of_a_payload_is_an_error() {
    let p = payload(64.0, 64.0, &[0, 1, 2], &[1.0, 2.0, 3.0]);
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

/// `load` does not check creature values. The tick must survive any of them.
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
    let mut w = World::load(&seal(&payload(64.0, 64.0, &[0, 1, 2, 3, 4, 5], &wild))).expect("load");
    w.run(10);
    w.spawn_drifters(10);
    w.run(10);
}
