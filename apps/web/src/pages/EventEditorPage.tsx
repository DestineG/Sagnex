import type { CopyEventInput, EventGraph, Label, StateChange, Task, TaskComment, TaskStatus } from '@sagnex/contracts';
import dagre from '@dagrejs/dagre';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Background, Controls, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider,
  useEdgesState, useNodesState, useReactFlow, useViewport,
  type Connection, type Edge, type Node, type NodeProps
} from '@xyflow/react';
import { Archive, ArchiveRestore, ArrowLeft, Check, CheckCircle2, ChevronDown, Circle, CirclePlay, Copy, Download, FileJson, ImageDown, LayoutTemplate, Maximize2, MoreHorizontal, Pause, PauseCircle, Play, Plus, Send, Trash2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, api, downloadBlob, downloadJson, eventStatusText, exportStamp, formatDate, formatStatusDate, taskStatusText } from '../api';
import { CopyEventDialog } from '../components/CopyEventDialog';
import { Dialog } from '../components/Dialog';
import { EmojiTextInput } from '../components/EmojiTextInput';
import { graphPngBlob } from '../components/GraphSvg';
import { LabelPicker } from '../components/LabelPicker';
import { createMiniMapBounds, expandMiniMapBounds, type WorldBounds } from '../components/canvasMiniMapGeometry';
import { findFreeTaskPosition, FLOW_NODE_HEIGHT, FLOW_NODE_WIDTH } from '../components/taskNodeGeometry';

type TaskNodeData = { title: string; description: string; status: TaskStatus; statusChangedAt: string; archived: boolean };
type TaskFlowNode = Node<TaskNodeData, 'task'>;

function TaskNode({ data, selected }: NodeProps<TaskFlowNode>) {
  const StatusIcon = {
    not_started: Circle,
    in_progress: CirclePlay,
    paused: PauseCircle,
    completed: CheckCircle2
  }[data.status];
  return <div className={`task-node status-${data.status} ${selected ? 'selected' : ''}`}>
    {!data.archived && <Handle type="target" position={Position.Left} />}
    <strong>{data.title}</strong>{data.description && <p>{data.description}</p>}<span className="task-node-foot"><span><StatusIcon />{taskStatusText[data.status]}</span><time>{formatStatusDate(data.statusChangedAt)}</time></span>
    {!data.archived && <Handle type="source" position={Position.Right} />}
  </div>;
}

const nodeTypes = { task: TaskNode };
const miniMapColors: Record<TaskStatus, string> = {
  not_started: '#dce4df',
  in_progress: '#78c7a4',
  paused: '#e8b46f',
  completed: '#83bdca'
};
const miniMapStrokes: Record<TaskStatus, string> = {
  not_started: '#68766e',
  in_progress: '#137a55',
  paused: '#a85e12',
  completed: '#28748f'
};
const MINI_MAP_WIDTH = 220;
const MINI_MAP_HEIGHT = 140;
const MINI_MAP_PADDING = 12;
const MINI_MAP_ASPECT_RATIO = (MINI_MAP_WIDTH - MINI_MAP_PADDING * 2) / (MINI_MAP_HEIGHT - MINI_MAP_PADDING * 2);

function CanvasMiniMap({ nodes, edges, canvasWidth, canvasHeight }: { nodes: TaskFlowNode[]; edges: Edge[]; canvasWidth: number; canvasHeight: number }) {
  const viewport = useViewport();
  const { setViewport } = useReactFlow();
  const [worldBounds, setWorldBounds] = useState<WorldBounds | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragSnapshot = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startViewport: typeof viewport;
    scale: number;
    mode: 'viewport' | 'recenter';
    moved: boolean;
  } | null>(null);
  const visible = useMemo(() => ({
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    width: Math.max(1, canvasWidth / viewport.zoom),
    height: Math.max(1, canvasHeight / viewport.zoom)
  }), [canvasHeight, canvasWidth, viewport.x, viewport.y, viewport.zoom]);
  const visibleRef = useRef(visible);
  const graphBounds = useMemo<WorldBounds | null>(() => nodes.length > 0 ? {
    minX: Math.min(...nodes.map((node) => node.position.x)),
    minY: Math.min(...nodes.map((node) => node.position.y)),
    maxX: Math.max(...nodes.map((node) => node.position.x + FLOW_NODE_WIDTH)),
    maxY: Math.max(...nodes.map((node) => node.position.y + FLOW_NODE_HEIGHT))
  } : null, [nodes]);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);
  useEffect(() => {
    if (canvasWidth <= 1 || canvasHeight <= 1) return;
    const frame = window.requestAnimationFrame(() => {
      const latestVisible = visibleRef.current;
      setWorldBounds((current) => current
        ? expandMiniMapBounds(current, graphBounds, latestVisible.width, latestVisible.height, MINI_MAP_ASPECT_RATIO)
        : createMiniMapBounds(latestVisible, graphBounds, MINI_MAP_ASPECT_RATIO));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [canvasHeight, canvasWidth, graphBounds, visible.height, visible.width]);

  const geometry = useMemo(() => {
    if (!worldBounds) return null;
    const worldWidth = Math.max(1, worldBounds.maxX - worldBounds.minX);
    const worldHeight = Math.max(1, worldBounds.maxY - worldBounds.minY);
    const innerWidth = MINI_MAP_WIDTH - MINI_MAP_PADDING * 2;
    const innerHeight = MINI_MAP_HEIGHT - MINI_MAP_PADDING * 2;
    const scale = Math.min(innerWidth / worldWidth, innerHeight / worldHeight);
    const offsetX = MINI_MAP_PADDING + (innerWidth - worldWidth * scale) / 2 - worldBounds.minX * scale;
    const offsetY = MINI_MAP_PADDING + (innerHeight - worldHeight * scale) / 2 - worldBounds.minY * scale;
    const mapX = (value: number) => value * scale + offsetX;
    const mapY = (value: number) => value * scale + offsetY;
    return {
      visible,
      scale,
      offsetX,
      offsetY,
      viewportRect: {
        x: mapX(visible.x),
        y: mapY(visible.y),
        width: visible.width * scale,
        height: visible.height * scale
      },
      mapX,
      mapY
    };
  }, [visible, worldBounds]);
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  if (!geometry) return null;
  const activeGeometry = geometry;

  function pointerToSvg(event: ReactPointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * MINI_MAP_WIDTH / bounds.width,
      y: (event.clientY - bounds.top) * MINI_MAP_HEIGHT / bounds.height
    };
  }

  function recenterViewport(event: ReactPointerEvent<SVGSVGElement>) {
    const point = pointerToSvg(event);
    const worldX = (point.x - activeGeometry.offsetX) / activeGeometry.scale;
    const worldY = (point.y - activeGeometry.offsetY) / activeGeometry.scale;
    void setViewport({
      x: canvasWidth / 2 - worldX * viewport.zoom,
      y: canvasHeight / 2 - worldY * viewport.zoom,
      zoom: viewport.zoom
    }, { duration: 180 });
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    const point = pointerToSvg(event);
    const frame = activeGeometry.viewportRect;
    const insideFrame = point.x >= frame.x && point.x <= frame.x + frame.width && point.y >= frame.y && point.y <= frame.y + frame.height;
    dragSnapshot.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startViewport: { ...viewport },
      scale: activeGeometry.scale,
      mode: insideFrame ? 'viewport' : 'recenter',
      moved: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(insideFrame);
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const snapshot = dragSnapshot.current;
    if (!snapshot || snapshot.pointerId !== event.pointerId) return;
    const deltaClientX = event.clientX - snapshot.startClientX;
    const deltaClientY = event.clientY - snapshot.startClientY;
    if (Math.hypot(deltaClientX, deltaClientY) > 3) snapshot.moved = true;
    if (snapshot.mode !== 'viewport') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const worldDeltaX = deltaClientX * MINI_MAP_WIDTH / bounds.width / snapshot.scale;
    const worldDeltaY = deltaClientY * MINI_MAP_HEIGHT / bounds.height / snapshot.scale;
    void setViewport({
      x: snapshot.startViewport.x - worldDeltaX * snapshot.startViewport.zoom,
      y: snapshot.startViewport.y - worldDeltaY * snapshot.startViewport.zoom,
      zoom: snapshot.startViewport.zoom
    });
  }

  function finishPointer(event: ReactPointerEvent<SVGSVGElement>, cancelled = false) {
    const snapshot = dragSnapshot.current;
    if (!snapshot || snapshot.pointerId !== event.pointerId) return;
    if (!cancelled && snapshot.mode === 'recenter' && !snapshot.moved) recenterViewport(event);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragSnapshot.current = null;
    setDragging(false);
  }

  return <div className="canvas-minimap">
    <svg
      className={dragging ? 'canvas-minimap-svg dragging' : 'canvas-minimap-svg'}
      viewBox={`0 0 ${MINI_MAP_WIDTH} ${MINI_MAP_HEIGHT}`}
      role="img"
      aria-label="画布缩略图"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finishPointer(event)}
      onPointerCancel={(event) => finishPointer(event, true)}
    >
      <g className="canvas-minimap-edges">
        {edges.map((edge) => {
          const source = nodesById.get(edge.source);
          const target = nodesById.get(edge.target);
          if (!source || !target) return null;
          const sourceX = geometry.mapX(source.position.x + FLOW_NODE_WIDTH / 2);
          const sourceY = geometry.mapY(source.position.y + FLOW_NODE_HEIGHT / 2);
          const targetX = geometry.mapX(target.position.x + FLOW_NODE_WIDTH / 2);
          const targetY = geometry.mapY(target.position.y + FLOW_NODE_HEIGHT / 2);
          const bend = Math.max(7, Math.abs(targetX - sourceX) * 0.42);
          return <path key={edge.id} d={`M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY}, ${targetX - bend} ${targetY}, ${targetX} ${targetY}`} />;
        })}
      </g>
      <g className="canvas-minimap-nodes">
        {nodes.map((node) => {
          const mappedWidth = Math.max(9, FLOW_NODE_WIDTH * geometry.scale);
          const mappedHeight = Math.max(6, FLOW_NODE_HEIGHT * geometry.scale);
          const centerX = geometry.mapX(node.position.x + FLOW_NODE_WIDTH / 2);
          const centerY = geometry.mapY(node.position.y + FLOW_NODE_HEIGHT / 2);
          return <rect
            key={node.id}
            className="canvas-minimap-node"
            x={centerX - mappedWidth / 2}
            y={centerY - mappedHeight / 2}
            width={mappedWidth}
            height={mappedHeight}
            rx={2}
            fill={miniMapColors[node.data.status]}
            stroke={miniMapStrokes[node.data.status]}
          />;
        })}
      </g>
      <path
        className="canvas-minimap-mask"
        fillRule="evenodd"
        d={`M 0 0 H ${MINI_MAP_WIDTH} V ${MINI_MAP_HEIGHT} H 0 Z M ${geometry.viewportRect.x} ${geometry.viewportRect.y} H ${geometry.viewportRect.x + geometry.viewportRect.width} V ${geometry.viewportRect.y + geometry.viewportRect.height} H ${geometry.viewportRect.x} Z`}
      />
      <rect
        className="canvas-minimap-viewport"
        data-testid="minimap-viewport"
        data-world-x={geometry.visible.x}
        data-world-y={geometry.visible.y}
        data-world-width={geometry.visible.width}
        data-world-height={geometry.visible.height}
        x={geometry.viewportRect.x}
        y={geometry.viewportRect.y}
        width={geometry.viewportRect.width}
        height={geometry.viewportRect.height}
        rx={2}
      />
    </svg>
  </div>;
}

function TaskDialog({ successor, onClose, onCreate }: { successor?: boolean; onClose: () => void; onCreate: (value: { title: string; description: string }) => Promise<void> }) {
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
  return <Dialog title={successor ? '新建后继任务' : '新建任务'} onClose={onClose} onSubmit={submit} submitLabel={successor ? '创建后继任务' : '添加到画布'} busy={busy}>
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
    <section><p className="inspector-label">事件</p><label className="field compact"><span>标题</span><input value={title} onChange={(event) => setTitle(event.target.value)} disabled={Boolean(graph.archivedAt)} /></label><label className="field compact"><span>简介</span><EmojiTextInput rows={4} value={description} onChange={setDescription} maxLength={2000} disabled={Boolean(graph.archivedAt)} /></label></section>
    <section><p className="inspector-label">标签</p><LabelPicker labels={labels} selectedIds={selectedLabels} onChange={(labelIds) => onUpdate({ labelIds })} disabled={Boolean(graph.archivedAt)} /></section>
    <section><p className="inspector-label">进度</p><strong>{graph.completedTasks} / {graph.totalTasks}</strong><span className="progress wide"><i style={{ width: `${graph.totalTasks ? (graph.completedTasks / graph.totalTasks) * 100 : 0}%` }} /></span></section>
  </div>;
}

function TaskInspector({ graph, task, history, comments, autoFocusComment, onUpdate, onTransition, onCreateComment, onDeleteComment, onSelectTask, onDelete, transitionPending, commentPending, deletePending }: {
  graph: EventGraph;
  task: Task;
  history: StateChange[];
  comments: TaskComment[];
  autoFocusComment?: boolean;
  onUpdate: (value: { title?: string; description?: string }) => void;
  onTransition: (status: TaskStatus, comment: string, onSuccess: () => void) => void;
  onCreateComment: (content: string, onSuccess: () => void) => void;
  onDeleteComment: (id: string) => void;
  onSelectTask: (id: string) => void;
  onDelete: () => void;
  transitionPending: boolean;
  commentPending: boolean;
  deletePending: boolean;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [statusComment, setStatusComment] = useState('');
  const [comment, setComment] = useState('');
  useEffect(() => {
    if (graph.archivedAt || !title.trim() || (title === task.title && description === task.description)) return;
    const timer = window.setTimeout(() => onUpdate({ title: title.trim(), description }), 600);
    return () => window.clearTimeout(timer);
  }, [description, graph.archivedAt, onUpdate, task.description, task.status, task.title, title]);
  const incoming = graph.dependencies.filter((edge) => edge.targetTaskId === task.id).map((edge) => graph.tasks.find((candidate) => candidate.id === edge.sourceTaskId)).filter(Boolean) as Task[];
  const transitionTo = (status: TaskStatus) => onTransition(status, statusComment, () => setStatusComment(''));
  return <div className="inspector-content">
    <section><p className="inspector-label">任务信息</p><label className="field compact"><span>标题</span><input value={title} onChange={(event) => setTitle(event.target.value)} disabled={Boolean(graph.archivedAt)} /></label><label className="field compact"><span>简介</span><textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} disabled={Boolean(graph.archivedAt)} /></label><div className="field compact"><span>前置任务</span>{incoming.length ? <div className="dependency-list">{incoming.map((item) => <button type="button" key={item.id} onClick={() => onSelectTask(item.id)}>{item.title}<i>{taskStatusText[item.status]}</i></button>)}</div> : <p className="muted">无</p>}</div></section>
    <section><p className="inspector-label">状态</p><strong>{taskStatusText[task.status]}</strong>{!graph.archivedAt && <><label className="field compact status-comment"><span>本次状态备注（可选）</span><EmojiTextInput rows={2} value={statusComment} onChange={setStatusComment} maxLength={500} /></label><div className="task-actions">
      {task.status === 'not_started' && <button className="button primary" disabled={transitionPending} onClick={() => transitionTo('in_progress')}><Play />开始</button>}
      {task.status === 'in_progress' && <><button className="button" disabled={transitionPending} onClick={() => transitionTo('paused')}><Pause />暂停</button><button className="button primary" disabled={transitionPending} onClick={() => transitionTo('completed')}><Check />完成</button></>}
      {task.status === 'paused' && <><button className="button" disabled={transitionPending} onClick={() => transitionTo('in_progress')}><Play />继续</button><button className="button primary" disabled={transitionPending} onClick={() => transitionTo('completed')}><Check />完成</button></>}
      {task.status === 'completed' && <button className="button" disabled={transitionPending} onClick={() => transitionTo('in_progress')}><Play />重新打开</button>}
    </div></>}
    </section>
    <section><p className="inspector-label">任务评论</p>{!graph.archivedAt && <form className="comment-compose" onSubmit={(event) => { event.preventDefault(); if (comment.trim()) onCreateComment(comment.trim(), () => setComment('')); }}><EmojiTextInput aria-label="任务评论" rows={2} maxLength={1000} value={comment} onChange={setComment} placeholder="记录补充信息" autoFocus={autoFocusComment} trailing={<button className="icon-button primary-icon" type="submit" disabled={!comment.trim() || commentPending} aria-label="提交评论" data-tooltip="提交评论"><Send /></button>} /></form>}{comments.length ? <div className="comment-list">{comments.map((item) => <article key={item.id}><p>{item.content}</p><footer><time>{formatDate(item.createdAt)}</time>{!graph.archivedAt && <button className="icon-button danger" type="button" aria-label="删除评论" data-tooltip="删除评论" onClick={() => onDeleteComment(item.id)}><Trash2 /></button>}</footer></article>)}</div> : <p className="muted">暂无评论</p>}</section>
    <section><p className="inspector-label">状态历史</p>{history.length ? <div className="history-list">{history.map((change) => <div key={change.id}><i /><span>{taskStatusText[change.fromStatus]} → {taskStatusText[change.toStatus]}{change.comment && <em>{change.comment}</em>}<time>{formatDate(change.changedAt)}</time></span></div>)}</div> : <p className="muted">尚无状态变化</p>}</section>
    {!graph.archivedAt && <section><button className="button danger-text" disabled={deletePending} onClick={onDelete}><Trash2 />{deletePending ? '删除中' : '删除任务'}</button></section>}
  </div>;
}

function Editor({ graph, labels, onExportJson, onArchive, onRestoreEvent, onCopy }: { graph: EventGraph; labels: Label[]; onExportJson: () => void; onArchive: () => void; onRestoreEvent: () => void; onCopy: (input: CopyEventInput) => Promise<void> }) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTaskId = searchParams.get('task');
  const autoFocusComment = searchParams.get('comment') === '1';
  const [exportOpen, setExportOpen] = useState(false);
  const [eventActionsOpen, setEventActionsOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [taskDialog, setTaskDialog] = useState<{ sourceTaskId: string | null } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const flowCanvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const { fitView, setCenter } = useReactFlow();
  const viewport = useViewport();
  const centeredTaskId = useRef<string | null>(null);
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['event', graph.id] });
    await queryClient.invalidateQueries({ queryKey: ['events'] });
  };
  const visibleTasks = graph.tasks;
  const visibleDependencies = graph.dependencies;
  const mappedNodes = useMemo<TaskFlowNode[]>(() => visibleTasks.map((task) => ({ id: task.id, type: 'task', position: { x: task.positionX, y: task.positionY }, data: { title: task.title, description: task.description, status: task.status, statusChangedAt: task.statusChangedAt, archived: Boolean(graph.archivedAt) } })), [graph.archivedAt, visibleTasks]);
  const mappedEdges = useMemo<Edge[]>(() => visibleDependencies.map((edge) => ({ id: edge.id, source: edge.sourceTaskId, target: edge.targetTaskId, markerEnd: { type: MarkerType.ArrowClosed }, animated: false })), [visibleDependencies]);
  const [nodes, setNodes, onNodesChange] = useNodesState<TaskFlowNode>(mappedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(mappedEdges);
  useEffect(() => setNodes(mappedNodes), [mappedNodes, setNodes]);
  useEffect(() => setNodes((current) => current.map((node) => ({ ...node, selected: node.id === selectedTaskId }))), [mappedNodes, selectedTaskId, setNodes]);
  useEffect(() => setEdges(mappedEdges), [mappedEdges, setEdges]);
  useEffect(() => {
    if (!selectedTaskId) {
      centeredTaskId.current = null;
      return;
    }
    const task = visibleTasks.find((item) => item.id === selectedTaskId);
    if (!task || centeredTaskId.current === task.id) return;
    centeredTaskId.current = task.id;
    void setCenter(task.positionX + FLOW_NODE_WIDTH / 2, task.positionY + FLOW_NODE_HEIGHT / 2, {
      zoom: Math.min(1.2, Math.max(0.9, viewport.zoom)),
      duration: 250
    });
  }, [selectedTaskId, setCenter, viewport.zoom, visibleTasks]);
  useLayoutEffect(() => {
    const element = flowCanvasRef.current;
    if (!element) return;
    const update = () => setCanvasSize({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const selectedTask = graph.tasks.find((task) => task.id === selectedTaskId);
  const { data: history = [] } = useQuery({ queryKey: ['task-history', selectedTaskId], queryFn: () => api.getTaskHistory(selectedTaskId!), enabled: Boolean(selectedTaskId) });
  const { data: comments = [] } = useQuery({ queryKey: ['task-comments', selectedTaskId], queryFn: () => api.listTaskComments(selectedTaskId!), enabled: Boolean(selectedTaskId) });
  const createTask = useMutation({
    mutationFn: ({ value, sourceTaskId }: { value: { title: string; description: string }; sourceTaskId: string | null }) => {
      const visibleBounds = {
        x: -viewport.x / viewport.zoom,
        y: -viewport.y / viewport.zoom,
        width: canvasSize.width / viewport.zoom,
        height: canvasSize.height / viewport.zoom
      };
      const sourceNode = sourceTaskId ? nodes.find((node) => node.id === sourceTaskId) : undefined;
      if (sourceTaskId && !sourceNode) throw new Error('选中的任务不存在');
      const preferredCenter = sourceNode
        ? { x: sourceNode.position.x + FLOW_NODE_WIDTH * 1.5 + 90, y: sourceNode.position.y + FLOW_NODE_HEIGHT / 2 }
        : { x: visibleBounds.x + visibleBounds.width / 2, y: visibleBounds.y + visibleBounds.height / 2 };
      const position = findFreeTaskPosition(
        preferredCenter,
        nodes,
        sourceTaskId ? undefined : visibleBounds
      );
      const input = { ...value, positionX: position.x, positionY: position.y };
      return sourceTaskId
        ? api.createSuccessorTask(sourceTaskId, input).then((result) => result.task)
        : api.createTask(graph.id, input);
    },
    onSuccess: async (task) => {
      setTaskDialog(null);
      await refresh();
      centeredTaskId.current = null;
      setSearchParams({ task: task.id });
    }
  });
  useEffect(() => {
    function handleCanvasShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || taskDialog || graph.archivedAt) return;
      const target = event.target;
      const canvas = flowCanvasRef.current;
      if (!(target instanceof HTMLElement) || !canvas?.contains(target)) return;
      if (event.key === 'Escape' && selectedTaskId) {
        event.preventDefault();
        setSearchParams({});
        target.blur();
        return;
      }
      if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || !selectedTaskId || createTask.isPending) return;
      if (target.closest('input, textarea, select, button, [contenteditable="true"]')) return;
      event.preventDefault();
      setTaskDialog({ sourceTaskId: selectedTaskId });
    }
    window.addEventListener('keydown', handleCanvasShortcut, true);
    return () => window.removeEventListener('keydown', handleCanvasShortcut, true);
  }, [createTask.isPending, graph.archivedAt, selectedTaskId, setSearchParams, taskDialog]);
  const updateEvent = useMutation({ mutationFn: (value: { title?: string; description?: string; labelIds?: string[] }) => api.updateEvent(graph.id, value), onSuccess: refresh, onError: (cause) => setError(cause.message) });
  const updateTask = useMutation({ mutationFn: ({ id, value }: { id: string; value: { title?: string; description?: string } }) => api.updateTask(id, value), onSuccess: refresh, onError: (cause) => setError(cause.message) });
  const transition = useMutation({ mutationFn: ({ id, status, confirmed = false, comment }: { id: string; status: TaskStatus; confirmed?: boolean; comment: string; afterSuccess: () => void }) => api.transitionTask(id, status, confirmed, comment), onSuccess: async (_result, variables) => { variables.afterSuccess(); await refresh(); if (selectedTaskId) await queryClient.invalidateQueries({ queryKey: ['task-history', selectedTaskId] }); }, onError: async (cause, variables) => {
    if (cause instanceof ApiError && cause.details?.code === 'SOFT_DEPENDENCY_CONFIRMATION') {
      const names = cause.details.tasks.map((task: Task) => task.title).join('、');
      if (window.confirm(`前置任务“${names}”尚未完成，仍要开始吗？`)) transition.mutate({ ...variables, confirmed: true });
    } else setError(cause.message);
  } });
  const createComment = useMutation({ mutationFn: ({ taskId, content }: { taskId: string; content: string; afterSuccess: () => void }) => api.createTaskComment(taskId, content), onSuccess: async (_result, variables) => { variables.afterSuccess(); await queryClient.invalidateQueries({ queryKey: ['task-comments', variables.taskId] }); await refresh(); }, onError: (cause) => setError(cause.message) });
  const removeComment = useMutation({ mutationFn: api.deleteTaskComment, onSuccess: async () => { if (selectedTaskId) await queryClient.invalidateQueries({ queryKey: ['task-comments', selectedTaskId] }); await refresh(); }, onError: (cause) => setError(cause.message) });
  const removeTask = useMutation({
    mutationFn: api.deleteTask,
    onMutate: async (taskId) => {
      const queryKey = ['event', graph.id] as const;
      await Promise.all([
        queryClient.cancelQueries({ queryKey }),
        queryClient.cancelQueries({ queryKey: ['task-history', taskId] }),
        queryClient.cancelQueries({ queryKey: ['task-comments', taskId] })
      ]);
      const previousGraph = queryClient.getQueryData<EventGraph>(queryKey) ?? graph;
      const deletedTask = previousGraph.tasks.find((task) => task.id === taskId);
      const remainingTasks = previousGraph.tasks.filter((task) => task.id !== taskId);
      const nearestTask = deletedTask ? [...remainingTasks].sort((a, b) => {
        const distanceA = (a.positionX - deletedTask.positionX) ** 2 + (a.positionY - deletedTask.positionY) ** 2;
        const distanceB = (b.positionX - deletedTask.positionX) ** 2 + (b.positionY - deletedTask.positionY) ** 2;
        return distanceA - distanceB;
      })[0] : undefined;

      queryClient.setQueryData<EventGraph>(queryKey, (current) => current ? {
        ...current,
        tasks: current.tasks.filter((task) => task.id !== taskId),
        dependencies: current.dependencies.filter((edge) => edge.sourceTaskId !== taskId && edge.targetTaskId !== taskId)
      } : current);
      setNodes((current) => current.filter((node) => node.id !== taskId));
      setEdges((current) => current.filter((edge) => edge.source !== taskId && edge.target !== taskId));
      setSearchParams({});

      if (nearestTask) {
        window.requestAnimationFrame(() => {
          void setCenter(nearestTask.positionX + FLOW_NODE_WIDTH / 2, nearestTask.positionY + FLOW_NODE_HEIGHT / 2, {
            zoom: Math.min(1.2, Math.max(0.9, viewport.zoom)),
            duration: 250
          });
        });
      }
      return { previousGraph, selectedTaskId };
    },
    onSuccess: async (_result, taskId) => {
      queryClient.removeQueries({ queryKey: ['task-history', taskId] });
      queryClient.removeQueries({ queryKey: ['task-comments', taskId] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['event', graph.id] }),
        queryClient.invalidateQueries({ queryKey: ['events'] })
      ]);
    },
    onError: async (cause, _taskId, context) => {
      if (context?.previousGraph) queryClient.setQueryData(['event', graph.id], context.previousGraph);
      centeredTaskId.current = null;
      if (context?.selectedTaskId) setSearchParams({ task: context.selectedTaskId });
      setError(cause.message);
      await queryClient.invalidateQueries({ queryKey: ['event', graph.id] });
    }
  });
  const createDependency = useMutation({ mutationFn: (connection: Connection) => api.createDependency(graph.id, { sourceTaskId: connection.source!, targetTaskId: connection.target! }), onSuccess: refresh, onError: (cause) => setError(cause.message) });
  const deleteDependency = useMutation({ mutationFn: api.deleteDependency, onSuccess: refresh, onError: (cause) => setError(cause.message) });

  function requestTaskDeletion(taskId: string) {
    if (removeTask.isPending) return;
    if (window.confirm('永久删除这个任务？任务历史、评论和相关依赖也会一并删除。')) removeTask.mutate(taskId);
  }

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
    layout.setGraph({ rankdir: 'LR', ranksep: 90, nodesep: 50 });
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
        {!graph.archivedAt && <button className="button primary" onClick={() => setTaskDialog({ sourceTaskId: null })}><Plus />任务</button>}
        {!graph.archivedAt && <button className="button" onClick={autoLayout}><LayoutTemplate />自动布局</button>}
        <button className="button" onClick={() => void fitView({ padding: 0.25, duration: 250, maxZoom: 1.2 })}><Maximize2 />适配视图</button>
      </div>
      <span className="commandbar-divider" />
      <div className="command-menu-wrap">
        <button className={exportOpen ? 'button active' : 'button'} onClick={() => setExportOpen((value) => !value)} aria-expanded={exportOpen}><Download />导出<ChevronDown /></button>
        {exportOpen && <div className="command-menu">
          <button type="button" disabled={exporting} onClick={() => { void exportCanvas(); setExportOpen(false); }}><ImageDown />画布 PNG</button>
          <button type="button" onClick={() => { onExportJson(); setExportOpen(false); }}><FileJson />事件 JSON</button>
        </div>}
      </div>
      <div className="commandbar-spacer" />
      <div className="command-menu-wrap align-right">
        <button className={eventActionsOpen ? 'button active' : 'button'} type="button" onClick={() => setEventActionsOpen((value) => !value)} aria-expanded={eventActionsOpen}><MoreHorizontal />事件操作<ChevronDown /></button>
        {eventActionsOpen && <div className="command-menu">
          <button type="button" onClick={() => { setEventActionsOpen(false); setCopyOpen(true); }}><Copy />复制事件</button>
          {graph.archivedAt
            ? <button type="button" onClick={() => { setEventActionsOpen(false); onRestoreEvent(); }}><ArchiveRestore />恢复事件</button>
            : <button type="button" onClick={() => { setEventActionsOpen(false); onArchive(); }}><Archive />归档事件</button>}
        </div>}
      </div>
    </div>
    <div className="editor-body">
    <div className="flow-column">
      {error && <div className="canvas-error"><span>{error}</span><button onClick={() => setError('')} aria-label="关闭">×</button></div>}
      <div className="flow-canvas" ref={flowCanvasRef}>
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onNodeClick={(event, node) => { (event.currentTarget as HTMLElement).focus(); setSearchParams({ task: node.id }); }}
          onPaneClick={() => setSearchParams({})}
          onNodeDragStop={(_event, node) => void saveLayout([{ ...node } as TaskFlowNode]).catch((cause: Error) => setError(cause.message))}
          onConnect={(connection) => createDependency.mutate(connection)}
          onEdgesDelete={(removed) => removed.forEach((edge) => deleteDependency.mutate(edge.id))}
          onBeforeDelete={async ({ nodes: pendingNodes }) => {
            if (pendingNodes.length === 0) return true;
            if (pendingNodes.length > 1) {
              setError('请一次只删除一个任务');
              return false;
            }
            requestTaskDeletion(pendingNodes[0]!.id);
            return false;
          }}
          nodesDraggable={!graph.archivedAt} nodesConnectable={!graph.archivedAt}
          edgesFocusable={!graph.archivedAt} deleteKeyCode={graph.archivedAt ? null : ['Backspace', 'Delete']}
          fitView fitViewOptions={{ padding: 0.22, maxZoom: 1.2 }} minZoom={0.25} maxZoom={1.6} proOptions={{ hideAttribution: true }}
        ><Background gap={20} size={1} /><Controls showInteractive={false} /><CanvasMiniMap key={graph.id} nodes={nodes} edges={edges} canvasWidth={canvasSize.width} canvasHeight={canvasSize.height} /></ReactFlow>
      </div>
    </div>
    <aside className="inspector">
      {selectedTask ? <TaskInspector key={selectedTask.id} graph={graph} task={selectedTask} history={history} comments={comments} autoFocusComment={autoFocusComment} onUpdate={(value) => updateTask.mutate({ id: selectedTask.id, value })} onTransition={(status, comment, afterSuccess) => transition.mutate({ id: selectedTask.id, status, comment, afterSuccess })} onCreateComment={(content, afterSuccess) => createComment.mutate({ taskId: selectedTask.id, content, afterSuccess })} onDeleteComment={(id) => { if (window.confirm('删除这条任务评论？')) removeComment.mutate(id); }} onSelectTask={(id) => setSearchParams({ task: id })} transitionPending={transition.isPending} commentPending={createComment.isPending} deletePending={removeTask.isPending} onDelete={() => requestTaskDeletion(selectedTask.id)} /> : <EventInspector key={graph.id} graph={graph} labels={labels} onUpdate={(value) => updateEvent.mutate(value)} />}
    </aside>
    {taskDialog && <TaskDialog successor={Boolean(taskDialog.sourceTaskId)} onClose={() => setTaskDialog(null)} onCreate={(value) => createTask.mutateAsync({ value, sourceTaskId: taskDialog.sourceTaskId }).then(() => undefined)} />}
    {copyOpen && <CopyEventDialog sourceTitle={graph.title} onClose={() => setCopyOpen(false)} onCopy={onCopy} />}
    <div className="sr-only" aria-live="polite">{updateEvent.isPending || updateTask.isPending ? '正在保存' : '已保存'}</div>
    </div>
  </div>;
}

export function EventEditorPage() {
  const { eventId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [returnTo] = useState<'/' | '/events'>(() => location.state && typeof location.state === 'object' && 'returnTo' in location.state && location.state.returnTo === '/' ? '/' : '/events');
  const returnLabel = returnTo === '/' ? '返回活跃事件' : '返回事件列表';
  const queryClient = useQueryClient();
  const { data: graph, isLoading, error } = useQuery({ queryKey: ['event', eventId], queryFn: () => api.getEvent(eventId), enabled: Boolean(eventId) });
  const { data: labels = [] } = useQuery({ queryKey: ['labels'], queryFn: api.listLabels });
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ['event', eventId] }); await queryClient.invalidateQueries({ queryKey: ['events'] }); };
  const archive = useMutation({ mutationFn: () => api.archiveEvent(eventId), onSuccess: refresh });
  const restore = useMutation({ mutationFn: () => api.restoreEvent(eventId), onSuccess: refresh });
  const copyEvent = useMutation({ mutationFn: (input: CopyEventInput) => api.copyEvent(eventId, input), onSuccess: async (copied) => { await queryClient.invalidateQueries({ queryKey: ['events'] }); navigate(`/events/${copied.id}`, { state: { returnTo } }); } });
  async function exportEventJson() { if (graph) downloadJson(`sagnex-${graph.title}-${exportStamp()}.json`, await api.exportEvent(graph.id)); }
  if (isLoading) return <div className="empty-state">正在加载事件...</div>;
  if (error || !graph) return <div className="empty-state"><h2>无法打开事件</h2><p>{error?.message}</p><button className="button" onClick={() => navigate('/events')}>返回事件列表</button></div>;
  return <section className="editor-page">
    <header className="editor-head">
      <button className="icon-button" onClick={() => navigate(returnTo)} aria-label={returnLabel} data-tooltip={returnLabel}><ArrowLeft /></button>
      <div className="editor-heading"><h1>{graph.title}</h1><p>{graph.labels.map((label) => label.name).join(' · ') || '未分类'}</p></div>
      <span className={`status-badge status-${graph.status}`}>{eventStatusText[graph.status]}</span>
      <span className="save-state">自动保存</span>
    </header>
    <div className={graph.archivedAt ? 'editor-workspace archived' : 'editor-workspace'}>
      {graph.archivedAt && <div className="archive-banner">该事件已归档，恢复后才能编辑。</div>}
      <ReactFlowProvider><Editor graph={graph} labels={labels} onExportJson={() => void exportEventJson()} onArchive={() => archive.mutate()} onRestoreEvent={() => restore.mutate()} onCopy={(input) => copyEvent.mutateAsync(input).then(() => undefined)} /></ReactFlowProvider>
    </div>
  </section>;
}
