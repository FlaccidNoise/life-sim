import { describe, it, expect } from 'vitest';
import { CellStore } from '../memory/cell-store';
import { FoodField } from '../environment/food-field';
import { CellType } from './types';
import { sense } from './sense';

describe('sense — food gradient → sensor channel', () => {
  it('writes a gradient pointing toward higher smell (MOTILE only)', () => {
    const store = new CellStore(4, false);
    const f = store.fields;
    const food = new FoodField(8, 8, 800, 800); // 100-unit patches
    // Build a rising ramp in +x: patch column c holds value c.
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) food.field[r * 8 + c] = c;

    const i = store.alloc(); // 0
    f.posX[i] = 350; // patch col 3, mid-patch
    f.posY[i] = 350;
    f.cellType[i] = CellType.MOTILE;

    const j = store.alloc(); // 1 — a PHOTO; must be ignored by SENSE
    f.posX[j] = 350;
    f.posY[j] = 350;
    f.cellType[j] = CellType.PHOTO;

    const live = Uint32Array.from([i, j]);
    sense(live, 2, f, food, food, new Uint8Array(8));

    // central diff one patch (±100 world units → ±1 col): right(col4)=4, left(col2)=2 → gx=2.
    expect(f.senseX[i]).toBeCloseTo(2, 5);
    expect(f.senseY[i]).toBeCloseTo(0, 5); // flat in y
    expect(f.senseX[j]).toBe(0); // PHOTO untouched
  });

  it('wraps toroidally at the world edge', () => {
    const store = new CellStore(2, false);
    const f = store.fields;
    const food = new FoodField(8, 8, 800, 800);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) food.field[r * 8 + c] = c;
    const i = store.alloc();
    f.posX[i] = 750; // col 7 (rightmost); +100 wraps to col 0
    f.posY[i] = 350;
    f.cellType[i] = CellType.MOTILE;
    sense(Uint32Array.from([i]), 1, f, food, food, new Uint8Array(8));
    // right sample wraps to col0=0, left=col6=6 → gx = 0 - 6 = -6 (no crash, defined).
    expect(f.senseX[i]).toBeCloseTo(-6, 5);
  });
});

describe('sense — also samples SENSOR cells (M4)', () => {
  it('writes the gradient for a SENSOR cell exactly as for a MOTILE', () => {
    const store = new CellStore(2, false);
    const f = store.fields;
    const food = new FoodField(8, 8, 800, 800);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) food.field[r * 8 + c] = c;
    const i = store.alloc();
    f.posX[i] = 350;
    f.posY[i] = 350;
    f.cellType[i] = CellType.SENSOR;
    sense(Uint32Array.from([i]), 1, f, food, food, new Uint8Array(8));
    expect(f.senseX[i]).toBeCloseTo(2, 5); // right(col4)=4 − left(col2)=2
    expect(f.senseY[i]).toBeCloseTo(0, 5);
  });
});

describe('sense — diet routing (carnivore SENSOR reads prey field)', () => {
  it('a carnivore-organism SENSOR reads preyField; a herbivore-organism SENSOR reads food', () => {
    const store = new CellStore(4, false);
    const f = store.fields;
    // food rises in +x (col c = c); preyField rises in +y (row r = r) — orthogonal so routing is unambiguous.
    const food = new FoodField(8, 8, 800, 800);
    const prey = new FoodField(8, 8, 800, 800);
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        food.field[r * 8 + c] = c;
        prey.field[r * 8 + c] = r;
      }
    const carn = new Uint8Array(8);
    carn[1] = 1; // organism 1 is a carnivore; organism 2 is a herbivore

    const hunter = store.alloc();
    f.posX[hunter] = 350;
    f.posY[hunter] = 350;
    f.cellType[hunter] = CellType.SENSOR;
    f.organismId[hunter] = 1; // carnivore → should read preyField (gradient in +y)

    const grazer = store.alloc();
    f.posX[grazer] = 350;
    f.posY[grazer] = 350;
    f.cellType[grazer] = CellType.SENSOR;
    f.organismId[grazer] = 2; // herbivore → should read food (gradient in +x)

    sense(Uint32Array.from([hunter, grazer]), 2, f, food, prey, carn);

    // Hunter sees the prey gradient: +y, not +x.
    expect(f.senseY[hunter]).toBeCloseTo(2, 5);
    expect(f.senseX[hunter]).toBeCloseTo(0, 5);
    // Grazer sees the food gradient: +x, not +y.
    expect(f.senseX[grazer]).toBeCloseTo(2, 5);
    expect(f.senseY[grazer]).toBeCloseTo(0, 5);
  });
});
