import { describe, it, expect, vi } from 'vitest';
import { TelemetryDashboard } from './telemetry';
import { makeMetrics } from '../core/sim/metrics';

function stubCanvas(): HTMLCanvasElement {
  const ctx = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    set fillStyle(_v: string) {},
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set font(_v: string) {},
  };
  return {
    width: 200,
    height: 150,
    getContext: () => ctx as unknown as CanvasRenderingContext2D,
  } as unknown as HTMLCanvasElement;
}

describe('TelemetryDashboard evolution series', () => {
  it('records the latest genotypic diversity and max generation from pushed metrics', () => {
    const d = new TelemetryDashboard(stubCanvas());
    const m = makeMetrics();
    m.genotypicDiversity = 0.42;
    m.maxGeneration = 7;
    d.push(m);
    expect(d.latestGenotypicDiversity()).toBeCloseTo(0.42, 6);
    expect(d.latestMaxGeneration()).toBe(7);
  });

  it('draw() does not throw with the extended metrics', () => {
    const d = new TelemetryDashboard(stubCanvas());
    const m = makeMetrics();
    m.genotypicDiversity = 0.3;
    d.push(m);
    expect(() => d.draw(m)).not.toThrow();
  });
});
