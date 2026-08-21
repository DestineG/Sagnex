import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmojiTextInput } from './EmojiTextInput';

describe('EmojiTextInput', () => {
  it('inserts an emoji at the current caret position', async () => {
    const onChange = vi.fn();
    render(<EmojiTextInput value="前后" onChange={onChange} maxLength={20} rows={2} />);
    const textarea = screen.getByRole('textbox');
    textarea.focus();
    fireEvent.select(textarea, { target: { selectionStart: 1, selectionEnd: 1 } });
    await userEvent.click(screen.getByRole('button', { name: '插入 Emoji' }));
    await userEvent.click(screen.getByRole('button', { name: '插入 😀' }));
    expect(onChange).toHaveBeenCalledWith('前😀后');
  });

  it('keeps the trailing action in the shared toolbar', () => {
    render(<EmojiTextInput value="" onChange={() => undefined} maxLength={20} trailing={<button type="button">提交</button>} />);
    expect(screen.getByRole('button', { name: '提交' })).toBeInTheDocument();
    expect(screen.getByText('0 / 20')).toBeInTheDocument();
  });
});
