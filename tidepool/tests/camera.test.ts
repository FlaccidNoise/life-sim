import { expect, test } from 'vitest';
import { fitWorld, screenToWorld, viewRect } from '../src/app/camera';

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
