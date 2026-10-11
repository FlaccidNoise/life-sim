import { expect, test } from 'vitest';
import {
  clampToWorld,
  fitWorld,
  follow,
  isFitted,
  pan,
  screenToWorld,
  viewRect,
  zoomAt,
} from '../src/app/camera';

test('fitWorld centres the world and fits the tighter axis', () => {
  // A 1536 x 1024 world on a 768 x 1024 screen: the width is the limit.
  expect(fitWorld(1536, 1024, 768, 1024)).toEqual({ x: 768, y: 512, scale: 0.5 });
  // On a 3072 x 1024 screen the height is the limit.
  expect(fitWorld(1536, 1024, 3072, 1024)).toEqual({ x: 768, y: 512, scale: 1 });
});

test('fitWorld stays inside the scale limits', () => {
  expect(fitWorld(1536, 1024, 300, 300)).toEqual({ x: 768, y: 512, scale: 0.4 });
  expect(fitWorld(10, 10, 1000, 1000).scale).toBe(12);
});

test('a camera is fitted until a zoom or a pan changes what the screen shows', () => {
  const [w, h, cssW, cssH] = [1536, 1024, 614, 800];
  const inWorld = (cam: { x: number; y: number; scale: number }) =>
    clampToWorld(cam, w, h, cssW, cssH);
  const fit = fitWorld(w, h, cssW, cssH);
  expect(isFitted(fit, w, h, cssW, cssH)).toBe(true);
  // The screen shows more than the height of the world, so the limits undo a pan up or down.
  expect(isFitted(inWorld(pan(fit, 0, 50)), w, h, cssW, cssH)).toBe(true);
  expect(isFitted(inWorld(zoomAt(fit, cssW, cssH, 0, 0, 0.5)), w, h, cssW, cssH)).toBe(true);

  expect(isFitted(inWorld(zoomAt(fit, cssW, cssH, 307, 400, 2)), w, h, cssW, cssH)).toBe(false);
  expect(isFitted(inWorld(pan(fit, 50, 0)), w, h, cssW, cssH)).toBe(false);
  // The fitted camera of another screen size is not the fitted camera of this one.
  expect(isFitted(fitWorld(w, h, 1280, 800), w, h, cssW, cssH)).toBe(false);
});

test('a page opened in a small window fills a larger one after a resize', () => {
  // Opened 614 pixels wide: the world is drawn at the lowest scale, 614 pixels wide.
  const small = fitWorld(1536, 1024, 614, 800);
  expect(small.scale).toBe(0.4);
  expect(isFitted(small, 1536, 1024, 614, 800)).toBe(true);
  // So the resize to 1280 pixels fits the world again: it is drawn 1,200 pixels wide.
  expect(fitWorld(1536, 1024, 1280, 800).scale * 1536).toBeCloseTo(1200, 6);
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
