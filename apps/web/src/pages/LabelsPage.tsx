import type { Label, LabelIcon } from '@sagnex/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCode2, Pencil, Plus, Search, Smile, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { Dialog } from '../components/Dialog';
import { LabelIconView, labelIconOptions } from '../components/LabelIcon';
import { normalizeLabelSvg } from '../components/labelSvg';

const colors = ['#176b4b', '#28748f', '#386b9e', '#4b62a8', '#6957a6', '#8c4f8f', '#a63d65', '#a63d43', '#b5532d', '#a65d17', '#9a7b18', '#718047', '#247b7b', '#47765a', '#6c6f75', '#3f4742'];

function LabelDialog({ label, onClose, onSave }: { label?: Label; onClose: () => void; onSave: (value: { name: string; color: string; icon: LabelIcon }) => Promise<void> }) {
  const [name, setName] = useState(label?.name ?? '');
  const [color, setColor] = useState(label?.color ?? colors[0]!);
  const initialIcon = label?.icon ?? 'tag';
  const [iconMode, setIconMode] = useState<'builtin' | 'emoji' | 'svg'>(initialIcon.startsWith('emoji:') ? 'emoji' : initialIcon.startsWith('svg:') ? 'svg' : 'builtin');
  const [builtinIcon, setBuiltinIcon] = useState<LabelIcon>(initialIcon.startsWith('emoji:') || initialIcon.startsWith('svg:') ? 'tag' : initialIcon);
  const [emoji, setEmoji] = useState(initialIcon.startsWith('emoji:') ? initialIcon.slice(6) : '📌');
  const [svgText, setSvgText] = useState(initialIcon.startsWith('svg:') ? initialIcon.slice(4) : '');
  const [iconQuery, setIconQuery] = useState('');
  const svgFileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) { setError('请输入有效的十六进制颜色'); return; }
    if (iconMode === 'emoji' && !emoji.trim()) { setError('请输入一个 Emoji'); return; }
    let icon: LabelIcon;
    if (iconMode === 'builtin') icon = builtinIcon;
    else if (iconMode === 'emoji') icon = `emoji:${emoji.trim()}`;
    else {
      try { icon = `svg:${normalizeLabelSvg(svgText)}`; } catch (cause) {
        setError(cause instanceof Error ? cause.message : '请粘贴完整的 SVG 标签');
        return;
      }
    }
    setBusy(true);
    try { await onSave({ name: name.trim(), color, icon }); } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败'); setBusy(false); }
  }
  const filteredIcons = labelIconOptions.filter((option) => option.label.includes(iconQuery.trim()));
  return <Dialog title={label ? '编辑标签' : '新建标签'} onClose={onClose} onSubmit={submit} busy={busy}>
    <label className="field"><span>名称</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={48} /></label>
    <fieldset className="field"><legend>颜色</legend>
      <div className="color-grid">{colors.map((value) => <button className={color.toLowerCase() === value.toLowerCase() ? 'color-swatch selected' : 'color-swatch'} type="button" key={value} style={{ background: value }} onClick={() => setColor(value)} aria-label={`选择颜色 ${value}`} />)}</div>
      <div className="custom-color-row"><input className="native-color" type="color" value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#176b4b'} onChange={(event) => setColor(event.target.value)} aria-label="自定义颜色" /><label className="hex-color"><span>#</span><input value={color.replace(/^#/, '')} onChange={(event) => setColor(`#${event.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6)}`)} maxLength={6} aria-label="十六进制颜色" /></label></div>
    </fieldset>
    <fieldset className="field"><legend>图标</legend>
      <div className="icon-mode-tabs" role="tablist" aria-label="图标来源">
        <button type="button" role="tab" aria-selected={iconMode === 'builtin'} className={iconMode === 'builtin' ? 'selected' : ''} onClick={() => setIconMode('builtin')}><Search />内置</button>
        <button type="button" role="tab" aria-selected={iconMode === 'emoji'} className={iconMode === 'emoji' ? 'selected' : ''} onClick={() => setIconMode('emoji')}><Smile />Emoji</button>
        <button type="button" role="tab" aria-selected={iconMode === 'svg'} className={iconMode === 'svg' ? 'selected' : ''} onClick={() => setIconMode('svg')}><FileCode2 />SVG</button>
      </div>
      {iconMode === 'builtin' && <>
        <label className="icon-search"><Search /><input value={iconQuery} onChange={(event) => setIconQuery(event.target.value)} placeholder="搜索图标" /></label>
        <div className="label-icon-grid">{filteredIcons.map((option) => <button className={builtinIcon === option.value ? 'label-icon-option selected' : 'label-icon-option'} type="button" key={option.value} onClick={() => setBuiltinIcon(option.value)} aria-label={`选择图标 ${option.label}`} title={option.label}><option.icon /><span>{option.label}</span></button>)}</div>
      </>}
      {iconMode === 'emoji' && <div className="custom-icon-editor">
        <div className="custom-icon-preview" style={{ color }}><LabelIconView icon={`emoji:${emoji}` as LabelIcon} /></div>
        <label className="field"><span>粘贴或输入 Emoji</span><input value={emoji} onChange={(event) => setEmoji(event.target.value.slice(0, 20))} placeholder="例如：📚" /></label>
      </div>}
      {iconMode === 'svg' && <div className="custom-icon-editor">
        <div className="custom-icon-preview" style={{ color }}>{svgText.trim() ? <LabelIconView icon={`svg:${svgText}` as LabelIcon} /> : <FileCode2 />}</div>
        <label className="field"><span>SVG 标签</span><textarea rows={5} value={svgText} onChange={(event) => setSvgText(event.target.value.slice(0, 20000))} placeholder={'<svg viewBox="0 0 24 24">...</svg>'} /></label>
        <button className="button compact-button" type="button" onClick={() => svgFileRef.current?.click()}><Upload />上传 SVG 文件</button>
        <input ref={svgFileRef} className="sr-only" type="file" accept="image/svg+xml,.svg" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then((text) => setSvgText(text.slice(0, 20000))); event.currentTarget.value = ''; }} />
        <p className="field-hint">可直接粘贴网上复制的完整 SVG。脚本、外部资源和事件属性会自动移除。</p>
      </div>}
    </fieldset>
    {error && <p className="error-banner">{error}</p>}
  </Dialog>;
}

export function LabelsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Label | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Label | null>(null);
  const { data: labels = [], isLoading } = useQuery({ queryKey: ['labels'], queryFn: api.listLabels });
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ['labels'] }); await queryClient.invalidateQueries({ queryKey: ['events'] }); };
  const create = useMutation({ mutationFn: api.createLabel, onSuccess: async () => { setEditing(null); await refresh(); } });
  const update = useMutation({ mutationFn: ({ id, value }: { id: string; value: { name: string; color: string; icon: LabelIcon } }) => api.updateLabel(id, value), onSuccess: async () => { setEditing(null); await refresh(); } });
  const remove = useMutation({ mutationFn: api.deleteLabel, onSuccess: async () => { setDeleting(null); await refresh(); } });

  return <section className="page">
    <header className="page-head"><div><h1>标签</h1><p>管理事件分类</p></div><button className="button primary" onClick={() => setEditing('new')}><Plus />新建标签</button></header>
    {isLoading ? <div className="empty-state">正在加载...</div> : labels.length === 0 ? <div className="empty-state"><h2>还没有标签</h2><button className="button primary" onClick={() => setEditing('new')}><Plus />新建标签</button></div> : <div className="label-list">
      {labels.map((label) => <div className="label-row" key={label.id}>
        <span className="label-name"><span className="label-symbol" style={{ color: label.color }}><LabelIconView icon={label.icon} /></span>{label.name}</span>
        <span className="muted">{label.usageCount} 个事件</span>
        <time className="muted">{new Date(label.createdAt).toLocaleDateString('zh-CN')}</time>
        <div className="row-actions"><button className="icon-button" aria-label={`编辑${label.name}`} data-tooltip="编辑标签" onClick={() => setEditing(label)}><Pencil /></button><button className="icon-button danger" aria-label={`删除${label.name}`} data-tooltip="删除标签" onClick={() => setDeleting(label)}><Trash2 /></button></div>
      </div>)}
    </div>}
    {editing && <LabelDialog label={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSave={(value) => editing === 'new' ? create.mutateAsync(value).then(() => undefined) : update.mutateAsync({ id: editing.id, value }).then(() => undefined)} />}
    {deleting && <Dialog title="删除标签" onClose={() => setDeleting(null)} onSubmit={(event) => { event.preventDefault(); remove.mutate(deleting.id); }} submitLabel="删除标签" destructive busy={remove.isPending}><p>标签“{deleting.name}”将从 {deleting.usageCount} 个事件中移除，事件本身不会删除。</p></Dialog>}
  </section>;
}
