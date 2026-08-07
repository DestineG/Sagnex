import type { CopyEventInput } from '@sagnex/contracts';
import { Copy, GitBranch } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Dialog } from './Dialog';

interface CopyEventDialogProps {
  sourceTitle: string;
  onClose: () => void;
  onCopy: (input: CopyEventInput) => Promise<void>;
}

function initialCopyTitle(sourceTitle: string): string {
  const suffix = ' - 副本';
  return `${sourceTitle.slice(0, 160 - suffix.length)}${suffix}`;
}

export function CopyEventDialog({ sourceTitle, onClose, onCopy }: CopyEventDialogProps) {
  const [title, setTitle] = useState(() => initialCopyTitle(sourceTitle));
  const [mode, setMode] = useState<CopyEventInput['mode']>('shallow');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError('');
    try {
      await onCopy({ title: title.trim(), mode });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '复制失败');
      setBusy(false);
    }
  }

  return <Dialog title="复制事件" onClose={onClose} onSubmit={submit} submitLabel="创建副本" busy={busy} submitDisabled={!title.trim()}>
    <label className="field"><span>副本标题</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} /></label>
    <fieldset className="field copy-mode-field">
      <legend>复制方式</legend>
      <label className={mode === 'shallow' ? 'copy-mode selected' : 'copy-mode'}>
        <input type="radio" name="copy-mode" value="shallow" checked={mode === 'shallow'} onChange={() => setMode('shallow')} />
        <Copy />
        <span><strong>浅拷贝</strong><small>复制任务规划与依赖，所有任务重置为未开始</small></span>
      </label>
      <label className={mode === 'deep' ? 'copy-mode selected' : 'copy-mode'}>
        <input type="radio" name="copy-mode" value="deep" checked={mode === 'deep'} onChange={() => setMode('deep')} />
        <GitBranch />
        <span><strong>深拷贝</strong><small>完整保留任务状态、状态历史和任务评论</small></span>
      </label>
    </fieldset>
    {error && <p className="error-banner">{error}</p>}
  </Dialog>;
}
