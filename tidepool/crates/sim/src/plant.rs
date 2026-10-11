//! Rooted plants and the fertility map they grow on.
//!
//! A plant holds a reserve that grows toward a limit set by the fertility of its cell. A full plant
//! throws seeds. The number of plants is bounded by `plant_cell_cap` plants per cell, not by
//! crowding.

use crate::grid::{Grid, CELL};
use crate::math::{sin_cos, PI};
use crate::params::id;
use crate::pool::Slots;
use crate::rng::Rng;
use crate::snapshot::{LoadError, Reader, Writer};
use crate::world::World;

pub const MAX_PLANTS: u32 = 8192;
/// The radius of a plant with no reserve, and what a reserve of `plant_cap` adds to it.
const RADIUS_MIN: f32 = 2.0;
const RADIUS_SPAN: f32 = 6.0;
/// The radius of a plant at a full reserve, the largest that `radius` gives.
pub const MAX_RADIUS: f32 = RADIUS_MIN + RADIUS_SPAN;
/// A plant is updated on one tick in this many, and grows that many ticks at once.
const STAGGER: u32 = 8;
/// A founder plant starts with a reserve between this share of its limit and all of it.
const FOUNDER_RESERVE_MIN: f32 = 0.3;
/// Places drawn, at most, for each founder plant asked for.
const FOUNDER_DRAWS: u32 = 50;

/// Every plant holds `0 <= reserve <= cap` and a finite `cap > 0`. `seed`, `step`, and `load` keep
/// that, so `reserve / cap` is in `[0, 1]`.
pub struct Plants {
    pub slots: Slots,
    pub x: Vec<f32>,
    pub y: Vec<f32>,
    pub reserve: Vec<f32>,
    pub cap: Vec<f32>,
    /// Not saved. Rebuilt when `dirty`.
    pub grid: Grid,
    /// Set by whatever adds, removes, or moves a plant.
    pub dirty: bool,
}

impl Plants {
    /// An empty pool for a world of `w` by `h`.
    pub fn new(w: f32, h: f32) -> Plants {
        let n = MAX_PLANTS as usize;
        Plants {
            slots: Slots::new(MAX_PLANTS),
            x: vec![0.0; n],
            y: vec![0.0; n],
            reserve: vec![0.0; n],
            cap: vec![0.0; n],
            grid: Grid::new(w, h),
            dirty: false,
        }
    }

    /// Rebuilds the plant grid when `dirty`. Call it before any read of the grid.
    pub fn refresh_grid(&mut self) {
        if self.dirty {
            self.grid.rebuild(&self.slots, &self.x, &self.y);
            self.dirty = false;
        }
    }

    /// The plants in each cell, in the cell order of `Fertility`. The caller adds to it as it adds
    /// plants, so the count stays right within one `seed` or `step`.
    fn cell_counts(&mut self) -> Vec<u32> {
        self.refresh_grid();
        let starts = self.grid.cell_start.windows(2);
        starts.map(|p| p[1] - p[0]).collect()
    }

    /// Puts a plant in the lowest free slot. Does nothing when the pool is full.
    fn add(&mut self, x: f32, y: f32, reserve: f32, cap: f32) {
        if let Some(slot) = self.slots.alloc() {
            let s = slot as usize;
            (self.x[s], self.y[s], self.reserve[s], self.cap[s]) = (x, y, reserve, cap);
            self.dirty = true;
        }
    }
}

/// Cells of `grid::CELL` (32) units, values in `[0, 1]`. Saved.
pub struct Fertility {
    pub gw: usize,
    pub gh: usize,
    pub v: Vec<f32>,
}

impl Fertility {
    /// A map of zeros for a world of `w` by `h`. It has the cells of `Grid::new(w, h)`.
    pub fn new(w: f32, h: f32) -> Fertility {
        let gw = (w / CELL).ceil() as usize;
        let gh = (h / CELL).ceil() as usize;
        Fertility {
            gw,
            gh,
            v: vec![0.0; gw * gh],
        }
    }

    /// `blobs` fertile patches, each with a random centre. A cell's value is the sum over the
    /// patches of `1 / (1 + (d / radius)^2)^2`, clamped to 1, where `d` runs from the centre of the
    /// cell to the centre of the patch.
    pub fn generate(rng: &mut Rng, w: f32, h: f32, blobs: u32, radius: f32) -> Fertility {
        let mut f = Fertility::new(w, h);
        let centres: Vec<(f32, f32)> = (0..blobs)
            .map(|_| (rng.range(0.0, w), rng.range(0.0, h)))
            .collect();
        for (c, v) in f.v.iter_mut().enumerate() {
            let x = ((c % f.gw) as f32 + 0.5) * CELL;
            let y = ((c / f.gw) as f32 + 0.5) * CELL;
            let mut sum = 0.0;
            for &(bx, by) in &centres {
                let (dx, dy) = (x - bx, y - by);
                let q = 1.0 + (dx * dx + dy * dy) / (radius * radius);
                sum += 1.0 / (q * q);
            }
            *v = sum.min(1.0);
        }
        f
    }

    /// The cell that holds the point. A point outside the world is in the nearest edge cell.
    fn cell(&self, x: f32, y: f32) -> usize {
        let cx = ((x / CELL) as usize).min(self.gw - 1);
        let cy = ((y / CELL) as usize).min(self.gh - 1);
        cy * self.gw + cx
    }

    /// The value of the cell that holds the point. A point outside the world reads the nearest
    /// edge cell.
    pub fn at(&self, x: f32, y: f32) -> f32 {
        self.v[self.cell(x, y)]
    }
}

/// `2 + 6 * sqrt(reserve / plant_cap)`.
pub fn radius(reserve: f32, plant_cap: f32) -> f32 {
    RADIUS_MIN + RADIUS_SPAN * (reserve / plant_cap).sqrt()
}

/// The cell of the point and its fertility, if a new plant can root there: the fertility is at
/// least `plant_germ_min` and above 0, and the cell holds fewer than `plant_cell_cap` plants.
fn root(world: &World, counts: &[u32], x: f32, y: f32) -> Option<(usize, f32)> {
    let cell = world.fertility.cell(x, y);
    let fertility = world.fertility.v[cell];
    let room = counts[cell] < world.params.get(id::PLANT_CELL_CAP) as u32;
    let fertile = fertility >= world.params.get(id::PLANT_GERM_MIN) && fertility > 0.0;
    (room && fertile).then_some((cell, fertility))
}

/// Founder plants. Called by `World::seed_founders` after the fertility map is made and the
/// creatures are placed. Draws a place, and keeps it with a chance equal to its fertility if a
/// plant can root there. Stops after `n` plants, `FOUNDER_DRAWS * n` places, or a full pool.
pub fn seed(world: &mut World, n: u32) {
    let n = n.min(MAX_PLANTS - world.plants.slots.count());
    let plant_cap = world.params.get(id::PLANT_CAP);
    let mut counts = world.plants.cell_counts();
    let mut placed = 0;
    for _ in 0..n * FOUNDER_DRAWS {
        if placed == n {
            break;
        }
        let rng = &mut world.rng_plants;
        let (x, y, chance) = (rng.range(0.0, world.w), rng.range(0.0, world.h), rng.unit());
        let Some((cell, fertility)) = root(world, &counts, x, y) else {
            continue;
        };
        if chance >= fertility {
            continue;
        }
        let cap = plant_cap * fertility;
        let reserve = world.rng_plants.range(FOUNDER_RESERVE_MIN, 1.0) * cap;
        world.plants.add(x, y, reserve, cap);
        counts[cell] += 1;
        placed += 1;
    }
}

/// Growth, seeding, and death for the plants whose turn it is: `slot % STAGGER == tick % STAGGER`.
pub fn step(world: &mut World) {
    let p = &world.params;
    let plant_cap = p.get(id::PLANT_CAP);
    let growth = STAGGER as f32 * p.get(id::PLANT_GROWTH);
    let (seed_at, seed_chance) = (p.get(id::PLANT_SEED_AT), p.get(id::PLANT_SEED_CHANCE));
    let (seed_range, seed_energy) = (p.get(id::PLANT_SEED_RANGE), p.get(id::PLANT_SEED_ENERGY));
    let death_reserve = p.get(id::PLANT_DEATH_RESERVE);
    let mut counts = world.plants.cell_counts();
    // Applied after the loop, so that a seedling is not updated on the tick that makes it.
    let mut births: Vec<[f32; 4]> = Vec::new();
    let mut deaths: Vec<u32> = Vec::new();

    for slot in (world.tick % STAGGER..world.plants.slots.high_water()).step_by(STAGGER as usize) {
        if !world.plants.slots.is_alive(slot) {
            continue;
        }
        let s = slot as usize;
        let cap = world.plants.cap[s];
        let mut reserve = world.plants.reserve[s];
        reserve = (reserve + growth * reserve * (1.0 - reserve / cap)).min(cap);

        if reserve >= seed_at * cap && world.rng_plants.unit() < seed_chance {
            let rng = &mut world.rng_plants;
            let ((sin, cos), reach) = (sin_cos(rng.range(-PI, PI)), rng.range(0.0, seed_range));
            let (x, y) = (
                world.plants.x[s] + cos * reach,
                world.plants.y[s] + sin * reach,
            );
            let in_world = (0.0..world.w).contains(&x) && (0.0..world.h).contains(&y);
            let slot_free =
                world.plants.slots.count() as usize + births.len() < MAX_PLANTS as usize;
            let rooted = root(world, &counts, x, y).filter(|_| in_world && slot_free);
            if let Some((cell, fertility)) = rooted {
                // A parent gives what it has, and a seedling keeps what its cell can hold.
                let moved = seed_energy.min(reserve);
                let seedling_cap = plant_cap * fertility;
                reserve -= moved;
                births.push([x, y, moved.min(seedling_cap), seedling_cap]);
                counts[cell] += 1;
            }
        }

        world.plants.reserve[s] = reserve;
        if reserve < death_reserve {
            deaths.push(slot);
        }
    }

    for &slot in &deaths {
        world.plants.slots.free(slot);
        world.plants.dirty = true;
    }
    world.stats.plant_deaths = world.stats.plant_deaths.saturating_add(deaths.len() as u64);
    for [x, y, reserve, cap] in births {
        world.plants.add(x, y, reserve, cap);
    }
}

/// The values of `a` at the live slots, in slot order.
fn gather(live: &[u32], a: &[f32]) -> Vec<f32> {
    live.iter().map(|&s| a[s as usize]).collect()
}

/// The live plants, then the fertility map. The plant grid is scratch.
pub fn save(world: &World, w: &mut Writer) {
    let p = &world.plants;
    let live: Vec<u32> = (0..p.slots.high_water())
        .filter(|&s| p.slots.is_alive(s))
        .collect();
    w.u32s(&live);
    for a in [&p.x, &p.y, &p.reserve, &p.cap] {
        w.f32s(&gather(&live, a));
    }
    w.f32s(&world.fertility.v);
}

/// Reads what `save` wrote into the empty pool and the map that `World::load` made. The slot list
/// must be strictly ascending and below `MAX_PLANTS`, every field must have one value per listed
/// slot, every plant must hold `0 <= reserve <= cap` and a finite `cap > 0`, and the map must have
/// one value in `[0, 1]` per cell. Plant positions are not checked.
pub fn load(world: &mut World, r: &mut Reader) -> Result<(), LoadError> {
    let live = r.u32s()?;
    if live.windows(2).any(|p| p[0] >= p[1]) {
        return Err(LoadError::Invalid("plant slots not ascending"));
    }
    if live.last().is_some_and(|&s| s >= MAX_PLANTS) {
        return Err(LoadError::Invalid("plant slot past capacity"));
    }
    let p = &mut world.plants;
    for &s in &live {
        p.slots.mark_alive(s);
    }
    for a in [&mut p.x, &mut p.y, &mut p.reserve, &mut p.cap] {
        let values = r.f32s()?;
        if values.len() != live.len() {
            return Err(LoadError::Invalid("plant field length"));
        }
        for (&s, v) in live.iter().zip(values) {
            a[s as usize] = v;
        }
    }
    // False for NaN in either value.
    let sound = |s: usize| {
        p.cap[s] > 0.0 && p.cap[s] < f32::INFINITY && (0.0..=p.cap[s]).contains(&p.reserve[s])
    };
    if !live.iter().all(|&s| sound(s as usize)) {
        return Err(LoadError::Invalid("plant reserve or cap out of range"));
    }
    // The grid is not saved.
    p.dirty = true;

    let v = r.f32s()?;
    if v.len() != world.fertility.v.len() {
        return Err(LoadError::Invalid("fertility map size"));
    }
    // A plant's `cap` comes from this value, so it must be finite.
    if !v.iter().all(|f| (0.0..=1.0).contains(f)) {
        return Err(LoadError::Invalid("fertility out of range"));
    }
    world.fertility.v = v;
    Ok(())
}
