export type WorldRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WorldBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const MIN_WORLD_WIDTH = 1600;
const MIN_WORLD_HEIGHT = 1000;
const VIEWPORT_SCALE = 1.6;
export const MINI_MAP_WORLD_PADDING = 140;

function expandToAspectRatio(bounds: WorldBounds, aspectRatio: number): WorldBounds {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const nextWidth = width / height < aspectRatio ? height * aspectRatio : width;
  const nextHeight = width / height > aspectRatio ? width / aspectRatio : height;
  return {
    minX: centerX - nextWidth / 2,
    minY: centerY - nextHeight / 2,
    maxX: centerX + nextWidth / 2,
    maxY: centerY + nextHeight / 2
  };
}

function withMinimumSize(bounds: WorldBounds, width: number, height: number): WorldBounds {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const nextWidth = Math.max(width, bounds.maxX - bounds.minX);
  const nextHeight = Math.max(height, bounds.maxY - bounds.minY);
  return {
    minX: centerX - nextWidth / 2,
    minY: centerY - nextHeight / 2,
    maxX: centerX + nextWidth / 2,
    maxY: centerY + nextHeight / 2
  };
}

export function createMiniMapBounds(visible: WorldRect, content: WorldBounds | null, aspectRatio: number): WorldBounds {
  const visibleBounds = {
    minX: visible.x,
    minY: visible.y,
    maxX: visible.x + visible.width,
    maxY: visible.y + visible.height
  };
  const extent = content ? {
    minX: Math.min(visibleBounds.minX, content.minX),
    minY: Math.min(visibleBounds.minY, content.minY),
    maxX: Math.max(visibleBounds.maxX, content.maxX),
    maxY: Math.max(visibleBounds.maxY, content.maxY)
  } : visibleBounds;
  const padded = {
    minX: extent.minX - MINI_MAP_WORLD_PADDING,
    minY: extent.minY - MINI_MAP_WORLD_PADDING,
    maxX: extent.maxX + MINI_MAP_WORLD_PADDING,
    maxY: extent.maxY + MINI_MAP_WORLD_PADDING
  };
  const minimumWidth = Math.max(MIN_WORLD_WIDTH, visible.width * VIEWPORT_SCALE);
  const minimumHeight = Math.max(MIN_WORLD_HEIGHT, visible.height * VIEWPORT_SCALE);
  return expandToAspectRatio(withMinimumSize(padded, minimumWidth, minimumHeight), aspectRatio);
}

export function expandMiniMapBounds(
  current: WorldBounds,
  content: WorldBounds | null,
  visibleWidth: number,
  visibleHeight: number,
  aspectRatio: number
): WorldBounds {
  let expanded = withMinimumSize(
    current,
    Math.max(MIN_WORLD_WIDTH, visibleWidth * VIEWPORT_SCALE),
    Math.max(MIN_WORLD_HEIGHT, visibleHeight * VIEWPORT_SCALE)
  );
  if (content) {
    expanded = {
      minX: Math.min(expanded.minX, content.minX - MINI_MAP_WORLD_PADDING),
      minY: Math.min(expanded.minY, content.minY - MINI_MAP_WORLD_PADDING),
      maxX: Math.max(expanded.maxX, content.maxX + MINI_MAP_WORLD_PADDING),
      maxY: Math.max(expanded.maxY, content.maxY + MINI_MAP_WORLD_PADDING)
    };
  }
  expanded = expandToAspectRatio(expanded, aspectRatio);
  const unchanged = (Object.keys(current) as (keyof WorldBounds)[]).every((key) => Math.abs(current[key] - expanded[key]) < 0.001);
  return unchanged ? current : expanded;
}
