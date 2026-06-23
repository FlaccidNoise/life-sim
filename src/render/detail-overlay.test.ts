import { describe, it, expect, beforeEach } from 'vitest';
import { OrganismStore } from '../core/store';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';
import { DetailOverlay } from './detail-overlay';

// Minimal canvas stub: getContext returns an object whose methods are no-ops/recorders,
// width/height are settable. The overlay only needs 2D ctx transform + path ops here.
function fakeCanvas(w = 800, h = 600): HTMLCanvasElement {
  const calls: string[] = [];
  const ctx = new Proxy(
    { canvas: null as unknown, setTransform() {}, clearRect() {}, save() {}, restore() {} },
    {
      get(target, prop: string) {
        if (prop in target) return (target as Record<string, unknown>)[prop];
        return (...args: unknown[]) => calls.push(`${prop}(${args.join(',')})`);
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  const c = {
    width: w,
    height: h,
    clientWidth: w,
    clientHeight: h,
    style: {} as CSSStyleDeclaration,
    getContext: () => ctx,
    parentElement: { appendChild: () => {}, style: {} } as unknown as HTMLElement,
    // expose recorder for assertions
    __calls: calls,
  } as unknown as HTMLCanvasElement;
  return c;
}

function oneCreature(cx: number, cy: number, size = 8): OrganismStore {
  const s = new OrganismStore(16);
  const i = s.alloc();
  s.x[i] = cx;
  s.y[i] = cy;
  s.heading[i] = 0;
  const b = i * SCALAR_GENE_COUNT;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) s.scalarGenes[b + g] = 1;
  s.scalarGenes[b + ScalarGene.SIZE] = size;
  s.rebuildLive();
  return s;
}

describe('DetailOverlay camera mirror', () => {
  let host: HTMLCanvasElement;
  let ov: DetailOverlay;
  beforeEach(() => {
    host = fakeCanvas(800, 600);
    ov = new DetailOverlay(host, 8192, 8192);
    ov.resize();
  });

  it('world centre maps to canvas centre at zoom 1', () => {
    ov.setCamera(4096, 4096, 1);
    const p = ov.worldToScreen(4096, 4096);
    expect(p.x).toBeCloseTo(400, 3);
    expect(p.y).toBeCloseTo(300, 3);
  });

  it('matches the renderer base-fit scale (min of axes)', () => {
    ov.setCamera(4096, 4096, 1);
    // baseScale = min(800/8192, 600/8192) = 600/8192; a point +8192 world units right of cam:
    const p = ov.worldToScreen(4096 + 8192, 4096);
    expect(p.x).toBeCloseTo(400 + 8192 * (600 / 8192), 3);
  });

  it('tierFor buckets by on-screen radius', () => {
    expect(ov.tierFor(3)).toBe(0);
    expect(ov.tierFor(10)).toBe(1);
    expect(ov.tierFor(30)).toBe(2);
  });

  it('skips Tier-0 creatures (no draw) and marks Tier 1/2', () => {
    // size 8 at zoom 1 → radius = 8 * (600/8192) ≈ 0.59px → Tier 0 → not drawn
    const s = oneCreature(4096, 4096, 8);
    ov.setCamera(4096, 4096, 1);
    ov.draw(s);
    const calls = (host as unknown as { __calls: string[] }).__calls;
    expect(calls.some((c) => c.startsWith('arc'))).toBe(false);
    // zoom in hard → same creature now Tier 2 → a debug marker (arc) is drawn
    ov.setCamera(4096, 4096, 64);
    (host as unknown as { __calls: string[] }).__calls.length = 0;
    ov.draw(s);
    expect(calls.some((c) => c.startsWith('arc'))).toBe(true);
  });
});
