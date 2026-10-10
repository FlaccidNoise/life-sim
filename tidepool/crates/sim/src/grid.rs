//! Counting-sort spatial hash. Scratch state: rebuilt every tick, never saved.

use crate::pool::Slots;

pub const CELL: f32 = 32.0;

pub struct Grid {
    pub gw: usize,
    pub gh: usize,
    /// `gw * gh + 1` entries. Cell `c` holds `sorted[cell_start[c]..cell_start[c + 1]]`.
    pub cell_start: Vec<u32>,
    /// Slots grouped by cell, ascending slot within a cell.
    pub sorted: Vec<u32>,
    cursor: Vec<u32>,
}

impl Grid {
    /// `w` and `h` should be multiples of `CELL`. Other sizes round the grid up.
    pub fn new(w: f32, h: f32) -> Grid {
        let gw = (w / CELL).ceil() as usize;
        let gh = (h / CELL).ceil() as usize;
        Grid {
            gw,
            gh,
            cell_start: vec![0; gw * gh + 1],
            sorted: Vec::new(),
            cursor: vec![0; gw * gh],
        }
    }

    /// A creature at `x == w` lands in the last column, not one past it.
    fn cell_of(&self, x: f32, y: f32) -> usize {
        let cx = ((x / CELL) as usize).min(self.gw - 1);
        let cy = ((y / CELL) as usize).min(self.gh - 1);
        cy * self.gw + cx
    }

    pub fn rebuild(&mut self, slots: &Slots, x: &[f32], y: &[f32]) {
        let live = |s: u32| slots.is_alive(s);
        self.cell_start.fill(0);
        for s in (0..slots.high_water()).filter(|&s| live(s)) {
            let c = self.cell_of(x[s as usize], y[s as usize]);
            self.cell_start[c + 1] += 1;
        }
        for c in 0..self.gw * self.gh {
            self.cursor[c] = self.cell_start[c];
            self.cell_start[c + 1] += self.cell_start[c];
        }
        self.sorted.clear();
        self.sorted
            .resize(self.cell_start[self.gw * self.gh] as usize, 0);
        for s in (0..slots.high_water()).filter(|&s| live(s)) {
            let c = self.cell_of(x[s as usize], y[s as usize]);
            self.sorted[self.cursor[c] as usize] = s;
            self.cursor[c] += 1;
        }
    }

    /// Calls f(slot) for every entry in the cells that the box [x0,x1] x [y0,y1] touches.
    /// Rows are contiguous in `sorted`, so each row is one run. Order is deterministic.
    pub fn for_each_in_box(&self, x0: f32, y0: f32, x1: f32, y1: f32, mut f: impl FnMut(u32)) {
        // The first test is false for NaN and for a box with its corners swapped.
        if !(x0 <= x1 && y0 <= y1)
            || x1 < 0.0
            || y1 < 0.0
            || x0 > self.gw as f32 * CELL
            || y0 > self.gh as f32 * CELL
        {
            return;
        }
        // A box that starts at `x == w` reads the last column, where `cell_of` puts that creature.
        let cx0 = (((x0 / CELL) as i32).max(0) as usize).min(self.gw - 1);
        let cy0 = (((y0 / CELL) as i32).max(0) as usize).min(self.gh - 1);
        let cx1 = ((x1 / CELL) as usize).min(self.gw - 1);
        let cy1 = ((y1 / CELL) as usize).min(self.gh - 1);
        for cy in cy0..=cy1 {
            let k0 = self.cell_start[cy * self.gw + cx0] as usize;
            let k1 = self.cell_start[cy * self.gw + cx1 + 1] as usize;
            for &s in &self.sorted[k0..k1] {
                f(s);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn box_query_matches_brute_force() {
        let mut w = crate::world::World::new(5, 1536.0, 1024.0);
        w.spawn_drifters(800);
        w.grid
            .rebuild(&w.creatures.slots, &w.creatures.x, &w.creatures.y);
        let (qx, qy, r) = (700.0f32, 500.0f32, 60.0f32);
        let mut got: Vec<u32> = Vec::new();
        w.grid.for_each_in_box(qx - r, qy - r, qx + r, qy + r, |s| {
            let (dx, dy) = (
                w.creatures.x[s as usize] - qx,
                w.creatures.y[s as usize] - qy,
            );
            if dx * dx + dy * dy <= r * r {
                got.push(s);
            }
        });
        got.sort_unstable();
        let want: Vec<u32> = (0..800u32)
            .filter(|&s| {
                let (dx, dy) = (
                    w.creatures.x[s as usize] - qx,
                    w.creatures.y[s as usize] - qy,
                );
                dx * dx + dy * dy <= r * r
            })
            .collect();
        assert!(!want.is_empty());
        assert_eq!(got, want);
    }

    #[test]
    fn box_query_clamps_at_world_edges() {
        let mut w = crate::world::World::new(5, 1536.0, 1024.0);
        w.spawn_drifters(200);
        w.grid
            .rebuild(&w.creatures.slots, &w.creatures.x, &w.creatures.y);
        let mut n = 0;
        w.grid
            .for_each_in_box(-500.0, -500.0, 5000.0, 5000.0, |_| n += 1);
        assert_eq!(n, 200);
    }

    #[test]
    fn box_query_on_the_far_edge_finds_a_creature_on_that_edge() {
        let mut slots = crate::pool::Slots::new(2);
        slots.alloc();
        slots.alloc();
        let (x, y) = ([1536.0, 700.0], [500.0, 1024.0]);
        let mut grid = super::Grid::new(1536.0, 1024.0);
        grid.rebuild(&slots, &x, &y);
        let mut got: Vec<u32> = Vec::new();
        grid.for_each_in_box(1536.0, 484.0, 1552.0, 516.0, |s| got.push(s));
        grid.for_each_in_box(684.0, 1024.0, 716.0, 1040.0, |s| got.push(s));
        assert_eq!(got, [0, 1]);
    }

    #[test]
    fn box_query_with_swapped_or_nan_corners_is_empty() {
        let mut w = crate::world::World::new(5, 1536.0, 1024.0);
        w.spawn_drifters(800);
        w.grid
            .rebuild(&w.creatures.slots, &w.creatures.x, &w.creatures.y);
        let mut n = 0;
        w.grid
            .for_each_in_box(900.0, 0.0, 100.0, 1024.0, |_| n += 1);
        w.grid
            .for_each_in_box(0.0, 0.0, f32::NAN, 1024.0, |_| n += 1);
        assert_eq!(n, 0);
    }
}
