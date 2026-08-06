import type { Label, LabelIcon } from '@sagnex/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCode2, Pencil, Plus, Search, Smile, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { api } from '../api';
import { Dialog } from '../components/Dialog';
import { getLabelDisplayColor, LabelIconView, labelIconOptions } from '../components/LabelIcon';
import { normalizeLabelSvg } from '../components/labelSvg';

const colors = ['#176b4b', '#28748f', '#386b9e', '#4b62a8', '#6957a6', '#8c4f8f', '#a63d65', '#a63d43', '#b5532d', '#a65d17', '#9a7b18', '#718047', '#247b7b', '#47765a', '#6c6f75', '#3f4742'];
const emojiOptions = [
  ['📌', '标记'], ['📚', '阅读'], ['💼', '工作'], ['💻', '开发'], ['📅', '日程'], ['⭐', '重点'],
  ['🏠', '家庭'], ['❤️', '健康'], ['🎓', '学习'], ['🎨', '创作'], ['✈️', '旅行'], ['🛒', '购物'],
  ['🏃', '运动'], ['💡', '想法'], ['🎯', '目标'], ['💰', '财务'], ['🎵', '音乐'], ['📷', '影像'],
  ['👥', '团队'], ['🧪', '实验'], ['📝', '记录'], ['✅', '完成'], ['⚙️', '系统'], ['🔧', '工具'],
  ['📊', '数据'], ['🧭', '方向'], ['🌱', '成长'], ['🔥', '紧急'], ['🎁', '礼物'], ['☕', '生活']
] as const;

function isSingleEmoji(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  const segments = [...new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(text)];
  return segments.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(segments[0]!.segment);
}

function LabelDialog({ label, onClose, onSave }: { label?: Label; onClose: () => void; onSave: (value: { name: string; color: string; icon: LabelIcon }) => Promise<void> }) {
  const [name, setName] = useState(label?.name ?? '');
  const [color, setColor] = useState(label?.color ?? colors[0]!);
  const initialIcon = label?.icon ?? 'tag';
  const [iconMode, setIconMode] = useState<'svg' | 'emoji'>(initialIcon.startsWith('emoji:') ? 'emoji' : 'svg');
  const [svgSource, setSvgSource] = useState<'builtin' | 'custom'>(initialIcon.startsWith('svg:') ? 'custom' : 'builtin');
  const [builtinIcon, setBuiltinIcon] = useState<LabelIcon>(initialIcon.startsWith('emoji:') || initialIcon.startsWith('svg:') ? 'tag' : initialIcon);
  const [emoji, setEmoji] = useState(initialIcon.startsWith('emoji:') ? initialIcon.slice(6) : '📌');
  const [svgText, setSvgText] = useState(initialIcon.startsWith('svg:') ? initialIcon.slice(4) : '');
  const [iconQuery, setIconQuery] = useState('');
  const svgFileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const normalizedSvg = useMemo(() => {
    if (svgSource !== 'custom' || !svgText.trim()) return { value: '', error: '' };
    try {
      return { value: normalizeLabelSvg(svgText), error: '' };
    } catch (cause) {
      return { value: '', error: cause instanceof Error ? cause.message : '请粘贴完整的 SVG 标签' };
    }
  }, [svgSource, svgText]);
  const previewIcon: LabelIcon | null = iconMode === 'emoji'
    ? isSingleEmoji(emoji) ? `emoji:${emoji.trim()}` : null
    : svgSource === 'builtin' ? builtinIcon : normalizedSvg.value ? `svg:${normalizedSvg.value}` : null;
  const previewLabel = { color, icon: previewIcon ?? 'tag' as LabelIcon };
  const invalid = !name.trim() || (iconMode === 'emoji' ? !isSingleEmoji(emoji) : svgSource === 'custom' && !normalizedSvg.value);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      setError('请输入有效的十六进制颜色');
      return;
    }
    let icon: LabelIcon;
    if (iconMode === 'emoji') {
      if (!isSingleEmoji(emoji)) {
        setError('请输入一个完整的 Emoji');
        return;
      }
      icon = `emoji:${emoji.trim()}`;
    } else if (svgSource === 'builtin') {
      icon = builtinIcon;
    } else if (normalizedSvg.value) {
      icon = `svg:${normalizedSvg.value}`;
    } else {
      setError(normalizedSvg.error || '请粘贴完整的 SVG 标签');
      return;
    }
    setBusy(true);
    try {
      await onSave({ name: name.trim(), color, icon });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
      setBusy(false);
    }
  }

  const filteredIcons = labelIconOptions.filter((option) => option.label.includes(iconQuery.trim()));
  return <Dialog title={label ? '编辑标签' : '新建标签'} onClose={onClose} onSubmit={submit} busy={busy} submitDisabled={invalid}>
    <section className="label-dialog-section">
      <p className="label-dialog-title">基本信息</p>
      <label className="field"><span>名称</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={48} /></label>
    </section>

    <section className="label-dialog-section">
      <p className="label-dialog-title">图标</p>
      <div className="icon-mode-tabs two" role="tablist" aria-label="图标类型">
        <button type="button" role="tab" aria-selected={iconMode === 'svg'} className={iconMode === 'svg' ? 'selected' : ''} onClick={() => setIconMode('svg')}><FileCode2 />SVG 图标</button>
        <button type="button" role="tab" aria-selected={iconMode === 'emoji'} className={iconMode === 'emoji' ? 'selected' : ''} onClick={() => setIconMode('emoji')}><Smile />Emoji</button>
      </div>

      {iconMode === 'svg' ? <div className="icon-tab-panel">
        <div className="svg-source-switch" role="group" aria-label="SVG 来源">
          <button type="button" className={svgSource === 'builtin' ? 'selected' : ''} onClick={() => setSvgSource('builtin')}>内置图标</button>
          <button type="button" className={svgSource === 'custom' ? 'selected' : ''} onClick={() => setSvgSource('custom')}>自定义 SVG</button>
        </div>
        {svgSource === 'builtin' ? <>
          <label className="icon-search"><Search /><input value={iconQuery} onChange={(event) => setIconQuery(event.target.value)} placeholder="搜索图标" /></label>
          <div className="label-icon-grid">{filteredIcons.map((option) => <button className={builtinIcon === option.value ? 'label-icon-option selected' : 'label-icon-option'} type="button" key={option.value} onClick={() => setBuiltinIcon(option.value)} aria-label={`选择图标 ${option.label}`} title={option.label}><option.icon /><span>{option.label}</span></button>)}</div>
        </> : <div className="svg-custom-fields">
          <label className="field"><span>SVG 标签</span><textarea rows={5} value={svgText} onChange={(event) => setSvgText(event.target.value.slice(0, 20000))} placeholder={'<svg viewBox="0 0 24 24">...</svg>'} /></label>
          <button className="button compact-button" type="button" onClick={() => svgFileRef.current?.click()}><Upload />上传 SVG 文件</button>
          <input ref={svgFileRef} className="sr-only" type="file" accept="image/svg+xml,.svg" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then((text) => setSvgText(text.slice(0, 20000))); event.currentTarget.value = ''; }} />
          {normalizedSvg.error && <p className="field-error">{normalizedSvg.error}</p>}
        </div>}
        <fieldset className="field color-field">
          <legend>图标颜色</legend>
          <div className="color-grid">{colors.map((value) => <button className={color.toLowerCase() === value.toLowerCase() ? 'color-swatch selected' : 'color-swatch'} type="button" key={value} style={{ background: value }} onClick={() => setColor(value)} aria-label={`选择颜色 ${value}`} />)}</div>
          <div className="custom-color-row"><input className="native-color" type="color" value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#176b4b'} onChange={(event) => setColor(event.target.value)} aria-label="自定义颜色" /><label className="hex-color"><span>#</span><input value={color.replace(/^#/, '')} onChange={(event) => setColor(`#${event.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6)}`)} maxLength={6} aria-label="十六进制颜色" /></label></div>
        </fieldset>
      </div> : <div className="icon-tab-panel">
        <div className="emoji-grid">{emojiOptions.map(([value, emojiLabel]) => <button className={emoji === value ? 'selected' : ''} type="button" key={value} onClick={() => setEmoji(value)} aria-label={`选择 Emoji ${emojiLabel}`} title={emojiLabel}>{value}</button>)}</div>
        <label className="field"><span>自定义 Emoji</span><input value={emoji} onChange={(event) => setEmoji(event.target.value.slice(0, 20))} placeholder="粘贴一个 Emoji" /></label>
        {emoji.trim() && !isSingleEmoji(emoji) && <p className="field-error">请输入一个完整的 Emoji</p>}
      </div>}
    </section>

    <section className="label-dialog-section preview-section">
      <p className="label-dialog-title">结果预览</p>
      <div className="label-result-preview">{previewIcon
        ? <span className="tag label-tag preview-tag" style={{ '--label-color': getLabelDisplayColor(previewLabel) } as CSSProperties}><span className="label-tag-icon"><LabelIconView icon={previewIcon} /></span><span className="tag-name">{name.trim() || '标签名称'}</span></span>
        : <span className="muted">选择有效图标后显示预览</span>}
      </div>
    </section>
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
        <span className="label-name"><span className="label-symbol" style={{ color: getLabelDisplayColor(label) }}><LabelIconView icon={label.icon} /></span>{label.name}</span>
        <span className="muted">{label.usageCount} 个事件</span>
        <time className="muted">{new Date(label.createdAt).toLocaleDateString('zh-CN')}</time>
        <div className="row-actions"><button className="icon-button" aria-label={`编辑${label.name}`} data-tooltip="编辑标签" onClick={() => setEditing(label)}><Pencil /></button><button className="icon-button danger" aria-label={`删除${label.name}`} data-tooltip="删除标签" onClick={() => setDeleting(label)}><Trash2 /></button></div>
      </div>)}
    </div>}
    {editing && <LabelDialog label={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSave={(value) => editing === 'new' ? create.mutateAsync(value).then(() => undefined) : update.mutateAsync({ id: editing.id, value }).then(() => undefined)} />}
    {deleting && <Dialog title="删除标签" onClose={() => setDeleting(null)} onSubmit={(event) => { event.preventDefault(); remove.mutate(deleting.id); }} submitLabel="删除标签" destructive busy={remove.isPending}><p>标签“{deleting.name}”将从 {deleting.usageCount} 个事件中移除，事件本身不会删除。</p></Dialog>}
  </section>;
}
