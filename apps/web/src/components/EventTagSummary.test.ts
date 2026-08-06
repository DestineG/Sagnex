import { describe, expect, it } from 'vitest';
import { layoutTagRows } from './EventTagSummary';

describe('layoutTagRows', () => {
  it('keeps complete labels on at most two rows and reserves overflow space', () => {
    expect(layoutTagRows([90, 90, 90, 90, 90], 200, 30)).toEqual({
      rows: [[0, 1], [2]],
      hidden: [3, 4]
    });
  });

  it('skips an oversized label when other labels exist', () => {
    expect(layoutTagRows([240, 80], 200, 30)).toEqual({
      rows: [[1], []],
      hidden: [0]
    });
  });

  it('keeps a sole oversized label for visual truncation', () => {
    expect(layoutTagRows([240], 200, 30)).toEqual({ rows: [[0], []], hidden: [] });
  });
});
