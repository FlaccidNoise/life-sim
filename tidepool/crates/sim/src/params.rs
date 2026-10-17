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

// Name, default, minimum, maximum. `intake_rate` is tuned against the health gate
// (`docs/findings/m1-tuning.md`). `plant_growth`, `plant_cap`, `part_mass`, and `birth_growth` are
// tuned against both gates (`docs/findings/m2-tuning.md`). `neuron_upkeep` and `conn_upkeep` are
// the Start values of the M3 plan, which are arithmetic: the M1 values. The rows from `part_mass`
// on are for the M2 rules (`docs/plans/2026-10-11-m2-bodies.md`). The rows from `fixed_upkeep` on
// are for the M3 rules (`docs/plans/2026-10-13-m3-minds.md`). Task 10 of that plan moved three of
// them from their Start values, against the gates (`docs/findings/m3-tuning.md`):
// `mut_conn_remove` from 0.05, `mix_rate` from 0 (mixing on), and `fixed_upkeep` from 0.0337, which
// let a founder pay the 0.0375 of the M2 founder's brain. The other defaults are arithmetic, not
// measurement.
//
// The rows from `bite_rate` on are for the M4 rules (`docs/plans/2026-10-14-m4-teeth.md`). Each
// holds its Off value, at which its rule does nothing, until Task 12 of that plan switches it on.
table! {
    /// The founder's `old` gene: ticks until death by old age. The minimum is the bottom of
    /// `OLD_RANGE`.
    LIFESPAN "lifespan" 4800.0 1200.0 24000.0;
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
    PLANT_CAP "plant_cap" 55.0 1.0 200.0;
    /// Logistic growth rate per tick.
    PLANT_GROWTH "plant_growth" 0.03 0.0 0.1;
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
    /// A plant below this reserve is removed. No bite takes a plant under it.
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
    /// Upkeep per hidden neuron per tick.
    NEURON_UPKEEP "neuron_upkeep" 0.0002 0.0 0.01;
    /// Upkeep per expressed connection per tick.
    CONN_UPKEEP "conn_upkeep" 0.00005 0.0 0.01;
    /// Cost of thrust.
    MOVE_COST "move_cost" 0.006 0.0 1.0;
    /// Energy per tick per unit filter per unit of mouth. The mouth follows the area:
    /// `area / REF_WIDTH`, which is the length for the reference body.
    INTAKE_RATE "intake_rate" 0.08 0.0 1.0;
    /// Largest share of a plant's reserve taken per tick.
    BITE_FRACTION "bite_fraction" 0.05 0.001 1.0;
    /// `energy01` above which a juvenile grows.
    GROW_RESERVE "grow_reserve" 0.35 0.0 1.0;
    /// Growth per tick.
    GROW_RATE "grow_rate" 0.0015 0.0 0.1;
    /// Energy per unit of mass built.
    BUILD_COST "build_cost" 0.5 0.0 5.0;
    /// The founder's `egg` gene: growth at birth. The maximum is the top of `EGG_RANGE`.
    BIRTH_GROWTH "birth_growth" 0.7 0.1 0.7;
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
    /// Mass of a part per unit size, as a share of body area.
    PART_MASS "part_mass" 1.0 0.0 1.0;
    /// Weight of an eye's size in the part sum.
    EYE_COST "eye_cost" 1.0 0.0 10.0;
    /// Turning per unit fin at `v_max`.
    FIN_TORQUE "fin_torque" 1.3 0.0 5.0;
    /// Side drag added per unit fin.
    FIN_GRIP "fin_grip" 0.6 0.0 0.6;
    /// Upkeep added for a life longer than `lifespan`.
    OLD_COST "old_cost" 0.2 0.0 1.0;
    /// Most children in one bud.
    BROOD_MAX "brood_max" 4.0 1.0 8.0;
    /// Share of its capacity that a parent keeps after a bud, so that a bud cannot starve it.
    PARENT_RESERVE "parent_reserve" 0.25 0.0 0.9;
    /// Share of the growth reserve that a growth step must leave, so that a step of growth cannot
    /// starve the juvenile that takes it.
    GROW_FLOOR "grow_floor" 0.5 0.0 1.0;
    /// How far a founder's body gene sits from its default, as a share of the gene's range.
    FOUNDER_SIGMA "founder_sigma" 0.05 0.0 0.3;
    /// Founder brain: constant to thrust. At 0.9 a founder with no scent swims at 0.73 of its full
    /// thrust.
    STARTER_CRUISE "starter_cruise" 0.9 -3.0 3.0;
    /// Founder brain: side gradient to turn. At 2 a gradient half off to one side gives a turn
    /// command of 0.78.
    STARTER_STEER "starter_steer" 2.0 -8.0 8.0;
    /// Founder brain: forward gradient to thrust. Faster up the gradient, slower down it.
    STARTER_SURGE "starter_surge" 0.5 -8.0 8.0;
    /// Founder brain: seen plant to turn. Only a founder with an eye has the wire.
    STARTER_LOOK "starter_look" 1.5 -8.0 8.0;
    /// Size of the founder's eye gene. 0: no eye gene.
    FOUNDER_EYE "founder_eye" 0.2 0.0 1.0;
    /// Cone range in body lengths per unit eye size.
    EYE_RANGE "eye_range" 16.0 0.0 64.0;
    /// Scale of the eye inputs.
    EYE_GAIN "eye_gain" 1.0 0.0 10.0;
    /// Eyes scan on every Nth think.
    SEE_EVERY "see_every" 2.0 1.0 4.0;
    /// Chance that an anchor or an eye's `extra` mutates.
    MUT_SHAPE_RATE "mut_shape_rate" 0.15 0.0 1.0;
    /// Chance that `egg` or `old` mutates.
    MUT_LIFE_RATE "mut_life_rate" 0.15 0.0 1.0;
    /// Chance per birth of a new part.
    MUT_PART_ADD "mut_part_add" 0.02 0.0 1.0;
    /// Chance per birth that a part is lost.
    MUT_PART_REMOVE "mut_part_remove" 0.02 0.0 1.0;
    /// Chance per birth that a part is copied.
    MUT_PART_DUP "mut_part_dup" 0.02 0.0 1.0;
    /// Size of a part that a mutation adds.
    PART_NEW_SIZE "part_new_size" 0.1 0.01 1.0;
    /// Upkeep of a body per tick, whatever its size.
    FIXED_UPKEEP "fixed_upkeep" 0.037 0.0 0.2;
    /// Chance per birth of a new connection.
    MUT_CONN_ADD "mut_conn_add" 0.05 0.0 1.0;
    /// Chance per birth that a connection is lost.
    MUT_CONN_REMOVE "mut_conn_remove" 0.01 0.0 1.0;
    /// Chance per birth that a connection is split by a new hidden neuron.
    MUT_NEURON_ADD "mut_neuron_add" 0.02 0.0 1.0;
    /// Chance per birth that a hidden neuron is lost.
    MUT_NEURON_REMOVE "mut_neuron_remove" 0.02 0.0 1.0;
    /// Size of the weight of a new connection, and of the random weights of a founder brain. Small,
    /// so the wired weights of a founder lead. Not zero: the draft showed that evolution never
    /// recruits a connection that starts at zero.
    NEW_CONN_SIGMA "new_conn_sigma" 0.1 0.0 2.0;
    /// Connections that a part with new ports arrives with.
    PART_WIRES "part_wires" 2.0 0.0 8.0;
    /// Scale of what a hidden neuron sends. At 0 a hidden neuron still costs and still mutates, and
    /// nothing reads it: the control arm of the brain gap.
    HIDDEN_GAIN "hidden_gain" 1.0 0.0 1.0;
    /// Founder brain: constant to `accept`.
    STARTER_ACCEPT "starter_accept" 1.0 -3.0 3.0;
    /// Chance per tick that a pair in touch that both accept exchange genes.
    MIX_RATE "mix_rate" 1.0 0.0 1.0;
    /// Chance that a gene both hold comes from the donor.
    MIX_SWAP "mix_swap" 0.5 0.0 1.0;
    /// Chance that a gene only the donor holds is taken.
    MIX_FOREIGN "mix_foreign" 0.25 0.0 1.0;
    /// Energy per tick per unit jaw per unit of mouth (`area / REF_WIDTH`).
    BITE_RATE "bite_rate" 0.5 0.0 5.0;
    /// Half angle of a jaw cone, radians.
    JAW_ARC "jaw_arc" 0.6 0.1 1.5;
    /// A body bites only a body this many times lighter. 0: any body.
    BITE_MASS_RATIO "bite_mass_ratio" 1.15 0.0 3.0;
    /// Half angle that a spike guards.
    SPIKE_ARC "spike_arc" 0.8 0.1 1.5;
    /// Energy lost by a biter per unit of bite per unit of spike.
    SPIKE_HURT "spike_hurt" 1.0 0.0 4.0;
    /// Half angle that a shell plate guards.
    SHELL_ARC "shell_arc" 0.8 0.1 1.5;
    /// Share of a bite blocked per unit of shell, held at 1.
    SHELL_BLOCK "shell_block" 1.0 0.0 4.0;
    /// Forward drag per unit of shell.
    SHELL_DRAG "shell_drag" 0.05 0.0 0.5;
    /// Share of a dead body's energy and built mass left as debris.
    CORPSE_SHARE "corpse_share" 0.5 0.0 1.0;
    /// Share of a piece's energy lost each tick.
    DEBRIS_DECAY "debris_decay" 0.0005 0.0 0.1;
    /// A piece under this is removed.
    DEBRIS_MIN "debris_min" 0.1 0.0 5.0;
    /// Ticks between two uses of one ability.
    ABILITY_COOLDOWN "ability_cooldown" 100.0 1.0 2000.0;
    /// Speed gained per unit of rear flagellum, over heft.
    DASH_IMPULSE "dash_impulse" 2.0 0.0 8.0;
    /// Spin gained per unit of turn command per unit of rear flagellum, over heft.
    DASH_SPIN "dash_spin" 0.3 0.0 2.0;
    /// Energy per unit of mouth for one dash.
    DASH_COST "dash_cost" 0.5 0.0 5.0;
    /// Bite multiplier of a body with a jaw during its dash: a strike.
    STRIKE_BITE "strike_bite" 2.0 1.0 4.0;
    /// Ticks that a strike's bite lasts.
    STRIKE_TICKS "strike_ticks" 10.0 1.0 100.0;
    /// Energy per tick per unit of gland, from each body in the cloud.
    TOXIN_DRAIN "toxin_drain" 0.3 0.0 4.0;
    /// Cloud radius in the maker's lengths.
    TOXIN_RADIUS "toxin_radius" 2.0 0.5 8.0;
    /// Ticks a cloud lasts.
    TOXIN_TICKS "toxin_ticks" 60.0 1.0 600.0;
    /// Energy per unit of mouth for one cloud.
    TOXIN_COST "toxin_cost" 2.0 0.0 10.0;
    /// Scale of the hurt input: a loss of a tenth of capacity reads 1.
    HURT_GAIN "hurt_gain" 10.0 0.0 100.0;
    /// Share of founders with a Jaw.
    FOUNDER_JAW "founder_jaw" 0.2 0.0 1.0;
    /// Size of a founder's Jaw.
    FOUNDER_JAW_SIZE "founder_jaw_size" 0.5 0.0 1.0;
    /// Hunter founder brain: seen body to turn.
    STARTER_CHASE "starter_chase" 1.5 -8.0 8.0;
    /// Hunter founder brain: seen body to dash, a strike with its jaw.
    STARTER_STRIKE "starter_strike" 2.0 -8.0 8.0;
    /// Founder brain: seen teeth and a hit to dash, seen teeth to turn away.
    STARTER_FLEE "starter_flee" 2.0 -8.0 8.0;
    /// Founder brain: bias of each trigger output.
    STARTER_TRIGGER_BIAS "starter_trigger_bias" -1.0 -3.0 3.0;
    /// The generalist penalty of rule D1: a Filter takes `(1 - diet)^diet_k` and a bite
    /// `diet^diet_k`. In steps of `DIET_K_STEP`. 0: both factors are 1, the M4 world.
    DIET_K "diet_k" 1.5 0.0 4.0;
    /// Diet drift per birth.
    DIET_SIGMA "diet_sigma" 0.15 0.0 0.5;
    /// The `diet` gene of a founder with no Jaw.
    FOUNDER_DIET "founder_diet" 0.0 0.0 1.0;
    /// The `diet` gene of a hunter founder. At 0.6 and `diet_k` 1.5 its Filter takes 25%.
    FOUNDER_HUNTER_DIET "founder_hunter_diet" 0.6 0.0 1.0;
    /// Rule D2 of the diet retune, a food chain: a body bites only a body whose `diet` is at least
    /// this much under its own. −1: any body, the M4 world.
    BITE_DIET_GAP "bite_diet_gap" 0.2 -1.0 1.0;
    /// Rule G1 of the parts plan, two guts cost upkeep: a body pays this fraction of its own basal
    /// cost, times a bump of its `diet` (see `gut_band`), for keeping two digestive systems. At 0.5
    /// of `diet` the bump is 1. 0: off.
    GUT_UPKEEP "gut_upkeep" 0.3 0.0 2.0;
    /// Rule G1 of the parts plan: a `diet` at most this far from 0 or from 1 pays no gut upkeep. The
    /// bump rises from 0 at the band edge to 1 at `diet` 0.5. Under 0.5 so that the rise has a width.
    GUT_BAND "gut_band" 0.2 0.0 0.45;
}

/// `diet_k` moves in steps of this, so that `math::pow_quarters` gives its power exactly.
pub const DIET_K_STEP: f32 = 0.25;

/// True when `v` is not a value that parameter `i` can hold: only `diet_k` has a step.
pub fn off_step(i: usize, v: f32) -> bool {
    i == id::DIET_K && (v / DIET_K_STEP).fract() != 0.0
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

    /// Clamps to `[min, max]`, and moves `diet_k` to its nearest step. NaN is ignored.
    pub fn set(&mut self, i: usize, v: f32) {
        if !v.is_nan() {
            let v = if i == id::DIET_K {
                (v / DIET_K_STEP).round() * DIET_K_STEP
            } else {
                v
            };
            self.v[i] = v.clamp(DEFS[i].min, DEFS[i].max);
        }
    }

    pub fn index_of(name: &str) -> Option<usize> {
        DEFS.iter().position(|d| d.name == name)
    }

    pub fn save(&self, w: &mut Writer) {
        w.f32s(&self.v);
    }

    /// `Invalid` when the count differs from the table, a value is outside its range, or `diet_k`
    /// is off its step. A loaded table holds only values that `set` could have stored, so rule code
    /// can trust the ranges.
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
        if v.iter().enumerate().any(|(i, &x)| off_step(i, x)) {
            return Err(LoadError::Invalid(
                "diet_k is not a multiple of 0.25: use 0, 0.25, 0.5, and so on to 4",
            ));
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

    #[test]
    fn diet_k_is_held_to_its_step() {
        let mut p = Params::new();
        p.set(id::DIET_K, 1.4);
        assert_eq!(p.get(id::DIET_K), 1.5);
        p.set(id::DIET_K, 9.0);
        assert_eq!(p.get(id::DIET_K), 4.0);
        assert!(!off_step(id::DIET_K, 1.25) && off_step(id::DIET_K, 1.3));
        assert!(!off_step(id::DIET_SIGMA, 0.05));

        p.v[id::DIET_K] = 1.3;
        let mut w = Writer::new();
        p.save(&mut w);
        assert!(matches!(
            Params::load(&mut Reader::new(&w.bytes)).err(),
            Some(LoadError::Invalid(why)) if why.starts_with("diet_k")
        ));
    }
}
