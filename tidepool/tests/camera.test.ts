import { expect, test } from 'vitest';
import { clampToWorld, fitWorld, follow, screenToWorld, viewRect, zoomAt } from '../src/app/camera';

test('fitWorld centres the world and fits the tighter axis', () => {
  // A 1536 x 1024 world on a 768 x 1024 screen: the width is the limit.
  expect(fitWorld(1536, 1024, 768, 1024)).toEqual({ x: 768, y: 512, scale: 0.5 });
  // On a 3072 x 1024 screen the height is the limit.
  expect(fitWorld(1536, 1024, 3072, 1024)).toEqual({ x: 768, y: 512, scale: 1 });
});

test('viewRect of a fitted camera holds the whole world', () => {
  const r = viewRect(fitWorld(1536, 1024, 768, 1024), 768, 1024);
  expect(r).toEqual({ x0: 0, y0: -512, x1: 1536, y1: 1536 });
});

test('viewRect is the screen size divided by the scale, around the camera', () => {
  expect(viewRect({ x: 100, y: 50, scale: 4 }, 800, 400)).toEqual({
    x0: 0,
    y0: 0,
    x1: 200,
    y1: 100,
  });
});

test('screenToWorld maps the screen centre to the camera and the corners to viewRect', () => {
  const cam = { x: 100, y: 50, scale: 4 };
  expect(screenToWorld(cam, 800, 400, 400, 200)).toEqual({ x: 100, y: 50 });
  expect(screenToWorld(cam, 800, 400, 0, 0)).toEqual({ x: 0, y: 0 });
  expect(screenToWorld(cam, 800, 400, 800, 400)).toEqual({ x: 200, y: 100 });
});

test('zooming about a point keeps that point under the cursor', () => {
  const cam = { x: 500, y: 400, scale: 2 };
  const before = screenToWorld(cam, 1000, 600, 300, 200);
  const after = screenToWorld(zoomAt(cam, 1000, 600, 300, 200, 1.5), 1000, 600, 300, 200);
  expect(after.x).toBeCloseTo(before.x, 4);
  expect(after.y).toBeCloseTo(before.y, 4);
});

test('zoom stops at the limits', () => {
  const cam = { x: 500, y: 400, scale: 11 };
  expect(zoomAt(cam, 1000, 600, 0, 0, 4).scale).toBe(12);
  expect(zoomAt(cam, 1000, 600, 0, 0, 0.001).scale).toBe(0.4);
});

test('follow converges and does not depend on frame rate', () => {
  let a = { x: 0, y: 0, scale: 1 };
  let b = { x: 0, y: 0, scale: 1 };
  for (let i = 0; i < 60; i++) a = follow(a, 100, 50, 4, 1 / 60);
  for (let i = 0; i < 30; i++) b = follow(b, 100, 50, 4, 1 / 30);
  expect(a.x).toBeCloseTo(b.x, 1);
  expect(a.scale).toBeCloseTo(b.scale, 2);
  expect(a.x).toBeGreaterThan(90);
});

test('the view never leaves the world when the world is larger than the view', () => {
  const cam = clampToWorld({ x: -500, y: 9000, scale: 2 }, 1536, 1024, 800, 600);
  const r = viewRect(cam, 800, 600);
  expect(r.x0).toBeGreaterThanOrEqual(0);
  expect(r.y1).toBeLessThanOrEqual(1024);
});

test('a view larger than the world is centred on it', () => {
  const cam = clampToWorld({ x: 0, y: 0, scale: 0.4 }, 1536, 1024, 4000, 3000);
  expect(cam.x).toBeCloseTo(768, 4);
  expect(cam.y).toBeCloseTo(512, 4);
});
