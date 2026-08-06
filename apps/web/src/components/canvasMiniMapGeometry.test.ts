import { describe, expect, it } from 'vitest';
import { MINI_MAP_WORLD_PADDING, createMiniMapBounds, expandMiniMapBounds } from './canvasMiniMapGeometry';

const aspectRatio = 196 / 116;

describe('canvas minimap geometry', () => {
  it('gives a sparse graph a stable minimum world area', () => {
    const visible = { x: 100, y: 80, width: 800, height: 500 };
    const bounds = createMiniMapBounds(visible, { minX: 250, minY: 180, maxX: 458, maxY: 288 }, aspectRatio);

    expect(bounds.maxX - bounds.minX).toBeGreaterThanOrEqual(1600);
    expect(bounds.maxY - bounds.minY).toBeGreaterThanOrEqual(1000);
    expect((bounds.maxX - bounds.minX) / (bounds.maxY - bounds.minY)).toBeCloseTo(aspectRatio, 5);
    expect(visible.width / (bounds.maxX - bounds.minX)).toBeLessThanOrEqual(0.5);
  });

  it('expands for nodes outside the boundary without shrinking existing bounds', () => {
    const initial = createMiniMapBounds({ x: 0, y: 0, width: 800, height: 500 }, null, aspectRatio);
    const expanded = expandMiniMapBounds(
      initial,
      { minX: initial.minX - 200, minY: 100, maxX: 400, maxY: initial.maxY + 300 },
      800,
      500,
      aspectRatio
    );

    expect(expanded.minX).toBeLessThanOrEqual(initial.minX - 200 - MINI_MAP_WORLD_PADDING);
    expect(expanded.maxY).toBeGreaterThanOrEqual(initial.maxY + 300 + MINI_MAP_WORLD_PADDING);
    expect(expanded.maxX).toBeGreaterThanOrEqual(initial.maxX);
    expect(expanded.minY).toBeLessThanOrEqual(initial.minY);
  });

  it('does not change when content remains inside the current boundary', () => {
    const initial = createMiniMapBounds({ x: 0, y: 0, width: 800, height: 500 }, null, aspectRatio);
    const expanded = expandMiniMapBounds(initial, { minX: 100, minY: 100, maxX: 300, maxY: 250 }, 800, 500, aspectRatio);

    expect(expanded).toBe(initial);
  });
});
