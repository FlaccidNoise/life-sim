//! Eyes. A body sees plants and bodies inside the cones of its eye parts.
//!
//! `Creatures::express` makes the cones from the genome, `see` scans them for the brain, and
//! `frame::write` sends those of the possessed body to the page.

use crate::brain::{IN_SEE_BODY_L, IN_SEE_BODY_R, IN_SEE_FOOD_L, IN_SEE_FOOD_R};
use crate::creature::MAX_EYES;
use crate::grid::Grid;
use crate::params::id;
use crate::world::World;

/// No cone is longer than this, in world units. It bounds the scan.
pub const EYE_REACH: f32 = 64.0;
/// The half angle of a cone in radians is `EYE_HALF_MIN + EYE_HALF_SPAN * extra`.
pub const EYE_HALF_MIN: f32 = 0.2;
pub const EYE_HALF_SPAN: f32 = 1.0;
/// Added to each side of the box that `see` searches. `math::sin_cos` is good to 1e-4, so a cone
/// of `EYE_REACH` can pass the box of its exact shape by a tenth of a unit.
const BOX_MARGIN: f32 = 0.25;

/// Writes the four eye inputs of the body in `slot`. For the plants and for the bodies, each side
/// gets the nearness of the nearest one in a cone of that side: 1 at the eye, 0 at the range of the
/// cone and with nothing in it. A cone at a positive angle from the heading is on the right, and an
/// eye on the midline feeds both sides.
///
/// Reads the creature grid and the plant grid, so the caller has brought both up to date. Saves
/// nothing: the inputs are brain activations.
pub fn see(world: &mut World, slot: usize) {
    let World {
        creatures: c,
        plants,
        grid,
        brains,
        params,
        ..
    } = world;
    let (eye_range, gain) = (params.get(id::EYE_RANGE), params.get(id::EYE_GAIN));
    let (px, py, hc, hs) = (c.x[slot], c.y[slot], c.hc[slot], c.hs[slot]);
    let n = (c.n_eyes[slot] as usize).min(MAX_EYES);
    // Of each cone: its axis and the squared cosine of its half angle, its squared range, and the
    // sine of its angle from the heading. `express` holds the axis for a heading of 0, so no sine
    // or cosine is worked out here: `math::sin_cos` for each cone took a quarter of the scan in
    // WASM.
    let mut cones = [[0.0f32; 3]; MAX_EYES];
    let mut far2 = [0.0f32; MAX_EYES];
    let mut side = [0.0f32; MAX_EYES];
    // The box of every cone, from the body. The eye is at the body's centre, so the box holds it.
    let (mut x0, mut y0, mut x1, mut y1) = (0.0f32, 0.0f32, 0.0f32, 0.0f32);
    for k in 0..n {
        let eye = slot * MAX_EYES + k;
        let (sin_dir, cos_dir) = (c.eye_ay[eye], c.eye_ax[eye]);
        let (ax, ay) = (hc * cos_dir - hs * sin_dir, hs * cos_dir + hc * sin_dir);
        let cos = c.eye_cos[eye];
        let range = c.cone_range(slot, k, eye_range);
        cones[k] = [ax, ay, cos * cos];
        far2[k] = range * range;
        side[k] = sin_dir;
        // A cone goes farthest along a line where that line is inside it, and at one of its two
        // edges where it is not. The half angle is under a quarter turn, so its sine is above 0.
        let sin = (1.0 - cos * cos).sqrt();
        let (e1x, e1y) = (ax * cos - ay * sin, ay * cos + ax * sin);
        let (e2x, e2y) = (ax * cos + ay * sin, ay * cos - ax * sin);
        let far = |axis: f32, e1: f32, e2: f32| range * if axis >= cos { 1.0 } else { e1.max(e2) };
        x1 = x1.max(far(ax, e1x, e2x));
        y1 = y1.max(far(ay, e1y, e2y));
        x0 = x0.min(-far(-ax, -e1x, -e2x));
        y0 = y0.min(-far(-ay, -e1y, -e2y));
    }
    let (x0, y0) = (px + x0 - BOX_MARGIN, py + y0 - BOX_MARGIN);
    let (x1, y1) = (px + x1 + BOX_MARGIN, py + y1 + BOX_MARGIN);

    // For each cone, lowers `best` to the squared distance of the nearest point in the cone. A
    // point is in a cone when it is inside the range and `along / distance >= cos`. Both sides of
    // that are squared, so there is no square root here. A point at the eye itself is in no cone,
    // so a body does not see itself. The test has no branch: with one, the scan took 1.5 times as
    // long in WASM.
    let nearest = |grid: &Grid, x: &[f32], y: &[f32], best: &mut [f32; MAX_EYES]| {
        grid.for_each_in_box(x0, y0, x1, y1, |j| {
            let j = j as usize;
            let (dx, dy) = (x[j] - px, y[j] - py);
            let d2 = dx * dx + dy * dy;
            for (&[ax, ay, cos2], best) in cones[..n].iter().zip(best.iter_mut()) {
                let along = dx * ax + dy * ay;
                let inside = (d2 < *best) & (along > 0.0) & (along * along >= cos2 * d2);
                *best = if inside { d2 } else { *best };
            }
        });
    };
    let (mut food, mut body) = (far2, far2);
    nearest(&plants.grid, &plants.x, &plants.y, &mut food);
    nearest(grid, &c.x, &c.y, &mut body);

    let (mut food_l, mut food_r, mut body_l, mut body_r) = (0.0f32, 0.0f32, 0.0f32, 0.0f32);
    for k in 0..n {
        let near = |d2: f32| {
            if d2 < far2[k] {
                1.0 - (d2 / far2[k]).sqrt()
            } else {
                0.0
            }
        };
        let (plant, other) = (near(food[k]), near(body[k]));
        if side[k] <= 0.0 {
            (food_l, body_l) = (food_l.max(plant), body_l.max(other));
        }
        if side[k] >= 0.0 {
            (food_r, body_r) = (food_r.max(plant), body_r.max(other));
        }
    }
    let input = brains.inputs_mut(slot);
    input[IN_SEE_FOOD_L] = (gain * food_l).clamp(0.0, 1.0);
    input[IN_SEE_FOOD_R] = (gain * food_r).clamp(0.0, 1.0);
    input[IN_SEE_BODY_L] = (gain * body_l).clamp(0.0, 1.0);
    input[IN_SEE_BODY_R] = (gain * body_r).clamp(0.0, 1.0);
}
