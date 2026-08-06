import { useEffect, useId, type FormEvent, type ReactNode } from 'react';
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
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [busy, onClose]);
  const content = (
    <>
      <header className="dialog-head"><h2 id={titleId}>{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="关闭" data-tooltip="关闭"><X /></button></header>
      <div className="dialog-body">{children}</div>
      {onSubmit && <footer className="dialog-actions"><button className="button" type="button" onClick={onClose}>取消</button><button className={destructive ? 'button destructive' : 'button primary'} type="submit" disabled={busy}>{busy ? '处理中...' : submitLabel}</button></footer>}
    </>
  );
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
    {onSubmit ? <form className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={onSubmit}>{content}</form> : <section className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>{content}</section>}
  </div>;
}
