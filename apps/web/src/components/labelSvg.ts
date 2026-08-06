import DOMPurify from 'dompurify';

const sanitizeOptions = {
  USE_PROFILES: { svg: true, svgFilters: false },
  FORBID_TAGS: ['script', 'foreignObject', 'style', 'image', 'use'],
  FORBID_ATTR: ['href', 'xlink:href', 'style']
};

export function sanitizeLabelSvg(source: string): string {
  return DOMPurify.sanitize(source, sanitizeOptions).trim();
}

export function normalizeLabelSvg(source: string): string {
  const sanitized = sanitizeLabelSvg(source);
  const document = new DOMParser().parseFromString(sanitized, 'image/svg+xml');
  if (document.querySelector('parsererror') || document.documentElement.localName.toLowerCase() !== 'svg') {
    throw new Error('请粘贴完整的 SVG 标签');
  }
  return new XMLSerializer().serializeToString(document.documentElement);
}
