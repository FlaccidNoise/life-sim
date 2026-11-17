import { describe, expect, it } from 'vitest';
import { BAKED_WORLD, noWorld, worldFile } from '../src/app/world';

const q = (s: string): URLSearchParams => new URLSearchParams(s);

describe('worldFile', () => {
  it('opens on the baked world with no query', () => {
    expect(worldFile(q(''))).toBe(BAKED_WORLD);
  });

  it('names the baked world with no leading slash, so it loads from the page folder', () => {
    expect(BAKED_WORLD.startsWith('/')).toBe(false);
    expect(BAKED_WORLD).not.toContain('://');
  });

  it('loads the snapshot that ?world= names', () => {
    expect(worldFile(q('world=/other.tdpl'))).toBe('/other.tdpl');
  });

  it('starts from founders with ?founders', () => {
    expect(worldFile(q('founders'))).toBeNull();
  });

  it('lets ?founders win over ?world=', () => {
    expect(worldFile(q('founders&world=/other.tdpl'))).toBeNull();
  });
});

describe('noWorld', () => {
  it('names the file, the reason, and a fix', () => {
    const text = noWorld('m2-world.tdpl', 'the server answered 404');
    expect(text).toContain('m2-world.tdpl');
    expect(text).toContain('the server answered 404');
    expect(text).toContain('Fix:');
    expect(text).toContain('?founders');
  });

  it('keeps the fix that the reason carries', () => {
    const text = noWorld('x.tdpl', 'bad magic. Fix: rebake the world.');
    expect(text.match(/Fix:/g)).toHaveLength(1);
  });
});
