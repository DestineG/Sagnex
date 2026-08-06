import type { Label } from '@sagnex/contracts';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LabelIconView } from './LabelIcon';

interface LabelPickerProps {
  labels: Label[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onCreate?: (name: string) => Promise<Label>;
  disabled?: boolean;
  ariaLabel?: string;
  placeholder?: string;
}

export function LabelPicker({ labels, selectedIds, onChange, onCreate, disabled, ariaLabel = '选择标签', placeholder = '未选择标签' }: LabelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => labels.filter((label) => selectedIds.includes(label.id)), [labels, selectedIds]);
  const filtered = useMemo(() => labels.filter((label) => label.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [labels, query]);
  const exactMatch = labels.some((label) => label.name.toLocaleLowerCase() === query.trim().toLocaleLowerCase());

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, []);

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
  }

  async function createLabel() {
    const name = query.trim();
    if (!name || !onCreate || creating) return;
    setCreating(true);
    try {
      const label = await onCreate(name);
      onChange([...selectedIds, label.id]);
      setQuery('');
    } finally {
      setCreating(false);
    }
  }

  return <div className="label-picker" ref={rootRef}>
    <div className={`label-picker-control ${open ? 'open' : ''} ${disabled ? 'disabled' : ''}`}>
      <div className="selected-labels">
        {selected.map((label) => <span className="label-chip" key={label.id}>
          <LabelIconView icon={label.icon} /><i style={{ background: label.color }} />{label.name}
          {!disabled && <button type="button" aria-label={`移除标签 ${label.name}`} onClick={() => toggle(label.id)}><X /></button>}
        </span>)}
        {selected.length === 0 && <span className="label-placeholder">{placeholder}</span>}
      </div>
      <button className="label-picker-trigger" type="button" aria-label={ariaLabel} aria-expanded={open} disabled={disabled} onClick={() => setOpen((value) => !value)}><ChevronDown /></button>
    </div>
    {open && <div className="label-popover">
      <label className="label-search"><Search /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标签" /></label>
      <div className="label-options" role="listbox" aria-label="标签列表" aria-multiselectable="true">
        {filtered.map((label) => {
          const checked = selectedIds.includes(label.id);
          return <button key={label.id} type="button" role="option" aria-selected={checked} className={checked ? 'label-option selected' : 'label-option'} onClick={() => toggle(label.id)}>
            <LabelIconView icon={label.icon} /><i className="label-color" style={{ background: label.color }} /><span>{label.name}</span>{checked && <Check />}
          </button>;
        })}
        {filtered.length === 0 && !query.trim() && <p className="label-empty">还没有标签</p>}
        {filtered.length === 0 && query.trim() && !onCreate && <p className="label-empty">没有匹配的标签</p>}
      </div>
      {onCreate && query.trim() && !exactMatch && <button className="label-create" type="button" onClick={() => void createLabel()} disabled={creating}><Plus />{creating ? '正在创建…' : `新建“${query.trim()}”`}</button>}
    </div>}
  </div>;
}
