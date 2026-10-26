import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, centered, clampCenter, clampZoom, exportSide, pan, placement, scaleFor, squareOf, zoomTo } from './crop';

const VIEW = 300;

describe('square crop', () => {
  it('fits the short side to the viewport at zoom 1, whatever the shape', () => {
    expect(scaleFor(1200, 600, VIEW, 1)).toBeCloseTo(0.5);
    expect(scaleFor(600, 1200, VIEW, 1)).toBeCloseTo(0.5);
    expect(scaleFor(300, 300, VIEW, 2)).toBeCloseTo(2);
  });

  it('cuts the largest centred square at zoom 1', () => {
    expect(squareOf(1200, 600, VIEW, 1, centered(1200, 600))).toEqual({ sx: 300, sy: 0, size: 600 });
    expect(squareOf(600, 1200, VIEW, 1, centered(600, 1200))).toEqual({ sx: 0, sy: 300, size: 600 });
  });

  it('zooming in cuts a smaller square, and never passes the limits', () => {
    expect(squareOf(600, 600, VIEW, 2, centered(600, 600)).size).toBeCloseTo(300);
    expect(squareOf(600, 600, VIEW, 99, centered(600, 600)).size).toBeCloseTo(600 / MAX_ZOOM);
    expect(squareOf(600, 600, VIEW, 0.2, centered(600, 600)).size).toBeCloseTo(600);
    expect(clampZoom(NaN)).toBe(1);
  });

  it('keeps the viewport inside the image so no edge is empty', () => {
    // Wide image at fit: it can only move sideways.
    expect(clampCenter(1200, 600, VIEW, 1, { x: 0, y: 0 })).toEqual({ x: 300, y: 300 });
    expect(clampCenter(1200, 600, VIEW, 1, { x: 5000, y: 5000 })).toEqual({ x: 900, y: 300 });
    const s = squareOf(1200, 600, VIEW, 1, { x: -50, y: 900 });
    expect(s.sx).toBeGreaterThanOrEqual(0);
    expect(s.sy + s.size).toBeLessThanOrEqual(600);
  });

  it('pans by screen pixels, the image following the pointer', () => {
    // Dragging the picture right 30 px shows 60 px more of its left side at scale 0.5.
    const c = pan(1200, 600, VIEW, 1, { x: 600, y: 300 }, 30, 0);
    expect(c.x).toBeCloseTo(540);
    // Dragging past the edge stops there.
    expect(pan(1200, 600, VIEW, 1, { x: 600, y: 300 }, 10_000, 0).x).toBe(300);
  });

  it('keeps the middle when the zoom changes, inside the image', () => {
    const z = zoomTo(1200, 600, VIEW, 3, { x: 300, y: 300 });
    expect(z.zoom).toBe(3);
    expect(z.center.x).toBeGreaterThanOrEqual(100);
    expect(zoomTo(1200, 600, VIEW, 50, centered(1200, 600)).zoom).toBe(MAX_ZOOM);
  });

  it('places the image so the cut fills the viewport', () => {
    const p = placement(1200, 600, VIEW, 1, centered(1200, 600));
    expect(p.height).toBeCloseTo(VIEW);
    expect(p.top).toBeCloseTo(0);
    expect(p.left).toBeCloseTo(-150);
    expect(p.width).toBeCloseTo(600);
  });

  it('does not enlarge a small cut', () => {
    expect(exportSide({ sx: 0, sy: 0, size: 2000 })).toBe(512);
    expect(exportSide({ sx: 0, sy: 0, size: 120.7 })).toBe(120);
    expect(exportSide({ sx: 0, sy: 0, size: 3 })).toBe(16);
  });
});
