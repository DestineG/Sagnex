import type { EventGraph, Label, StateChange, Task, TaskStatus } from '@sagnex/contracts';
import dagre from '@dagrejs/dagre';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Background, Controls, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider,
  useEdgesState, useNodesState, useReactFlow, useStore, useViewport,
  type Connection, type Edge, type Node, type NodeProps
} from '@xyflow/react';
import { Archive, ArchiveRestore, ArrowLeft, Ban, Check, CheckCircle2, ChevronDown, Circle, CirclePlay, Download, Eye, FileJson, ImageDown, LayoutTemplate, Maximize2, Pause, PauseCircle, Play, Plus, RotateCcw, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, api, downloadBlob, downloadJson, eventStatusText, exportStamp, formatDate, formatStatusDate, taskStatusText } from '../api';
import { Dialog } from '../components/Dialog';
import { graphPngBlob } from '../components/GraphSvg';
import { LabelPicker } from '../components/LabelPicker';

type TaskNodeData = { title: string; description: string; status: TaskStatus; statusChangedAt: string; archived: boolean };
type TaskFlowNode = Node<TaskNodeData, 'task'>;

function TaskNode({ data, selected }: NodeProps<TaskFlowNode>) {
  const StatusIcon = {
    not_started: Circle,
    in_progress: CirclePlay,
    paused: PauseCircle,
    completed: CheckCircle2,
    voided: Ban
  }[data.status];
  return <div className={`task-node status-${data.status} ${selected ? 'selected' : ''}`}>
    {!data.archived && <Handle type="target" position={Position.Left} />}
    <strong>{data.title}</strong>{data.description && <p>{data.description}</p>}<span className="task-node-foot"><span><StatusIcon />{taskStatusText[data.status]}</span><time>{formatStatusDate(data.statusChangedAt)}</time></span>
    {!data.archived && <Handle type="source" position={Position.Right} />}
  </div>;
}

const nodeTypes = { task: TaskNode };
const FLOW_NODE_WIDTH = 220;
const FLOW_NODE_HEIGHT = 124;

function CanvasMiniMap({ nodes, edges }: { nodes: TaskFlowNode[]; edges: Edge[] }) {
  const viewport = useViewport();
  const canvas = useStore((state) => ({ width: state.width, height: state.height }));
  const { setCenter } = useReactFlow();
  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  if (nodes.length === 0) return null;
  const padding = 45;
  const minX = Math.min(...nodes.map((node) => node.position.x)) - padding;
  const minY = Math.min(...nodes.map((node) => node.position.y)) - padding;
  const maxX = Math.max(...nodes.map((node) => node.position.x + FLOW_NODE_WIDTH)) + padding;
  const maxY = Math.max(...nodes.map((node) => node.position.y + FLOW_NODE_HEIGHT)) + padding;
  const bounds = { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
  const viewportRatio = clamp(0.46 / viewport.zoom, 0.22, 0.72);
  const viewportWidth = bounds.width * viewportRatio;
  const viewportHeight = bounds.height * viewportRatio;
  const centerX = (canvas.width / 2 - viewport.x) / viewport.zoom;
  const centerY = (canvas.height / 2 - viewport.y) / viewport.zoom;
  const viewportX = clamp(centerX - viewportWidth / 2, minX, maxX - viewportWidth);
  const viewportY = clamp(centerY - viewportHeight / 2, minY, maxY - viewportHeight);
  const viewportStroke = Math.max(bounds.width / 115, bounds.height / 75);
  const focusAtPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = bounds.x + ((event.clientX - box.left) / box.width) * bounds.width;
    const y = bounds.y + ((event.clientY - box.top) / box.height) * bounds.height;
    void setCenter(x, y, { zoom: viewport.zoom, duration: event.type === 'pointerdown' ? 160 : 0 });
  };
  return <div className="canvas-minimap">
    <svg
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-label="画布缩略图"
      role="img"
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); focusAtPointer(event); }}
      onPointerMove={(event) => { if (event.buttons === 1) focusAtPointer(event); }}
    >
      <rect className="canvas-minimap-bg" x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} />
      {edges.map((edge) => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) return null;
        const sx = source.position.x + FLOW_NODE_WIDTH;
        const sy = source.position.y + FLOW_NODE_HEIGHT / 2;
        const tx = target.position.x;
        const ty = target.position.y + FLOW_NODE_HEIGHT / 2;
        const bend = Math.max(30, Math.abs(tx - sx) * 0.42);
        return <path className="canvas-minimap-edge" key={edge.id} d={`M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx} ${ty}`} />;
      })}
      {nodes.map((node) => <rect
        key={node.id}
        className={`canvas-minimap-node status-${node.data.status}`}
        x={node.position.x}
        y={node.position.y}
        width={FLOW_NODE_WIDTH}
        height={FLOW_NODE_HEIGHT}
        rx="7"
      />)}
      <rect data-testid="minimap-viewport" className="canvas-minimap-viewport" x={viewportX} y={viewportY} width={viewportWidth} height={viewportHeight} rx="4" strokeWidth={viewportStroke} />
    </svg>
  </div>;
}

function TaskDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (value: { title: string; description: string }) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try { await onCreate({ title: title.trim(), description: description.trim() }); } catch (cause) { setError(cause instanceof Error ? cause.message : '创建失败'); setBusy(false); }
  }
  return <Dialog title="新建任务" onClose={onClose} onSubmit={submit} submitLabel="添加到画布" busy={busy}>
    <label className="field"><span>标题</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="任务名称" /></label>
    <label className="field"><span>简介</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={2000} placeholder="可选" /></label>
    {error && <p className="error-banner">{error}</p>}
  </Dialog>;
}

function EventInspector({ graph, labels, onUpdate }: { graph: EventGraph; labels: Label[]; onUpdate: (value: { title?: string; description?: string; labelIds?: string[] }) => void }) {
  const [title, setTitle] = useState(graph.title);
  const [description, setDescription] = useState(graph.description);
  useEffect(() => {
    if (graph.archivedAt || (title === graph.title && description === graph.description) || !title.trim()) return;
    const timer = window.setTimeout(() => onUpdate({ title: title.trim(), description }), 600);
    return () => window.clearTimeout(timer);
  }, [description, graph.archivedAt, graph.description, graph.title, onUpdate, title]);
  const selectedLabels = graph.labels.map((label) => label.id);
  return <div className="inspector-content">
    <section><p className="inspector-label">事件</p><label className="field compact"><span>标题</span><input value={title} onChange={(event) => setTitle(event.target.value)} disabled={Boolean(graph.archivedAt)} /></label><label className="field compact"><span>简介</span><textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} disabled={Boolean(graph.archivedAt)} /></label></section>
    <section><p className="inspector-label">标签</p><LabelPicker labels={labels} selectedIds={selectedLabels} onChange={(labelIds) => onUpdate({ labelIds })} disabled={Boolean(graph.archivedAt)} /></section>
    <section><p className="inspector-label">进度</p><strong>{graph.completedTasks} / {graph.totalTasks}</strong><span className="progress wide"><i style={{ width: `${graph.totalTasks ? (graph.completedTasks / graph.totalTasks) * 100 : 0}%` }} /></span></section>
  </div>;
}

function TaskInspector({ graph, task, history, onUpdate, onTransition, onDelete, onRestore }: {
  graph: EventGraph;
  task: Task;
  history: StateChange[];
  onUpdate: (value: { title?: string; description?: string }) => void;
  onTransition: (status: TaskStatus) => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  useEffect(() => {
    if (graph.archivedAt || task.status === 'voided' || !title.trim() || (title === task.title && description === task.description)) return;
    const timer = window.setTimeout(() => onUpdate({ title: title.trim(), description }), 600);
    return () => window.clearTimeout(timer);
  }, [description, graph.archivedAt, onUpdate, task.description, task.status, task.title, title]);
  const incoming = graph.dependencies.filter((edge) => edge.targetTaskId === task.id).map((edge) => graph.tasks.find((candidate) => candidate.id === edge.sourceTaskId)).filter(Boolean) as Task[];
  const voidChange = history.find((change) => change.toStatus === 'voided');
  return <div className="inspector-content">
    <section><p className="inspector-label">任务</p><label className="field compact"><span>标题</span><input value={title} onChange={(event) => setTitle(event.target.value)} disabled={Boolean(graph.archivedAt) || task.status === 'voided'} /></label><label className="field compact"><span>简介</span><textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} disabled={Boolean(graph.archivedAt) || task.status === 'voided'} /></label></section>
    <section><p className="inspector-label">状态</p><strong>{taskStatusText[task.status]}</strong>{!graph.archivedAt && <div className="task-actions">
      {task.status === 'not_started' && <button className="button primary" onClick={() => onTransition('in_progress')}><Play />开始</button>}
      {task.status === 'in_progress' && <><button className="button" onClick={() => onTransition('paused')}><Pause />暂停</button><button className="button primary" onClick={() => onTransition('completed')}><Check />完成</button></>}
      {task.status === 'paused' && <><button className="button" onClick={() => onTransition('in_progress')}><Play />继续</button><button className="button primary" onClick={() => onTransition('completed')}><Check />完成</button></>}
      {task.status === 'completed' && <button className="button" onClick={() => onTransition('in_progress')}><Play />重新打开</button>}
      {task.status === 'voided' && voidChange && <button className="button primary" onClick={onRestore}><RotateCcw />恢复到{taskStatusText[voidChange.fromStatus]}</button>}
    </div>}</section>
    <section><p className="inspector-label">前置任务</p>{incoming.length ? <div className="dependency-list">{incoming.map((item) => <span key={item.id}>{item.title}<i>{taskStatusText[item.status]}</i></span>)}</div> : <p className="muted">无</p>}</section>
    <section><p className="inspector-label">状态历史</p>{history.length ? <div className="history-list">{history.map((change) => <div key={change.id}><i /><span>{taskStatusText[change.fromStatus]} → {taskStatusText[change.toStatus]}<time>{formatDate(change.changedAt)}</time></span></div>)}</div> : <p className="muted">尚无状态变化</p>}</section>
    {!graph.archivedAt && task.status !== 'voided' && <section><button className="button danger-text" onClick={onDelete}><Trash2 />{history.length === 0 && task.status === 'not_started' ? '删除任务' : '作废任务'}</button></section>}
  </div>;
}

function Editor({ graph, labels, onExportJson, onArchive, onRestoreEvent }: { graph: EventGraph; labels: Label[]; onExportJson: () => void; onArchive: () => void; onRestoreEvent: () => void }) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTaskId = searchParams.get('task');
  const [showVoided, setShowVoided] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(() => window.matchMedia('(min-width: 761px)').matches);
  const [viewOpen, setViewOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [taskDialog, setTaskDialog] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const { fitView } = useReactFlow();
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['event', graph.id] });
    await queryClient.invalidateQueries({ queryKey: ['events'] });
  };
  const visibleTasks = useMemo(() => graph.tasks.filter((task) => showVoided || task.status !== 'voided'), [graph.tasks, showVoided]);
  const visibleIds = useMemo(() => new Set(visibleTasks.map((task) => task.id)), [visibleTasks]);
  const visibleDependencies = useMemo(() => graph.dependencies.filter((edge) => visibleIds.has(edge.sourceTaskId) && visibleIds.has(edge.targetTaskId)), [graph.dependencies, visibleIds]);
  const mappedNodes = useMemo<TaskFlowNode[]>(() => visibleTasks.map((task) => ({ id: task.id, type: 'task', position: { x: task.positionX, y: task.positionY }, data: { title: task.title, description: task.description, status: task.status, statusChangedAt: task.statusChangedAt, archived: Boolean(graph.archivedAt) } })), [graph.archivedAt, visibleTasks]);
  const mappedEdges = useMemo<Edge[]>(() => visibleDependencies.map((edge) => ({ id: edge.id, source: edge.sourceTaskId, target: edge.targetTaskId, markerEnd: { type: MarkerType.ArrowClosed }, animated: false })), [visibleDependencies]);
  const [nodes, setNodes, onNodesChange] = useNodesState<TaskFlowNode>(mappedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(mappedEdges);
  useEffect(() => setNodes(mappedNodes), [mappedNodes, setNodes]);
  useEffect(() => setNodes((current) => current.map((node) => ({ ...node, selected: node.id === selectedTaskId }))), [mappedNodes, selectedTaskId, setNodes]);
  useEffect(() => setEdges(mappedEdges), [mappedEdges, setEdges]);
  useEffect(() => { if (selectedTaskId) window.setTimeout(() => void fitView({ nodes: [{ id: selectedTaskId }], padding: 1.2, duration: 250, maxZoom: 1.25 }), 50); }, [fitView, selectedTaskId]);

  const selectedTask = graph.tasks.find((task) => task.id === selectedTaskId);
  const { data: history = [] } = useQuery({ queryKey: ['task-history', selectedTaskId], queryFn: () => api.getTaskHistory(selectedTaskId!), enabled: Boolean(selectedTaskId) });
  const createTask = useMutation({ mutationFn: (value: { title: string; description: string }) => api.createTask(graph.id, { ...value, positionX: 80 + (graph.tasks.length % 4) * 245, positionY: 100 + Math.floor(graph.tasks.length / 4) * 155 }), onSuccess: async (task) => { setTaskDialog(false); await refresh(); setSearchParams({ task: task.id }); } });
  const updateEvent = useMutation({ mutationFn: (value: { title?: string; description?: string; labelIds?: string[] }) => api.updateEvent(graph.id, value), onSuccess: refresh, onError: (cause) => setError(cause.message) });
  const updateTask = useMutation({ mutationFn: ({ id, value }: { id: string; value: { title?: string; description?: string } }) => api.updateTask(id, value), onSuccess: refresh, onError: (cause) => setError(cause.message) });
  const transition = useMutation({ mutationFn: ({ id, status, confirmed = false }: { id: string; status: TaskStatus; confirmed?: boolean }) => api.transitionTask(id, status, confirmed), onSuccess: async () => { await refresh(); if (selectedTaskId) await queryClient.invalidateQueries({ queryKey: ['task-history', selectedTaskId] }); }, onError: async (cause, variables) => {
    if (cause instanceof ApiError && cause.details?.code === 'SOFT_DEPENDENCY_CONFIRMATION') {
      const names = cause.details.tasks.map((task: Task) => task.title).join('、');
      if (window.confirm(`前置任务“${names}”尚未完成，仍要开始吗？`)) transition.mutate({ ...variables, confirmed: true });
    } else setError(cause.message);
  } });
  const restoreTask = useMutation({ mutationFn: ({ id, confirmed = false }: { id: string; confirmed?: boolean }) => api.restoreTask(id, confirmed), onSuccess: async () => { await refresh(); if (selectedTaskId) await queryClient.invalidateQueries({ queryKey: ['task-history', selectedTaskId] }); }, onError: (cause, variables) => {
    if (cause instanceof ApiError && cause.details?.code === 'SOFT_DEPENDENCY_CONFIRMATION') {
      const names = cause.details.tasks.map((task: Task) => task.title).join('、');
      if (window.confirm(`恢复后任务将继续进行，但前置任务“${names}”尚未完成，仍要恢复吗？`)) restoreTask.mutate({ ...variables, confirmed: true });
    } else setError(cause.message);
  } });
  const removeTask = useMutation({ mutationFn: api.deleteTask, onSuccess: async (_result, taskId) => { await queryClient.invalidateQueries({ queryKey: ['task-history', taskId] }); setSearchParams({}); await refresh(); }, onError: (cause) => setError(cause.message) });
  const createDependency = useMutation({ mutationFn: (connection: Connection) => api.createDependency(graph.id, { sourceTaskId: connection.source!, targetTaskId: connection.target! }), onSuccess: refresh, onError: (cause) => setError(cause.message) });
  const deleteDependency = useMutation({ mutationFn: api.deleteDependency, onSuccess: refresh, onError: (cause) => setError(cause.message) });

  async function saveLayout(nextNodes: TaskFlowNode[]) {
    const queryKey = ['event', graph.id] as const;
    const previous = queryClient.getQueryData<EventGraph>(queryKey);
    const positions = new Map(nextNodes.map((node) => [node.id, node.position]));
    queryClient.setQueryData<EventGraph>(queryKey, (current) => current ? {
      ...current,
      tasks: current.tasks.map((task) => {
        const position = positions.get(task.id);
        return position ? { ...task, positionX: position.x, positionY: position.y } : task;
      })
    } : current);
    try {
      await api.updateLayout(graph.id, { positions: nextNodes.map((node) => ({ taskId: node.id, positionX: node.position.x, positionY: node.position.y })) });
    } catch (cause) {
      queryClient.setQueryData(queryKey, previous);
      throw cause;
    }
  }
  function autoLayout() {
    const layout = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    layout.setGraph({ rankdir: 'LR', ranksep: 100, nodesep: 60 });
    nodes.forEach((node) => layout.setNode(node.id, { width: FLOW_NODE_WIDTH, height: FLOW_NODE_HEIGHT }));
    edges.forEach((edge) => layout.setEdge(edge.source, edge.target));
    dagre.layout(layout);
    const next = nodes.map((node) => { const point = layout.node(node.id); return { ...node, position: { x: point.x - FLOW_NODE_WIDTH / 2, y: point.y - FLOW_NODE_HEIGHT / 2 } }; });
    setNodes(next);
    void saveLayout(next).then(refresh).then(() => fitView({ padding: 0.25, duration: 300, maxZoom: 1.2 })).catch((cause: Error) => setError(cause.message));
  }
  async function exportCanvas() {
    setExporting(true);
    setError('');
    try {
      const blob = await graphPngBlob(visibleTasks, visibleDependencies);
      downloadBlob(`sagnex-${graph.title}-${exportStamp()}.png`, blob);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导出失败');
    } finally {
      setExporting(false);
    }
  }

  return <div className="editor-shell">
    <div className="editor-commandbar">
      <div className="commandbar-group">
        {!graph.archivedAt && <button className="button primary" onClick={() => setTaskDialog(true)}><Plus />任务</button>}
        {!graph.archivedAt && <button className="button" onClick={autoLayout}><LayoutTemplate />自动布局</button>}
        <button className="button" onClick={() => void fitView({ padding: 0.25, duration: 250, maxZoom: 1.2 })}><Maximize2 />适配视图</button>
      </div>
      <span className="commandbar-divider" />
      <div className="command-menu-wrap">
        <button className={viewOpen ? 'button active' : 'button'} onClick={() => { setViewOpen((value) => !value); setExportOpen(false); }} aria-expanded={viewOpen}><SlidersHorizontal />视图<ChevronDown /></button>
        {viewOpen && <div className="command-menu">
          <button type="button" onClick={() => setShowMiniMap((value) => !value)}><span className="menu-check">{showMiniMap && <Check />}</span><Eye />显示缩略图</button>
          <button type="button" onClick={() => setShowVoided((value) => !value)}><span className="menu-check">{showVoided && <Check />}</span><Ban />显示作废任务</button>
        </div>}
      </div>
      <div className="command-menu-wrap">
        <button className={exportOpen ? 'button active' : 'button'} onClick={() => { setExportOpen((value) => !value); setViewOpen(false); }} aria-expanded={exportOpen}><Download />导出<ChevronDown /></button>
        {exportOpen && <div className="command-menu">
          <button type="button" disabled={exporting} onClick={() => { void exportCanvas(); setExportOpen(false); }}><ImageDown />画布 PNG</button>
          <button type="button" onClick={() => { onExportJson(); setExportOpen(false); }}><FileJson />事件 JSON</button>
        </div>}
      </div>
      <div className="commandbar-spacer" />
      {graph.archivedAt
        ? <button className="button" type="button" onClick={onRestoreEvent}><ArchiveRestore />恢复事件</button>
        : <button className="button" type="button" onClick={onArchive}><Archive />归档事件</button>}
    </div>
    <div className="editor-body">
    <div className="flow-column">
      {error && <div className="canvas-error"><span>{error}</span><button onClick={() => setError('')} aria-label="关闭">×</button></div>}
      <div className="flow-canvas">
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onNodeClick={(_event, node) => setSearchParams({ task: node.id })}
          onPaneClick={() => setSearchParams({})}
          onNodeDragStop={(_event, node) => void saveLayout([{ ...node } as TaskFlowNode]).catch((cause: Error) => setError(cause.message))}
          onConnect={(connection) => createDependency.mutate(connection)}
          onEdgesDelete={(removed) => removed.forEach((edge) => deleteDependency.mutate(edge.id))}
          nodesDraggable={!graph.archivedAt} nodesConnectable={!graph.archivedAt}
          edgesFocusable={!graph.archivedAt} deleteKeyCode={graph.archivedAt ? null : ['Backspace', 'Delete']}
          fitView fitViewOptions={{ padding: 0.22, maxZoom: 1.2 }} minZoom={0.25} maxZoom={1.6} proOptions={{ hideAttribution: true }}
        ><Background gap={20} size={1} /><Controls showInteractive={false} />{showMiniMap && <CanvasMiniMap nodes={nodes} edges={edges} />}</ReactFlow>
      </div>
    </div>
    <aside className="inspector">
      {selectedTask ? <TaskInspector key={selectedTask.id} graph={graph} task={selectedTask} history={history} onUpdate={(value) => updateTask.mutate({ id: selectedTask.id, value })} onTransition={(status) => transition.mutate({ id: selectedTask.id, status })} onRestore={() => restoreTask.mutate({ id: selectedTask.id })} onDelete={() => { if (window.confirm(history.length || selectedTask.status !== 'not_started' ? '该任务将作废并从默认画布隐藏，继续吗？' : '永久删除这个未推进任务？')) removeTask.mutate(selectedTask.id); }} /> : <EventInspector key={graph.id} graph={graph} labels={labels} onUpdate={(value) => updateEvent.mutate(value)} />}
    </aside>
    {taskDialog && <TaskDialog onClose={() => setTaskDialog(false)} onCreate={(value) => createTask.mutateAsync(value).then(() => undefined)} />}
    <div className="sr-only" aria-live="polite">{updateEvent.isPending || updateTask.isPending ? '正在保存' : '已保存'}</div>
    </div>
  </div>;
}

export function EventEditorPage() {
  const { eventId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: graph, isLoading, error } = useQuery({ queryKey: ['event', eventId], queryFn: () => api.getEvent(eventId), enabled: Boolean(eventId) });
  const { data: labels = [] } = useQuery({ queryKey: ['labels'], queryFn: api.listLabels });
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ['event', eventId] }); await queryClient.invalidateQueries({ queryKey: ['events'] }); };
  const archive = useMutation({ mutationFn: () => api.archiveEvent(eventId), onSuccess: refresh });
  const restore = useMutation({ mutationFn: () => api.restoreEvent(eventId), onSuccess: refresh });
  async function exportEventJson() { if (graph) downloadJson(`sagnex-${graph.title}-${exportStamp()}.json`, await api.exportEvent(graph.id)); }
  if (isLoading) return <div className="empty-state">正在加载事件...</div>;
  if (error || !graph) return <div className="empty-state"><h2>无法打开事件</h2><p>{error?.message}</p><button className="button" onClick={() => navigate('/events')}>返回事件列表</button></div>;
  return <section className="editor-page">
    <header className="editor-head">
      <button className="icon-button" onClick={() => navigate('/')} aria-label="返回活跃事件" data-tooltip="返回活跃事件"><ArrowLeft /></button>
      <div className="editor-heading"><h1>{graph.title}</h1><p>{graph.labels.map((label) => label.name).join(' · ') || '未分类'}</p></div>
      <span className={`status-badge status-${graph.status}`}>{eventStatusText[graph.status]}</span>
      <span className="save-state">自动保存</span>
    </header>
    <div className={graph.archivedAt ? 'editor-workspace archived' : 'editor-workspace'}>
      {graph.archivedAt && <div className="archive-banner">该事件已归档，恢复后才能编辑。</div>}
      <ReactFlowProvider><Editor graph={graph} labels={labels} onExportJson={() => void exportEventJson()} onArchive={() => archive.mutate()} onRestoreEvent={() => restore.mutate()} /></ReactFlowProvider>
    </div>
  </section>;
}
