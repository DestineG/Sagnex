import { describe, expect, it } from 'vitest';
import { findFreeTaskPosition, FLOW_NODE_HEIGHT, FLOW_NODE_WIDTH } from './taskNodeGeometry';

const viewport = { x: 0, y: 0, width: 1200, height: 800 };

describe('findFreeTaskPosition', () => {
  it('uses the visible center when it is free', () => {
    expect(findFreeTaskPosition({ x: 600, y: 400 }, [], viewport)).toEqual({
      x: 600 - FLOW_NODE_WIDTH / 2,
      y: 400 - FLOW_NODE_HEIGHT / 2
    });
  });

  it('selects a nearby visible position when the center is occupied', () => {
    const centerPosition = { x: 600 - FLOW_NODE_WIDTH / 2, y: 400 - FLOW_NODE_HEIGHT / 2 };
    const result = findFreeTaskPosition({ x: 600, y: 400 }, [{ position: centerPosition }], viewport);
    expect(result).not.toEqual(centerPosition);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.x + FLOW_NODE_WIDTH).toBeLessThanOrEqual(viewport.width);
    expect(result.y + FLOW_NODE_HEIGHT).toBeLessThanOrEqual(viewport.height);
  });
});
