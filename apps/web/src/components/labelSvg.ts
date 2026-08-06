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
  const root = document.documentElement;
  const elements = [root, ...root.querySelectorAll('*')];
  const usablePaint = (value: string | null) => value && !['none', 'transparent', 'currentcolor'].includes(value.trim().toLowerCase()) && !value.trim().toLowerCase().startsWith('url(');
  const rootPaint = ['stroke', 'fill'].map((attribute) => root.getAttribute(attribute)).find(usablePaint);
  const counts = new Map<string, number>();
  for (const element of elements) {
    for (const attribute of ['stroke', 'fill']) {
      const value = element.getAttribute(attribute)?.trim();
      if (usablePaint(value ?? null)) counts.set(value!.toLowerCase(), (counts.get(value!.toLowerCase()) ?? 0) + 1);
    }
  }
  const primary = rootPaint?.toLowerCase() ?? [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (primary) {
    for (const element of elements) {
      for (const attribute of ['stroke', 'fill']) {
        if (element.getAttribute(attribute)?.trim().toLowerCase() === primary) element.setAttribute(attribute, 'currentColor');
      }
    }
  } else if (!elements.some((element) => element.hasAttribute('fill') || element.hasAttribute('stroke'))) {
    root.setAttribute('fill', 'currentColor');
  }
  return new XMLSerializer().serializeToString(root);
}
