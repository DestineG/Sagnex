import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toBlob } from 'html-to-image';
import { Download, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, downloadBlob, eventStatusText, exportStamp, formatDate } from '../api';
import { EventFormDialog } from '../components/EventFormDialog';
import { EventTagSummary } from '../components/EventTagSummary';
import { MiniGraph } from '../components/MiniGraph';

export function ActivePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const exportRef = useRef<HTMLDivElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const { data: events = [], isLoading } = useQuery({ queryKey: ['events', 'active'], queryFn: () => api.listEvents('?active=true') });
  const { data: labels = [] } = useQuery({ queryKey: ['labels'], queryFn: api.listLabels });
  const createEvent = useMutation({
    mutationFn: api.createEvent,
    onSuccess: async (event) => {
      await queryClient.invalidateQueries({ queryKey: ['events'] });
      setCreateOpen(false);
      navigate(`/events/${event.id}`, { state: { returnTo: '/' } });
    }
  });
  async function createLabel(name: string) {
    const label = await api.createLabel({ name, color: '#176b4b' });
    await queryClient.invalidateQueries({ queryKey: ['labels'] });
    return label;
  }

  async function exportPage() {
    if (!exportRef.current || events.length === 0) return;
    setExporting(true);
    setError('');
    await new Promise(requestAnimationFrame);
    try {
      const blob = await toBlob(exportRef.current, {
        pixelRatio: 2,
        backgroundColor: getComputedStyle(exportRef.current).backgroundColor,
        cacheBust: true
      });
      if (!blob) throw new Error('无法生成图片');
      downloadBlob(`sagnex-active-${exportStamp()}.png`, blob);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导出失败');
    } finally {
      setExporting(false);
    }
  }

  return <section className="page">
    <header className="page-head active-page-head">
      <h1>活跃事件</h1>
      <div className="head-actions">
        <button className="button" type="button" onClick={exportPage} disabled={events.length === 0 || exporting}><Download />{exporting ? '生成中' : '导出快照'}</button>
        <button className="button primary" type="button" onClick={() => setCreateOpen(true)}><Plus />新建事件</button>
      </div>
    </header>
    {error && <p className="page-error">{error}</p>}
    {isLoading ? <div className="empty-state">正在加载...</div> : events.length === 0 ? <div className="empty-state"><h2>没有活跃事件</h2><button className="button primary" onClick={() => setCreateOpen(true)}><Plus />新建事件</button></div> :
      <div ref={exportRef} className={exporting ? 'active-export exporting' : 'active-export'}>
        <div className="snapshot-heading"><strong>SAGNEX · 活跃事件</strong><span>{new Date().toLocaleString('zh-CN')}</span></div>
        <div className="active-grid">
          {events.map((event) => <article className="event-card" key={event.id}>
            <button className="event-card-open" type="button" aria-label={`打开${event.title}`} onClick={() => navigate(`/events/${event.id}`, { state: { returnTo: '/' } })} />
            <div className="event-card-head">
              <div className="event-card-summary">
                <h2>{event.title}</h2>
                <p>{event.description || '暂无简介'}</p>
                <EventTagSummary labels={event.labels} className="event-card-tags" onOpen={() => navigate(`/events/${event.id}`, { state: { returnTo: '/' } })} />
              </div>
              <div className="event-card-progress">
                <span className={`status-badge status-${event.status}`}>{eventStatusText[event.status]}</span>
                <strong>{event.completedTasks} / {event.totalTasks}</strong>
                <span className="progress"><i style={{ width: `${event.totalTasks ? (event.completedTasks / event.totalTasks) * 100 : 0}%` }} /></span>
              </div>
            </div>
            <MiniGraph tasks={event.previewTasks} dependencies={event.previewDependencies} onTaskClick={(taskId) => navigate(`/events/${event.id}?task=${taskId}`, { state: { returnTo: '/' } })} />
            <footer className="event-card-foot"><span>最近更新</span><time>{formatDate(event.updatedAt)}</time></footer>
          </article>)}
        </div>
      </div>}
    {createOpen && <EventFormDialog labels={labels} onClose={() => setCreateOpen(false)} onCreate={(input) => createEvent.mutateAsync(input).then(() => undefined)} onCreateLabel={createLabel} />}
  </section>;
}
