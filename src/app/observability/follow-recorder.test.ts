import { describe, it, expect } from 'vitest';
import { World } from '../../core/world';
import { defaultConfig } from '../../core/config';
import { FollowRecorder } from './follow-recorder';

function smallWorld(): World {
  return new World(
    defaultConfig({ seed: 1, worldWidth: 512, worldHeight: 512, initialPopulation: 40 }),
  );
}

describe('FollowRecorder', () => {
  it('records one row per tick the followed creature is alive', () => {
    const w = smallWorld();
    const slot = w.store.liveIndices[0]!;
    const r = new FollowRecorder();
    r.follow(slot, w.store.genId[slot]!);
    // Count ticks the followed creature is alive at record time: record() is a no-op once it dies, so the
    // row count must equal the alive-tick count (robust to the seed's churn — which creature dies when
    // shifts whenever a gene is added to the RNG stream). It stays "following" until clear() regardless.
    let aliveTicks = 0;
    for (let t = 0; t < 10; t++) {
      w.step();
      if (r.isFollowedAlive(w.store)) aliveTicks++;
      r.record(w.store, w.config, w.tick);
    }
    expect(r.following).toBe(true);
    expect(r.count).toBe(aliveTicks);
    expect(aliveTicks).toBeGreaterThan(0); // the recorder actually captured something
  });

  it('emits a CSV header plus one line per recorded tick', () => {
    const w = smallWorld();
    const slot = w.store.liveIndices[0]!;
    const r = new FollowRecorder();
    r.follow(slot, w.store.genId[slot]!);
    r.record(w.store, w.config, w.tick);
    const lines = r.toCsv().split('\n');
    expect(lines[0]).toBe('tick,x,y,energy,age,speed,mode,diet,turnNow,thrustNow,drift');
    expect(lines).toHaveLength(2);
    expect(lines[1]!.split(',')).toHaveLength(11);
  });

  it('stops recording once the followed creature dies (stale genId)', () => {
    const w = smallWorld();
    const slot = w.store.liveIndices[0]!;
    const r = new FollowRecorder();
    r.follow(slot, w.store.genId[slot]!);
    w.store.free(slot); // kill it
    w.store.rebuildLive();
    r.record(w.store, w.config, w.tick);
    expect(r.count).toBe(0);
  });

  it('honors the ring-buffer cap', () => {
    const w = smallWorld();
    const slot = w.store.liveIndices[0]!;
    const r = new FollowRecorder(5);
    r.follow(slot, w.store.genId[slot]!);
    for (let t = 0; t < 20; t++) {
      w.step();
      r.record(w.store, w.config, w.tick);
    }
    expect(r.count).toBe(5);
  });

  it('clear() drops the recording and stops following', () => {
    const w = smallWorld();
    const slot = w.store.liveIndices[0]!;
    const r = new FollowRecorder();
    r.follow(slot, w.store.genId[slot]!);
    r.record(w.store, w.config, w.tick);
    r.clear();
    expect(r.following).toBe(false);
    expect(r.count).toBe(0);
  });
});
