import { getBezierPath, Position } from '@xyflow/react';

export const FLOW_NODE_WIDTH = 180;
export const FLOW_NODE_HEIGHT = 90;
export const GRAPH_EDGE_COLOR = '#829087';
export const GRAPH_EDGE_WIDTH = 1.8;

export interface FlowPosition {
  x: number;
  y: number;
}

export interface FlowViewportBounds extends FlowPosition {
  width: number;
  height: number;
}

export function getEditorEdgePath(source: FlowPosition, target: FlowPosition): string {
  return getBezierPath({
    sourceX: source.x,
    sourceY: source.y,
    sourcePosition: Position.Right,
    targetX: target.x,
    targetY: target.y,
    targetPosition: Position.Left
  })[0];
}

interface PositionedNode {
  position: FlowPosition;
}

const NODE_GAP = 30;
const VIEWPORT_MARGIN = 16;

function overlaps(candidate: FlowPosition, node: PositionedNode): boolean {
  return candidate.x < node.position.x + FLOW_NODE_WIDTH + NODE_GAP
    && candidate.x + FLOW_NODE_WIDTH + NODE_GAP > node.position.x
    && candidate.y < node.position.y + FLOW_NODE_HEIGHT + NODE_GAP
    && candidate.y + FLOW_NODE_HEIGHT + NODE_GAP > node.position.y;
}

function isInsideViewport(position: FlowPosition, viewport: FlowViewportBounds): boolean {
  return position.x >= viewport.x + VIEWPORT_MARGIN
    && position.y >= viewport.y + VIEWPORT_MARGIN
    && position.x + FLOW_NODE_WIDTH <= viewport.x + viewport.width - VIEWPORT_MARGIN
    && position.y + FLOW_NODE_HEIGHT <= viewport.y + viewport.height - VIEWPORT_MARGIN;
}

function candidatePositions(center: FlowPosition, radiusLimit: number): FlowPosition[] {
  const anchor = { x: center.x - FLOW_NODE_WIDTH / 2, y: center.y - FLOW_NODE_HEIGHT / 2 };
  const positions = [anchor];
  const stepX = FLOW_NODE_WIDTH + NODE_GAP;
  const stepY = FLOW_NODE_HEIGHT + NODE_GAP;
  for (let radius = 1; radius <= radiusLimit; radius += 1) {
    const ring: Array<FlowPosition & { gridX: number; gridY: number }> = [];
    for (let gridY = -radius; gridY <= radius; gridY += 1) {
      for (let gridX = -radius; gridX <= radius; gridX += 1) {
        if (Math.max(Math.abs(gridX), Math.abs(gridY)) !== radius) continue;
        ring.push({ x: anchor.x + gridX * stepX, y: anchor.y + gridY * stepY, gridX, gridY });
      }
    }
    ring.sort((a, b) => {
      const distance = a.gridX ** 2 + a.gridY ** 2 - (b.gridX ** 2 + b.gridY ** 2);
      if (distance !== 0) return distance;
      const preference = (point: { gridX: number; gridY: number }) => point.gridX > 0 ? 0 : point.gridY > 0 ? 1 : point.gridX < 0 ? 2 : 3;
      return preference(a) - preference(b);
    });
    positions.push(...ring);
  }
  return positions;
}

export function findFreeTaskPosition(center: FlowPosition, nodes: PositionedNode[], viewport?: FlowViewportBounds): FlowPosition {
  const candidates = candidatePositions(center, Math.max(8, nodes.length + 2));
  const available = (position: FlowPosition) => !nodes.some((node) => overlaps(position, node));
  return candidates.find((position) => (!viewport || isInsideViewport(position, viewport)) && available(position))
    ?? candidates.find(available)
    ?? candidates[candidates.length - 1]!;
}
