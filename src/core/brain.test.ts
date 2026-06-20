import { describe, it, expect } from 'vitest';
import { OrganismStore } from './store';
import { steer } from './brain';

describe('steer', () => {
  it('turns toward lateral food (food to the left → turns left)', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.heading[i] = 0; // facing +x; "left" (perp) is +y
    s.senseX[i] = 0;
    s.senseY[i] = 1; // food gradient toward +y (to the left)
    s.rebuildLive();
    steer(s, 1.2, 1.5, 0.3, 0.35, 1);
    expect(s.heading[i]).toBeGreaterThan(0); // turned toward the food (left)
  });

  it('thrusts harder up-gradient (more food ahead → more thrust)', () => {
    const ahead = new OrganismStore(4);
    let i = ahead.alloc();
    ahead.heading[i] = 0;
    ahead.senseX[i] = 1; // food straight ahead (+x)
    ahead.senseY[i] = 0;
    ahead.rebuildLive();
    steer(ahead, 1.2, 1.5, 0.3, 0.35, 5);
    const thrustAhead = Math.hypot(ahead.forceX[0]!, ahead.forceY[0]!);

    const none = new OrganismStore(4);
    i = none.alloc();
    none.heading[i] = 0;
    none.senseX[i] = 0; // no gradient → cruise only
    none.senseY[i] = 0;
    none.rebuildLive();
    steer(none, 1.2, 1.5, 0.3, 0.35, 5);
    const thrustNone = Math.hypot(none.forceX[0]!, none.forceY[0]!);

    expect(thrustAhead).toBeGreaterThan(thrustNone);
  });
});
