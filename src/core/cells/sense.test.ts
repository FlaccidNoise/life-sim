import { describe, it, expect } from 'vitest';
import { CellStore } from '../memory/cell-store';
import { FoodField } from '../environment/food-field';
import { CellType } from './types';
import { sense } from './sense';
import { NeuralNetwork } from '../neural/network';
import { NoiseField } from '../environment/noise-field';
import { SpatialHash } from '../spatial/spatial-hash';
import { SenseSource, SightTarget } from './sense-source';

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
    sense(
      live,
      2,
      f,
      food,
      food,
      new Uint8Array(8),
      food,
      0,
      new NeuralNetwork(8, 16, 8),
      new NoiseField(8, 8, 800, 800),
      0,
      new SpatialHash(800, 800, 100, 8),
      0,
      0,
      800,
      800,
    );

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
    sense(
      Uint32Array.from([i]),
      1,
      f,
      food,
      food,
      new Uint8Array(8),
      food,
      0,
      new NeuralNetwork(8, 16, 8),
      new NoiseField(8, 8, 800, 800),
      0,
      new SpatialHash(800, 800, 100, 8),
      0,
      0,
      800,
      800,
    );
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
    sense(
      Uint32Array.from([i]),
      1,
      f,
      food,
      food,
      new Uint8Array(8),
      food,
      0,
      new NeuralNetwork(8, 16, 8),
      new NoiseField(8, 8, 800, 800),
      0,
      new SpatialHash(800, 800, 100, 8),
      0,
      0,
      800,
      800,
    );
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

    sense(
      Uint32Array.from([hunter, grazer]),
      2,
      f,
      food,
      prey,
      carn,
      prey,
      0,
      new NeuralNetwork(8, 16, 8),
      new NoiseField(8, 8, 800, 800),
      0,
      new SpatialHash(800, 800, 100, 8),
      0,
      0,
      800,
      800,
    );

    // Hunter sees the prey gradient: +y, not +x.
    expect(f.senseY[hunter]).toBeCloseTo(2, 5);
    expect(f.senseX[hunter]).toBeCloseTo(0, 5);
    // Grazer sees the food gradient: +x, not +y.
    expect(f.senseX[grazer]).toBeCloseTo(2, 5);
    expect(f.senseY[grazer]).toBeCloseTo(0, 5);
  });
});

describe('sense — prey fleeing (herbivore SENSOR steers away from predator scent)', () => {
  it('subtracts fleeWeight × predScent gradient for a herbivore SENSOR; carnivore SENSOR unaffected', () => {
    const store = new CellStore(4, false);
    const f = store.fields;
    // food flat (0 everywhere); predScent rises in +x (col c = c) → its gradient is +x.
    const food = new FoodField(8, 8, 800, 800);
    const predField = new FoodField(8, 8, 800, 800);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) predField.field[r * 8 + c] = c;
    const carn = new Uint8Array(8);
    carn[1] = 1; // org 1 carnivore, org 2 herbivore

    const grazer = store.alloc();
    f.posX[grazer] = 350;
    f.posY[grazer] = 350;
    f.cellType[grazer] = CellType.SENSOR;
    f.organismId[grazer] = 2; // herbivore → should FLEE the predScent gradient

    const hunter = store.alloc();
    f.posX[hunter] = 350;
    f.posY[hunter] = 350;
    f.cellType[hunter] = CellType.SENSOR;
    f.organismId[hunter] = 1; // carnivore → reads preyField, no flee term

    sense(
      Uint32Array.from([grazer, hunter]),
      2,
      f,
      food,
      food,
      carn,
      predField,
      3,
      new NeuralNetwork(8, 16, 8),
      new NoiseField(8, 8, 800, 800),
      0,
      new SpatialHash(800, 800, 100, 8),
      0,
      0,
      800,
      800,
    );

    // predScent gradient = +2 in x (right col4=4 − left col2=2). Herbivore steers AWAY → senseX = -3·2 = -6.
    expect(f.senseX[grazer]).toBeCloseTo(-6, 5);
    expect(f.senseY[grazer]).toBeCloseTo(0, 5);
    // Carnivore SENSOR routes to preyField (here passed as food=flat 0) and never flees → 0.
    expect(f.senseX[hunter]).toBeCloseTo(0, 5);
  });

  it('is byte-identical to no-flee when fleeWeight is 0', () => {
    const store = new CellStore(2, false);
    const f = store.fields;
    const food = new FoodField(8, 8, 800, 800);
    const predField = new FoodField(8, 8, 800, 800);
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        food.field[r * 8 + c] = c;
        predField.field[r * 8 + c] = r; // non-zero, orthogonal — would perturb if read
      }
    const i = store.alloc();
    f.posX[i] = 350;
    f.posY[i] = 350;
    f.cellType[i] = CellType.SENSOR;
    f.organismId[i] = 2; // herbivore
    sense(
      Uint32Array.from([i]),
      1,
      f,
      food,
      food,
      new Uint8Array(8),
      predField,
      0,
      new NeuralNetwork(8, 16, 8),
      new NoiseField(8, 8, 800, 800),
      0,
      new SpatialHash(800, 800, 100, 8),
      0,
      0,
      800,
      800,
    );
    // fleeWeight 0 → predField ignored → pure food gradient (+x = 2), unchanged in y.
    expect(f.senseX[i]).toBeCloseTo(2, 5);
    expect(f.senseY[i]).toBeCloseTo(0, 5);
  });
});

describe('sense — senseSource routing (SMELL vs HEARING)', () => {
  function emptyHash(): SpatialHash {
    return new SpatialHash(800, 800, 100, 8);
  }

  it('HEARING sensor reads the NoiseField gradient, not the food field', () => {
    const store = new CellStore(2, false);
    const f = store.fields;
    // food rises in +x; noise rises in +y — orthogonal so routing is unambiguous.
    const food = new FoodField(8, 8, 800, 800);
    const noise = new NoiseField(8, 8, 800, 800);
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        food.field[r * 8 + c] = c;
        noise.field[r * 8 + c] = r;
      }
    const net = new NeuralNetwork(8, 16, 8);
    const i = store.alloc();
    f.posX[i] = 350;
    f.posY[i] = 350;
    f.cellType[i] = CellType.SENSOR;
    net.addSensor(i, 0 /* FWD_GRAD */, SenseSource.HEARING, SightTarget.FOOD);
    const live = Uint32Array.from([i]);
    sense(
      live,
      1,
      f,
      food,
      food,
      new Uint8Array(8),
      food,
      0,
      net,
      noise,
      0.5,
      emptyHash(),
      0,
      0,
      800,
      800,
    );
    // noise gradient is +2 in y (row4=4 − row2=2), 0 in x — NOT the food +x gradient.
    expect(f.senseY[i]).toBeCloseTo(2, 5);
    expect(f.senseX[i]).toBeCloseTo(0, 5);
  });

  it('with loudnessGain 0 a HEARING sensor is NOT overridden — stays on the SMELL path (byte-identical)', () => {
    const store = new CellStore(2, false);
    const f = store.fields;
    const food = new FoodField(8, 8, 800, 800);
    const noise = new NoiseField(8, 8, 800, 800);
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        food.field[r * 8 + c] = c;
        noise.field[r * 8 + c] = r;
      }
    const net = new NeuralNetwork(8, 16, 8);
    const i = store.alloc();
    f.posX[i] = 350;
    f.posY[i] = 350;
    f.cellType[i] = CellType.SENSOR;
    net.addSensor(i, 0, SenseSource.HEARING, SightTarget.FOOD);
    sense(
      Uint32Array.from([i]),
      1,
      f,
      food,
      food,
      new Uint8Array(8),
      food,
      0,
      net,
      noise,
      0,
      emptyHash(),
      0,
      0,
      800,
      800,
    );
    // loudnessGain 0 → no override → the SMELL path's food +x gradient (=2) is what's written.
    expect(f.senseX[i]).toBeCloseTo(2, 5);
    expect(f.senseY[i]).toBeCloseTo(0, 5);
  });

  it('a SIGHT sensor writes a zero vector in Phase 2 (cone query lands in Phase 3)', () => {
    const store = new CellStore(2, false);
    const f = store.fields;
    const food = new FoodField(8, 8, 800, 800);
    const noise = new NoiseField(8, 8, 800, 800);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) food.field[r * 8 + c] = c;
    const net = new NeuralNetwork(8, 16, 8);
    const i = store.alloc();
    f.posX[i] = 350;
    f.posY[i] = 350;
    f.cellType[i] = CellType.SENSOR;
    net.addSensor(i, 0, SenseSource.SIGHT, SightTarget.FOOD);
    // viewRange > 0 activates the override loop; the SIGHT branch zeroes the vector for now.
    sense(
      Uint32Array.from([i]),
      1,
      f,
      food,
      food,
      new Uint8Array(8),
      food,
      0,
      net,
      noise,
      0,
      emptyHash(),
      48,
      0.6,
      800,
      800,
    );
    expect(f.senseX[i]).toBe(0);
    expect(f.senseY[i]).toBe(0);
  });
});
