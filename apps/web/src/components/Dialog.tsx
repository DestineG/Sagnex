import { useEffect, useId, useRef, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel?: string;
  destructive?: boolean;
  busy?: boolean;
}

export function Dialog({ title, children, onClose, onSubmit, submitLabel = '保存', destructive, busy }: DialogProps) {
  const titleId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const busyRef = useRef(busy);
  const closeRef = useRef(onClose);

  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const dialog = formRef.current ?? sectionRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.focus();

    function handleKeyboard(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyboard);
    return () => {
      document.removeEventListener('keydown', handleKeyboard);
      previouslyFocused?.focus();
    };
  }, []);

  function submitFromDialog(event: ReactKeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Enter' && event.target === event.currentTarget && !busy) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  }

  const content = (
    <>
      <header className="dialog-head"><h2 id={titleId}>{title}</h2><button className="icon-button" type="button" onClick={onClose} disabled={busy} aria-label="关闭" data-tooltip="关闭"><X /></button></header>
      <div className="dialog-body">{children}</div>
      {onSubmit && <footer className="dialog-actions"><button className="button" type="button" onClick={onClose} disabled={busy}>取消</button><button className={destructive ? 'button destructive' : 'button primary'} type="submit" disabled={busy}>{busy ? '处理中...' : submitLabel}</button></footer>}
    </>
  );
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
    {onSubmit
      ? <form ref={formRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={submitFromDialog} onSubmit={onSubmit}>{content}</form>
      : <section ref={sectionRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>{content}</section>}
  </div>;
}
