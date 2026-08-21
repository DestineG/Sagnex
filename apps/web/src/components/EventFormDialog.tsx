import type { CreateEventInput, Label } from '@sagnex/contracts';
import { useState, type FormEvent } from 'react';
import { Dialog } from './Dialog';
import { EmojiTextInput } from './EmojiTextInput';
import { LabelPicker } from './LabelPicker';

interface EventFormDialogProps {
  labels: Label[];
  onClose: () => void;
  onCreate: (input: CreateEventInput) => Promise<void>;
  onCreateLabel?: (name: string) => Promise<Label>;
}

export function EventFormDialog({ labels, onClose, onCreate, onCreateLabel }: EventFormDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError('');
    try {
      await onCreate({ title: title.trim(), description: description.trim(), labelIds });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败');
      setBusy(false);
    }
  }

  return <Dialog title="新建事件" onClose={onClose} onSubmit={submit} submitLabel="创建并规划" busy={busy}>
    <label className="field"><span>标题</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="要完成什么？" /></label>
    <label className="field"><span>简介</span><EmojiTextInput value={description} onChange={setDescription} maxLength={2000} rows={3} placeholder="补充必要背景" /></label>
    <div className="field"><span>标签</span><LabelPicker labels={labels} selectedIds={labelIds} onChange={setLabelIds} onCreate={onCreateLabel} /></div>
    {error && <p className="error-banner">{error}</p>}
  </Dialog>;
}
