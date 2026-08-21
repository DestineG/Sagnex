import { Smile } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from 'react';

const commonEmojis = [
  '😀', '🙂', '😊', '😂', '🤔', '😮', '😅', '😭',
  '👍', '👎', '👏', '🙏', '💪', '🙌', '👌', '🤝',
  '✅', '☑️', '⭐', '🔥', '💡', '⚠️', '❗', '❓',
  '📌', '📎', '📝', '📅', '⏳', '🚀', '🎯', '🔍',
  '💬', '🎉', '❤️', '✨', '🐛', '🧪', '🔧', '📦'
];

interface EmojiTextInputProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  trailing?: ReactNode;
}

export function EmojiTextInput({ value, onChange, maxLength, trailing, disabled, ...textareaProps }: EmojiTextInputProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [open]);

  function insertEmoji(emoji: string) {
    const textarea = textareaRef.current;
    if (!textarea || disabled || value.length + emoji.length > maxLength) return;
    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? start;
    const nextValue = `${value.slice(0, start)}${emoji}${value.slice(end)}`;
    onChange(nextValue);
    setOpen(false);
    requestAnimationFrame(() => {
      textarea.focus();
      const nextCaret = start + emoji.length;
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  }

  return <div ref={rootRef} className="emoji-text-input">
    <textarea
      {...textareaProps}
      ref={textareaRef}
      value={value}
      disabled={disabled}
      maxLength={maxLength}
      onChange={(event) => onChange(event.target.value)}
    />
    <div className="text-input-toolbar">
      <div className="text-input-toolbar-start">
        <button
          className={open ? 'icon-button text-input-emoji active' : 'icon-button text-input-emoji'}
          type="button"
          aria-label="插入 Emoji"
          aria-expanded={open}
          data-tooltip="插入 Emoji"
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
        ><Smile /></button>
        {open && <div className="emoji-picker" role="dialog" aria-label="选择 Emoji">
          <div className="emoji-picker-grid">
            {commonEmojis.map((emoji) => <button key={emoji} type="button" aria-label={`插入 ${emoji}`} onClick={() => insertEmoji(emoji)} disabled={value.length + emoji.length > maxLength}>{emoji}</button>)}
          </div>
        </div>}
      </div>
      <span className="text-input-count">{value.length} / {maxLength}</span>
      {trailing}
    </div>
  </div>;
}

