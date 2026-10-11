use tidepool_sim::control::{CAUSE_NONE, CAUSE_STARVED, HEIR_STRIDE, MAX_HEIRS};
use tidepool_sim::creature::MARK_LINEAGE;
use tidepool_sim::genome::Genome;
use tidepool_sim::world::{SpawnAt, World};

fn world() -> World {
    let mut w = World::new(4, 1536.0, 1024.0);
    w.seed_founders(50, 0);
    w
}

#[test]
fn pick_returns_the_nearest_creature_within_reach() {
    let w = world();
    let (x, y) = (w.creatures.x[7], w.creatures.y[7]);
    assert_eq!(w.pick(x + 0.5, y, 20.0), w.creatures.uid[7]);
    assert_eq!(w.pick(-9000.0, -9000.0, 20.0), 0);
}

#[test]
fn pick_ignores_a_creature_outside_the_reach_and_a_point_that_is_not_a_number() {
    let w = world();
    let (x, y) = (w.creatures.x[7], w.creatures.y[7]);
    assert_eq!(w.pick(x, y, 0.0), w.creatures.uid[7]);
    assert_eq!(w.pick(f32::NAN, y, 20.0), 0);
    assert_eq!(w.pick(x, y, f32::NAN), 0);
}

#[test]
fn possess_marks_the_creature_and_release_keeps_the_mark() {
    let mut w = world();
    let uid = w.creatures.uid[3];
    assert!(w.possess(uid));
    assert_eq!(w.control.possessed, uid);
    assert_eq!(w.creatures.mark[3] & 1, 1);
    w.release();
    assert_eq!(w.control.possessed, 0);
    assert_eq!(w.creatures.mark[3] & 1, 1);
    assert!(!w.possess(999_999));
    assert!(!w.possess(0));
}

#[test]
fn manual_input_replaces_the_commands_and_releasing_hands_back() {
    let mut w = world();
    assert!(w.possess(w.creatures.uid[3]));
    w.input(true, 1.0, -1.0);
    w.tick();
    // control::apply runs after the brain, so motor saw the player's values
    assert_eq!(
        (w.creatures.cmd_thrust[3], w.creatures.cmd_turn[3]),
        (1.0, -1.0)
    );
    w.input(false, 1.0, -1.0);
    w.run(2); // two ticks: from Task 15 a creature thinks on every second tick
    assert_ne!(
        (w.creatures.cmd_thrust[3], w.creatures.cmd_turn[3]),
        (1.0, -1.0)
    );
}

#[test]
fn manual_input_steers_only_the_possessed_creature() {
    let (mut a, mut b) = (world(), world());
    assert!(a.possess(a.creatures.uid[3]));
    a.input(true, 0.0, 1.0);
    a.run(20);
    b.run(20);
    assert_ne!(a.creatures.heading[3], b.creatures.heading[3]);
    // No thrust: the possessed creature holds its place, give or take a push from a neighbour.
    assert_eq!(a.creatures.cmd_thrust[3], 0.0);
    assert_eq!(a.creatures.heading[4], b.creatures.heading[4]);
}

#[test]
fn input_is_clamped() {
    let mut w = world();
    w.input(true, 5.0, -7.0);
    assert_eq!((w.control.thrust, w.control.turn), (1.0, -1.0));
    w.input(true, -5.0, 0.0);
    assert_eq!(w.control.thrust, 0.0);
    w.input(true, f32::NAN, f32::NAN);
    assert_eq!((w.control.thrust, w.control.turn), (0.0, 0.0));
}

#[test]
fn a_new_body_starts_with_its_brain_driving() {
    let mut w = world();
    assert!(w.possess(w.creatures.uid[3]));
    w.input(true, 1.0, 1.0);
    assert!(w.possess(w.creatures.uid[4]));
    assert!(!w.control.manual);
    w.input(true, 1.0, 1.0);
    w.release();
    assert!(!w.control.manual);
}

#[test]
fn killing_the_possessed_creature_records_the_cause() {
    let mut w = world();
    assert!(w.possess(w.creatures.uid[3]));
    w.kill(3, CAUSE_STARVED);
    assert_eq!(w.control.possessed, 0);
    assert_eq!(w.control.death_cause, CAUSE_STARVED);
    // The next body clears the cause.
    assert!(w.possess(w.creatures.uid[4]));
    assert_eq!(w.control.death_cause, CAUSE_NONE);
}

#[test]
fn killing_another_creature_leaves_the_player_in_their_body() {
    let mut w = world();
    let uid = w.creatures.uid[3];
    assert!(w.possess(uid));
    w.kill(4, CAUSE_STARVED);
    assert_eq!(
        (w.control.possessed, w.control.death_cause),
        (uid, CAUSE_NONE)
    );
}

#[test]
fn heirs_are_marked_living_creatures_by_energy() {
    let mut w = world();
    for s in [2usize, 5, 9] {
        assert!(w.possess(w.creatures.uid[s]));
    }
    w.release();
    w.creatures.energy[5] *= 1.5;
    assert_eq!(w.write_heirs(), 3);
    assert_eq!(w.control.heirs.len(), 3 * HEIR_STRIDE);
    assert_eq!(w.control.heirs[1], 5); // slot of the first heir
    w.kill(5, CAUSE_STARVED);
    assert_eq!(w.write_heirs(), 2);
}

#[test]
fn an_heir_record_holds_the_documented_fields_and_there_are_at_most_five() {
    let mut w = world();
    for s in 0..8usize {
        assert!(w.possess(w.creatures.uid[s]));
        w.creatures.energy[s] *= 1.0 + s as f32 * 0.05;
        w.creatures.generation[s] = 10 + s as u32;
    }
    assert_eq!(w.write_heirs() as usize, MAX_HEIRS);
    let h = &w.control.heirs[..HEIR_STRIDE];
    // The fullest is slot 7. uid, slot, x, y, energy01, generation, hue.
    let c = &w.creatures;
    assert_eq!((h[0], h[1], h[5]), (c.uid[7], 7, 17));
    assert_eq!((h[2], h[3]), (c.x[7].to_bits(), c.y[7].to_bits()));
    assert!((f32::from_bits(h[4]) - 0.5 * 1.35).abs() < 1e-5);
    assert_eq!(h[6], c.hue[7].to_bits());
}

/// Spawns a creature with the given parent uid. Returns its uid.
fn spawn_child(w: &mut World, parent: u32) -> u32 {
    let at = SpawnAt {
        x: 500.0,
        y: 500.0,
        heading: 0.0,
        growth: 1.0,
        energy01: 0.5,
        parent,
        generation: 0,
        mark: 0,
    };
    let slot = w.spawn(Genome::default(), at).expect("slot");
    w.creatures.uid[slot as usize]
}

fn marked(w: &World, uid: u32) -> u8 {
    w.creatures.mark[w.slot_of(uid).unwrap() as usize] & MARK_LINEAGE
}

#[test]
fn a_child_born_before_the_possession_is_an_heir() {
    let mut w = World::new(1, 512.0, 512.0);
    let a = spawn_child(&mut w, 0);
    let child = spawn_child(&mut w, a);
    let grandchild = spawn_child(&mut w, child);
    let stranger = spawn_child(&mut w, 0);
    assert!(w.possess(a));
    assert_eq!(
        (
            marked(&w, child),
            marked(&w, grandchild),
            marked(&w, stranger)
        ),
        (1, 1, 0)
    );
    assert_eq!(w.write_heirs(), 3);
}

#[test]
fn a_descendant_behind_a_dead_parent_is_not_marked() {
    let mut w = World::new(1, 512.0, 512.0);
    let a = spawn_child(&mut w, 0);
    let child = spawn_child(&mut w, a);
    let grandchild = spawn_child(&mut w, child);
    w.kill(w.slot_of(child).unwrap(), CAUSE_STARVED);
    assert!(w.possess(a));
    assert_eq!((marked(&w, a), marked(&w, grandchild)), (1, 0));
}

#[test]
fn possessing_a_child_does_not_mark_its_parent_or_its_sibling() {
    let mut w = World::new(1, 512.0, 512.0);
    let parent = spawn_child(&mut w, 0);
    let (child, sibling) = (spawn_child(&mut w, parent), spawn_child(&mut w, parent));
    assert!(w.possess(child));
    assert_eq!(
        (marked(&w, child), marked(&w, parent), marked(&w, sibling)),
        (1, 0, 0)
    );
}

#[test]
fn possess_sets_buds_to_zero() {
    let mut w = world();
    w.control.buds = 4;
    assert!(w.possess(w.creatures.uid[3]));
    assert_eq!(w.control.buds, 0);
}
