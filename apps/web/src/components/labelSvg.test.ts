import { describe, expect, it } from 'vitest';
import { normalizeLabelSvg } from './labelSvg';

describe('normalizeLabelSvg', () => {
  it('accepts icon metadata comments before the SVG root', () => {
    const result = normalizeLabelSvg(`
      <!-- tags: [text, type] -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path d="M3 3h18v18H3z" />
      </svg>
    `);

    expect(result).toMatch(/^<svg/);
    expect(result).toContain('<path');
    expect(result).not.toContain('tags:');
  });

  it('removes unsafe SVG content before serialization', () => {
    const result = normalizeLabelSvg('<svg xmlns="http://www.w3.org/2000/svg" onclick="alert(1)"><script>alert(1)</script><path d="M0 0h1" /></svg>');

    expect(result).not.toContain('onclick');
    expect(result).not.toContain('script');
  });

  it('rejects content without an SVG root', () => {
    expect(() => normalizeLabelSvg('<div>not an icon</div>')).toThrow('请粘贴完整的 SVG 标签');
  });
});
