import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CopyEventDialog } from './CopyEventDialog';

describe('CopyEventDialog', () => {
  it('submits the edited title and selected copy mode', async () => {
    const onCopy = vi.fn().mockResolvedValue(undefined);
    render(<CopyEventDialog sourceTitle="原事件" onClose={() => undefined} onCopy={onCopy} />);
    const user = userEvent.setup();
    const title = screen.getByLabelText('副本标题');
    await user.clear(title);
    await user.type(title, '拆分事件');
    await user.click(screen.getByRole('radio', { name: /深拷贝/ }));
    await user.click(screen.getByRole('button', { name: '创建副本' }));
    expect(onCopy).toHaveBeenCalledWith({ title: '拆分事件', mode: 'deep' });
  });
});
