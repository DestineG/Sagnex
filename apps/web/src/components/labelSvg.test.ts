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

  it('maps the root paint to the selected label color', () => {
    const result = normalizeLabelSvg('<svg viewBox="0 0 24 24" fill="none" stroke="#607d8b"><path d="M1 1h20" /></svg>');
    expect(result).toContain('stroke="currentColor"');
    expect(result).toContain('fill="none"');
    expect(result).not.toContain('#607d8b');
  });

  it('maps only the dominant child paint and preserves accent colors', () => {
    const result = normalizeLabelSvg('<svg viewBox="0 0 24 24"><path fill="#333" d="M0 0h4v4z"/><path fill="#333" d="M5 0h4v4z"/><circle fill="#f00" cx="12" cy="12" r="2"/></svg>');
    expect(result.match(/fill="currentColor"/g)).toHaveLength(2);
    expect(result).toContain('fill="#f00"');
  });

  it('rejects content without an SVG root', () => {
    expect(() => normalizeLabelSvg('<div>not an icon</div>')).toThrow('请粘贴完整的 SVG 标签');
  });
});
