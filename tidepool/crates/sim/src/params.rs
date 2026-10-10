//! The parameter table: every tunable number of the simulation. One list makes both the index
//! constants and the table, so the two cannot drift.

use crate::snapshot::{LoadError, Reader, Writer};

pub struct ParamDef {
    pub name: &'static str,
    pub default: f32,
    pub min: f32,
    pub max: f32,
}

macro_rules! table {
    ($($(#[$doc:meta])* $id:ident $name:literal $default:literal $min:literal $max:literal;)*) => {
        #[allow(non_camel_case_types, clippy::upper_case_acronyms)]
        enum Index { $($id),* }

        /// The index of each parameter, in table order.
        pub mod id {
            $($(#[$doc])* pub const $id: usize = super::Index::$id as usize;)*
        }

        pub static DEFS: &[ParamDef] = &[
            $(ParamDef { name: $name, default: $default, min: $min, max: $max }),*
        ];

        #[cfg(test)]
        const IDS: &[&str] = &[$(stringify!($id)),*];
    };
}

// Name, default, minimum, maximum. `plant_growth` and `intake_rate` are tuned against the health
// gate (`docs/findings/m1-tuning.md`). The other defaults are arithmetic, not measurement.
table! {
    /// Ticks until death by old age.
    LIFESPAN "lifespan" 4800.0 600.0 24000.0;
    /// A creature senses and thinks every Nth tick.
    THINK_EVERY "think_every" 2.0 1.0 8.0;
    /// Velocity lost per tick along the heading.
    DRAG_FWD "drag_fwd" 0.08 0.01 0.5;
    /// Velocity lost per tick across the heading.
    DRAG_SIDE "drag_side" 0.30 0.01 0.9;
    /// Angular velocity lost per tick.
    DRAG_ANG "drag_ang" 0.25 0.01 0.9;
    /// Thrust per unit flagellum.
    FLAG_FORCE "flag_force" 1.1 0.0 5.0;
    /// Thrust per unit cilia.
    CILIA_FORCE "cilia_force" 0.3 0.0 5.0;
    /// Turning per unit flagellum, scaled by thrust.
    FLAG_TORQUE "flag_torque" 0.34 0.0 5.0;
    /// Turning per unit cilia. Works at rest.
    CILIA_TORQUE "cilia_torque" 0.58 0.0 5.0;
    /// Moment of inertia factor.
    INERTIA_K "inertia_k" 0.08 0.01 1.0;
    /// Push between overlapping bodies.
    REPEL "repel" 0.2 0.0 1.0;
    /// Hard speed limit, world units per tick.
    V_MAX "v_max" 4.0 1.0 8.0;
    /// Plant reserve limit at fertility 1.
    PLANT_CAP "plant_cap" 20.0 1.0 200.0;
    /// Logistic growth rate per tick.
    PLANT_GROWTH "plant_growth" 0.02 0.0 0.1;
    /// Reserve fraction needed to seed.
    PLANT_SEED_AT "plant_seed_at" 0.7 0.1 1.0;
    /// Chance to seed per plant update.
    PLANT_SEED_CHANCE "plant_seed_chance" 0.02 0.0 1.0;
    /// Seed throw distance.
    PLANT_SEED_RANGE "plant_seed_range" 48.0 8.0 256.0;
    /// Reserve moved to the seedling.
    PLANT_SEED_ENERGY "plant_seed_energy" 2.0 0.1 20.0;
    /// Plants allowed per 32-unit cell.
    PLANT_CELL_CAP "plant_cell_cap" 3.0 1.0 16.0;
    /// Lowest fertility a seed can take.
    PLANT_GERM_MIN "plant_germ_min" 0.15 0.0 1.0;
    /// A plant below this reserve is removed.
    PLANT_DEATH_RESERVE "plant_death_reserve" 0.2 0.0 5.0;
    /// Fertile patches in the world.
    FERT_BLOBS "fert_blobs" 14.0 1.0 64.0;
    /// Patch radius.
    FERT_RADIUS "fert_radius" 100.0 20.0 600.0;
    /// Scent per unit `reserve01` per field step.
    SCENT_DEPOSIT "scent_deposit" 0.05 0.0 1.0;
    /// Diffusion rate.
    SCENT_DIFFUSE "scent_diffuse" 0.2 0.0 0.24;
    /// Scent kept per field step.
    SCENT_DECAY "scent_decay" 0.995 0.8 1.0;
    /// Energy capacity per unit mass.
    ENERGY_PER_MASS "energy_per_mass" 1.0 0.1 10.0;
    /// Upkeep per unit mass per tick.
    BASAL "basal" 0.0005 0.0 0.01;
    /// Upkeep per unit mass per unit part size per tick.
    PART_UPKEEP "part_upkeep" 0.0002 0.0 0.01;
    /// Upkeep per neuron per tick.
    NEURON_UPKEEP "neuron_upkeep" 0.0002 0.0 0.01;
    /// Upkeep per connection per tick.
    CONN_UPKEEP "conn_upkeep" 0.00005 0.0 0.01;
    /// Cost of thrust.
    MOVE_COST "move_cost" 0.006 0.0 1.0;
    /// Energy per tick per unit filter per unit length.
    INTAKE_RATE "intake_rate" 0.08 0.0 1.0;
    /// Largest share of a plant's reserve taken per tick.
    BITE_FRACTION "bite_fraction" 0.05 0.001 1.0;
    /// `energy01` above which a juvenile grows.
    GROW_RESERVE "grow_reserve" 0.35 0.0 1.0;
    /// Growth per tick.
    GROW_RATE "grow_rate" 0.0015 0.0 0.1;
    /// Energy per unit of mass built.
    BUILD_COST "build_cost" 0.5 0.0 5.0;
    /// Growth at birth.
    BIRTH_GROWTH "birth_growth" 0.4 0.1 1.0;
    /// `energy01` needed to bud.
    BUD_AT "bud_at" 0.8 0.2 1.0;
    /// Ticks between buds.
    BUD_COOLDOWN "bud_cooldown" 200.0 0.0 5000.0;
    /// Newborn `energy01`.
    CHILD_ENERGY "child_energy" 0.5 0.05 1.0;
    /// Chance that a body gene mutates.
    MUT_RATE "mut_rate" 0.15 0.0 1.0;
    /// Body gene step, as a fraction of its range.
    MUT_SIGMA "mut_sigma" 0.08 0.0 1.0;
    /// Chance that a brain number mutates.
    MUT_WEIGHT_RATE "mut_weight_rate" 0.1 0.0 1.0;
    /// Brain number step.
    MUT_WEIGHT_SIGMA "mut_weight_sigma" 0.25 0.0 2.0;
    /// Hue drift per birth.
    HUE_SIGMA "hue_sigma" 0.01 0.0 0.5;
    /// Scent gradient gain.
    CHEMO_GAIN "chemo_gain" 4.0 0.0 50.0;
}

#[derive(Clone)]
pub struct Params {
    pub v: Vec<f32>,
}

impl Default for Params {
    fn default() -> Params {
        Params::new()
    }
}

impl Params {
    /// The defaults.
    pub fn new() -> Params {
        Params {
            v: DEFS.iter().map(|d| d.default).collect(),
        }
    }

    pub fn get(&self, i: usize) -> f32 {
        self.v[i]
    }

    /// Clamps to `[min, max]`. NaN is ignored.
    pub fn set(&mut self, i: usize, v: f32) {
        if !v.is_nan() {
            self.v[i] = v.clamp(DEFS[i].min, DEFS[i].max);
        }
    }

    pub fn index_of(name: &str) -> Option<usize> {
        DEFS.iter().position(|d| d.name == name)
    }

    pub fn save(&self, w: &mut Writer) {
        w.f32s(&self.v);
    }

    /// `Invalid` when the count differs from the table or a value is outside its range. A loaded
    /// table holds only values that `set` could have stored, so rule code can trust the ranges.
    pub fn load(r: &mut Reader) -> Result<Params, LoadError> {
        let v = r.f32s()?;
        if v.len() != DEFS.len() {
            return Err(LoadError::Invalid("parameter count"));
        }
        if v.iter()
            .zip(DEFS)
            .any(|(x, d)| !(d.min..=d.max).contains(x))
        {
            return Err(LoadError::Invalid("parameter out of range"));
        }
        Ok(Params { v })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_name_is_its_id_in_lower_case() {
        assert_eq!(IDS.len(), DEFS.len());
        for (id, d) in IDS.iter().zip(DEFS) {
            assert_eq!(id.to_lowercase(), d.name);
        }
    }

    #[test]
    fn a_saved_table_loads_and_a_value_outside_its_range_does_not() {
        let mut p = Params::new();
        p.set(id::REPEL, 0.7);
        let mut w = Writer::new();
        p.save(&mut w);
        let loaded = Params::load(&mut Reader::new(&w.bytes)).expect("load");
        assert_eq!(loaded.v, p.v);

        p.v[id::THINK_EVERY] = 0.0;
        let mut w = Writer::new();
        p.save(&mut w);
        assert_eq!(
            Params::load(&mut Reader::new(&w.bytes)).err(),
            Some(LoadError::Invalid("parameter out of range"))
        );
    }
}
