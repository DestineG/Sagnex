import { describe, expect, it } from 'vitest';
import { truncateSvgText } from './GraphSvg';

describe('truncateSvgText', () => {
  it('accounts for the rendered width of mixed text', () => {
    const value = 'English四级考试VocabularyReview';
    const result = truncateSvgText(value, 120, 15);
    expect(result).toMatch(/…$/);
    expect(result.length).toBeLessThan(value.length);
  });

  it('keeps short titles unchanged', () => {
    expect(truncateSvgText('英语四级', 170, 15)).toBe('英语四级');
  });
});
