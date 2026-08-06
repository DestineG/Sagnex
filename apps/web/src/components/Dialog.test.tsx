import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type FormEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('focuses the dialog and submits it with Enter', async () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());
    render(<Dialog title="删除备份" onClose={() => undefined} onSubmit={onSubmit} submitLabel="删除备份" destructive><p>确认删除</p></Dialog>);

    expect(screen.getByRole('dialog')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('restores focus after closing', async () => {
    function Example() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>打开</button>{open && <Dialog title="确认" onClose={() => setOpen(false)}><p>内容</p></Dialog>}</>;
    }

    render(<Example />);
    const trigger = screen.getByRole('button', { name: '打开' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });

  it('keeps focus on an autofocus field', () => {
    render(<Dialog title="新建任务" onClose={() => undefined}><input aria-label="标题" autoFocus /></Dialog>);
    expect(screen.getByRole('textbox', { name: '标题' })).toHaveFocus();
  });
});
