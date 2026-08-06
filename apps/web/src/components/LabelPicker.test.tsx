import type { Label } from '@sagnex/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LabelPicker } from './LabelPicker';

const labels: Label[] = [
  { id: '00000000-0000-4000-8000-000000000001', name: '数学', color: '#176b4b', icon: 'graduation-cap', usageCount: 1, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '00000000-0000-4000-8000-000000000002', name: '工作', color: '#28748f', icon: 'briefcase-business', usageCount: 0, createdAt: '2026-01-01T00:00:00.000Z' }
];

describe('LabelPicker', () => {
  it('searches and selects labels without rendering native checkboxes', async () => {
    const onChange = vi.fn();
    const { container } = render(<LabelPicker labels={labels} selectedIds={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '选择标签' }));
    await userEvent.type(screen.getByPlaceholderText('搜索标签'), '数学');
    await userEvent.click(screen.getByRole('option', { name: '数学' }));
    expect(onChange).toHaveBeenCalledWith([labels[0]!.id]);
    expect(container.querySelector('input[type="checkbox"]')).not.toBeInTheDocument();
  });
});
