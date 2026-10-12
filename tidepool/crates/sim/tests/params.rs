use tidepool_sim::genome::{EGG_RANGE, OLD_RANGE};
use tidepool_sim::params::{id, Params, DEFS};

#[test]
fn ids_match_names() {
    assert_eq!(DEFS[id::DRAG_FWD].name, "drag_fwd");
    assert_eq!(DEFS[id::CHEMO_GAIN].name, "chemo_gain");
    assert_eq!(Params::index_of("plant_growth"), Some(id::PLANT_GROWTH));
    assert_eq!(Params::index_of("nope"), None);
}

#[test]
fn defaults_are_inside_their_ranges_and_names_are_unique() {
    let mut names: Vec<&str> = DEFS.iter().map(|d| d.name).collect();
    for d in DEFS {
        assert!(d.min <= d.default && d.default <= d.max, "{}", d.name);
    }
    names.sort_unstable();
    names.dedup();
    assert_eq!(names.len(), DEFS.len());
}

#[test]
fn set_clamps_and_ignores_nan() {
    let mut p = Params::new();
    p.set(id::DRAG_FWD, 99.0);
    assert_eq!(p.get(id::DRAG_FWD), DEFS[id::DRAG_FWD].max);
    p.set(id::DRAG_FWD, f32::NAN);
    assert_eq!(p.get(id::DRAG_FWD), DEFS[id::DRAG_FWD].max);
}

#[test]
fn a_new_table_holds_the_defaults() {
    let p = Params::new();
    assert_eq!(p.v.len(), DEFS.len());
    for (i, d) in DEFS.iter().enumerate() {
        assert_eq!(p.get(i), d.default, "{}", d.name);
    }
}

/// A founder's `egg` gene is `birth_growth` and its `old` gene is `lifespan`. Past these two walls
/// a founder would hold a gene that its first mutation moves into the range in one step.
#[test]
fn birth_growth_stops_at_the_top_of_egg_and_lifespan_starts_at_the_bottom_of_old() {
    assert_eq!(DEFS[id::BIRTH_GROWTH].max, EGG_RANGE.1);
    assert_eq!(DEFS[id::LIFESPAN].min, OLD_RANGE.0);
}
