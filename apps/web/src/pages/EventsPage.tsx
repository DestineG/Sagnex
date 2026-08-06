import type { EventStatus } from '@sagnex/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, MoreHorizontal, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, eventStatusText, formatDate } from '../api';
import { Dialog } from '../components/Dialog';
import { EventFormDialog } from '../components/EventFormDialog';
import { EventTagSummary } from '../components/EventTagSummary';
import { LabelPicker } from '../components/LabelPicker';

type StatusFilter = 'all' | EventStatus | 'archived';

export function EventsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [labelId, setLabelId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const { data: allEvents = [], isLoading } = useQuery({ queryKey: ['events', 'all'], queryFn: () => api.listEvents() });
  const { data: labels = [] } = useQuery({ queryKey: ['labels'], queryFn: api.listLabels });
  const events = useMemo(() => allEvents.filter((event) => {
    if (status === 'archived' ? !event.archivedAt : event.archivedAt) return false;
    if (status !== 'all' && status !== 'archived' && event.status !== status) return false;
    if (labelId && !event.labels.some((label) => label.id === labelId)) return false;
    const haystack = `${event.title} ${event.description} ${event.labels.map((label) => label.name).join(' ')}`.toLocaleLowerCase();
    return haystack.includes(search.trim().toLocaleLowerCase());
  }), [allEvents, labelId, search, status]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['events'] });
  const createEvent = useMutation({ mutationFn: api.createEvent, onSuccess: async (event) => { await refresh(); setCreateOpen(false); navigate(`/events/${event.id}`, { state: { returnTo: '/events' } }); } });
  const archiveEvent = useMutation({ mutationFn: api.archiveEvent, onSuccess: refresh });
  const restoreEvent = useMutation({ mutationFn: api.restoreEvent, onSuccess: refresh });
  const deleteEvent = useMutation({ mutationFn: api.deleteEvent, onSuccess: async () => { setDeleteTarget(null); await refresh(); } });
  async function createLabel(name: string) {
    const label = await api.createLabel({ name, color: '#176b4b' });
    await queryClient.invalidateQueries({ queryKey: ['labels'] });
    return label;
  }

  return <section className="page">
    <header className="page-head"><div><h1>全部事件</h1><p>{allEvents.length} 个事件</p></div><button className="button primary" onClick={() => setCreateOpen(true)}><Plus />新建事件</button></header>
    <div className="filter-bar">
      <label className="search-box"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索标题、简介或标签" /></label>
      <div className="segmented" aria-label="状态筛选">
        {([['all','全部'],['creating','创建中'],['ready','待开始'],['in_progress','进行中'],['paused','已暂停'],['awaiting_progress','待推进'],['completed','已完成'],['archived','已归档']] as const).map(([value, label]) => <button key={value} type="button" className={status === value ? 'selected' : ''} onClick={() => setStatus(value)}>{label}</button>)}
      </div>
      <div className="filter-label-picker"><LabelPicker labels={labels} selectedIds={labelId ? [labelId] : []} onChange={(ids) => setLabelId(ids.at(-1) ?? '')} ariaLabel="标签筛选" placeholder="全部标签" /></div>
    </div>
    {isLoading ? <div className="empty-state">正在加载...</div> : events.length === 0 ? <div className="empty-state">没有符合条件的事件</div> : <div className="event-tile-grid">
      {events.map((event) => <article className="event-tile" key={event.id} tabIndex={0} onClick={() => navigate(`/events/${event.id}`, { state: { returnTo: '/events' } })} onKeyDown={(keyEvent) => { if (keyEvent.key === 'Enter' && keyEvent.target === keyEvent.currentTarget) navigate(`/events/${event.id}`, { state: { returnTo: '/events' } }); }}>
        <header className="event-tile-head"><strong>{event.title}</strong><span className={`status-badge status-${event.status}`}>{eventStatusText[event.status]}</span></header>
        <p className="event-tile-description">{event.description || '暂无简介'}</p>
        <EventTagSummary labels={event.labels} className="event-tile-tags" />
        <footer className="event-tile-foot">
          <span>{event.completedTasks} / {event.totalTasks}</span>
          <span className="progress"><i style={{ width: `${event.totalTasks ? (event.completedTasks / event.totalTasks) * 100 : 0}%` }} /></span>
          <time>{formatDate(event.updatedAt)}</time>
          {event.archivedAt ? <details className="event-actions-menu" onClick={(click) => click.stopPropagation()}>
            <summary role="button" aria-label="事件操作" title="事件操作"><MoreHorizontal /></summary>
            <div className="event-actions-popover">
              <button type="button" onClick={() => restoreEvent.mutate(event.id)}><ArchiveRestore />恢复事件</button>
              <button className="danger" type="button" onClick={() => setDeleteTarget({ id: event.id, title: event.title })}><Trash2 />永久删除</button>
            </div>
          </details> : <button className="icon-button event-archive-button" type="button" aria-label={`归档${event.title}`} data-tooltip="归档事件" onClick={(click) => { click.stopPropagation(); archiveEvent.mutate(event.id); }}><Archive /></button>}
        </footer>
      </article>)}
    </div>}
    {createOpen && <EventFormDialog labels={labels} onClose={() => setCreateOpen(false)} onCreate={(input) => createEvent.mutateAsync(input).then(() => undefined)} onCreateLabel={createLabel} />}
    {deleteTarget && <Dialog title="永久删除事件" onClose={() => setDeleteTarget(null)} onSubmit={(event) => { event.preventDefault(); deleteEvent.mutate(deleteTarget.id); }} submitLabel="永久删除" destructive busy={deleteEvent.isPending}><p>“{deleteTarget.title}”及其任务和历史记录将永久删除，无法恢复。</p></Dialog>}
  </section>;
}
