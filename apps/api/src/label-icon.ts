import sanitizeHtml from 'sanitize-html';

export class InvalidLabelIconError extends Error {}

const allowedTags = [
  'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon',
  'defs', 'clipPath', 'mask', 'title', 'desc'
];

const allowedAttributes = [
  'viewBox', 'd', 'fill', 'fill-rule', 'clip-rule', 'stroke', 'stroke-width',
  'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity', 'transform',
  'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'width', 'height',
  'points', 'xmlns', 'role', 'aria-label', 'focusable', 'clip-path', 'mask'
];

export function sanitizeLabelIcon(icon: string): string {
  if (!icon.startsWith('svg:')) return icon;
  const source = icon.slice(4).trim();
  const cleaned = sanitizeHtml(source, {
    allowedTags,
    allowedAttributes: { '*': allowedAttributes },
    allowedSchemes: [],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    parser: { lowerCaseTags: false, lowerCaseAttributeNames: false }
  })
    .replace(/\s(?:href|xlink:href|style)=(['"]).*?\1/gi, '')
    .trim();
  if (!/^<svg(?:\s|>)/i.test(cleaned) || !/<\/svg>$/i.test(cleaned)) {
    throw new InvalidLabelIconError('SVG 图标格式无效');
  }
  return `svg:${cleaned}`;
}
