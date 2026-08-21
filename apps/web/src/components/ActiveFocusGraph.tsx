import type { Dependency, PreviewLatestComment, Task, TaskStatus } from '@sagnex/contracts';
import { ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { formatStatusDate, taskStatusText } from '../api';
import { truncateSvgText } from './GraphSvg';
import { getEditorEdgePath, GRAPH_EDGE_COLOR, GRAPH_EDGE_WIDTH } from './taskNodeGeometry';

const VIEW_WIDTH = 420;
const VIEW_HEIGHT = 238;
const FOCUS_WIDTH = 156;
const FOCUS_HEIGHT = 78;
const FOCUS_X = (VIEW_WIDTH - FOCUS_WIDTH) / 2;
const FOCUS_Y = (VIEW_HEIGHT - FOCUS_HEIGHT) / 2;
const FOCUS_TEXT_WIDTH = FOCUS_WIDTH - 56;
const SIDE_MARGIN = 44;
const SIDE_TOP = 18;
const SIDE_BOTTOM = 38;
const SIDE_GAP = 20;
const MAX_SIDE_ROWS = 7;

const statusColors: Record<TaskStatus, { accent: string; border: string; fill: string; text: string; compact: string }> = {
  not_started: { accent: '#6f7973', border: '#cbd3ce', fill: '#ffffff', text: '#4f5953', compact: '#e5ebe7' },
  in_progress: { accent: '#16805b', border: '#52a987', fill: '#eff9f4', text: '#126446', compact: '#2f9d73' },
  paused: { accent: '#b56714', border: '#d9a35d', fill: '#fff8ec', text: '#92500d', compact: '#d79b45' },
  completed: { accent: '#28748f', border: '#71aebe', fill: '#eef8fa', text: '#1f657b', compact: '#4d93a6' }
};

interface CompactNode {
  task: Task;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ActiveFocusGraphProps {
  tasks: Task[];
  dependencies: Dependency[];
  focusTaskId: string | null;
  latestComments?: PreviewLatestComment[];
  onTaskClick?: (taskId: string) => void;
  onAddComment?: (taskId: string) => void;
  onCanvasClick?: () => void;
}

type TransitionDirection = 'next' | 'previous';

function layoutSide(tasks: Task[], minX: number, maxX: number, nearestFirst: boolean): CompactNode[] {
  if (tasks.length === 0) return [];
  const ordered = [...tasks].sort((a, b) => a.positionY - b.positionY || a.positionX - b.positionX);
  const columns = Math.ceil(ordered.length / MAX_SIDE_ROWS);
  const rows = Math.min(MAX_SIDE_ROWS, ordered.length);
  const availableWidth = maxX - minX;
  const availableHeight = VIEW_HEIGHT - SIDE_TOP - SIDE_BOTTOM;
  const cellWidth = availableWidth / columns;
  const cellHeight = availableHeight / rows;
  const width = Math.max(6, Math.min(36, cellWidth - 6));
  const height = Math.max(5, Math.min(22, cellHeight - 6));
  return ordered.map((task, index) => {
    const column = Math.floor(index / MAX_SIDE_ROWS);
    const row = index % MAX_SIDE_ROWS;
    const visualColumn = nearestFirst ? columns - column - 1 : column;
    return {
      task,
      x: minX + visualColumn * cellWidth + (cellWidth - width) / 2,
      y: SIDE_TOP + row * cellHeight + (cellHeight - height) / 2,
      width,
      height
    };
  });
}

function FocusStatusGlyph({ status, x, y }: { status: TaskStatus; x: number; y: number }) {
  const color = statusColors[status].accent;
  if (status === 'in_progress') return <path d={`M ${x} ${y - 4} L ${x + 7} ${y} L ${x} ${y + 4} Z`} fill={color} />;
  if (status === 'paused') return <><rect x={x} y={y - 4} width="2.5" height="8" rx="1" fill={color} /><rect x={x + 5} y={y - 4} width="2.5" height="8" rx="1" fill={color} /></>;
  if (status === 'completed') return <path d={`M ${x} ${y} l 3 3 l 7 -8`} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />;
  return <circle cx={x + 4} cy={y} r="4" fill="none" stroke={color} strokeWidth="1.6" />;
}

interface ActiveGraphLayerProps {
  className: string;
  focus: Task;
  tasks: Task[];
  dependencies: Dependency[];
  markerId: string;
  latestComments: PreviewLatestComment[];
  onTaskClick?: (taskId: string) => void;
  onCommentMarkerEnter?: (marker: HTMLButtonElement, taskId: string) => void;
  onCommentMarkerLeave?: () => void;
  onCommentMarkerClick?: (marker: HTMLButtonElement, taskId: string) => void;
  onAnimationEnd?: () => void;
}

function ActiveGraphLayer({ className, focus, tasks, dependencies, markerId, latestComments, onTaskClick, onCommentMarkerEnter, onCommentMarkerLeave, onCommentMarkerClick, onAnimationEnd }: ActiveGraphLayerProps) {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const incomingDependencies = dependencies.filter((edge) => edge.targetTaskId === focus.id && taskMap.has(edge.sourceTaskId));
  const outgoingDependencies = dependencies.filter((edge) => edge.sourceTaskId === focus.id && taskMap.has(edge.targetTaskId));
  const incoming = layoutSide(incomingDependencies.map((edge) => taskMap.get(edge.sourceTaskId)!), SIDE_MARGIN, FOCUS_X - SIDE_GAP, true);
  const outgoing = layoutSide(outgoingDependencies.map((edge) => taskMap.get(edge.targetTaskId)!), FOCUS_X + FOCUS_WIDTH + SIDE_GAP, VIEW_WIDTH - SIDE_MARGIN, false);
  const incomingById = new Map(incoming.map((node) => [node.task.id, node]));
  const outgoingById = new Map(outgoing.map((node) => [node.task.id, node]));
  const palette = statusColors[focus.status];
  const activate = (taskId: string) => onTaskClick?.(taskId);
  const keyActivate = (event: KeyboardEvent<SVGGElement>, taskId: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    activate(taskId);
  };

  return <g className={`active-focus-layer ${className}`} onAnimationEnd={onAnimationEnd}>
    <g className="active-focus-edges">
      {incomingDependencies.map((edge) => {
        const source = incomingById.get(edge.sourceTaskId);
        if (!source) return null;
        const path = getEditorEdgePath(
          { x: source.x + source.width, y: source.y + source.height / 2 },
          { x: FOCUS_X, y: FOCUS_Y + FOCUS_HEIGHT / 2 }
        );
        return <path key={edge.id} d={path} fill="none" stroke={GRAPH_EDGE_COLOR} strokeWidth={GRAPH_EDGE_WIDTH} strokeLinecap="round" markerEnd={`url(#${markerId})`} />;
      })}
      {outgoingDependencies.map((edge) => {
        const target = outgoingById.get(edge.targetTaskId);
        if (!target) return null;
        const path = getEditorEdgePath(
          { x: FOCUS_X + FOCUS_WIDTH, y: FOCUS_Y + FOCUS_HEIGHT / 2 },
          { x: target.x, y: target.y + target.height / 2 }
        );
        return <path key={edge.id} d={path} fill="none" stroke={GRAPH_EDGE_COLOR} strokeWidth={GRAPH_EDGE_WIDTH} strokeLinecap="round" markerEnd={`url(#${markerId})`} />;
      })}
    </g>
    <g className="active-focus-neighbors">
      {[...incoming, ...outgoing].map((node) => {
        const colors = statusColors[node.task.status];
        return <g
          key={node.task.id}
          className="active-compact-node"
          role="button"
          tabIndex={0}
          aria-label={`${node.task.title}，${taskStatusText[node.task.status]}`}
          onClick={(event) => { event.stopPropagation(); activate(node.task.id); }}
          onKeyDown={(event) => keyActivate(event, node.task.id)}
        >
          <title>{node.task.title} · {taskStatusText[node.task.status]}</title>
          <rect x={node.x} y={node.y} width={node.width} height={node.height} rx="4" fill={colors.compact} stroke={colors.accent} strokeWidth="1.4" />
        </g>;
      })}
    </g>
    <g
      className="active-focus-node"
      role="button"
      tabIndex={0}
      aria-label={`${focus.title}，${taskStatusText[focus.status]}`}
      onClick={(event) => { event.stopPropagation(); activate(focus.id); }}
      onKeyDown={(event) => keyActivate(event, focus.id)}
    >
      <rect x={FOCUS_X} y={FOCUS_Y} width={FOCUS_WIDTH} height={FOCUS_HEIGHT} rx="7" fill={palette.fill} stroke={palette.border} strokeWidth="2" />
      <rect x={FOCUS_X} y={FOCUS_Y} width="5" height={FOCUS_HEIGHT} rx="2.5" fill={palette.accent} />
      <text x={FOCUS_X + 16} y={FOCUS_Y + 22} fill="#1f2923" fontFamily="Segoe UI, Microsoft YaHei, sans-serif" fontSize="14" fontWeight="600">{truncateSvgText(focus.title, FOCUS_TEXT_WIDTH, 14)}</text>
      {focus.description && <text x={FOCUS_X + 16} y={FOCUS_Y + 41} fill="#69756e" fontFamily="Segoe UI, Microsoft YaHei, sans-serif" fontSize="10.5">{truncateSvgText(focus.description, FOCUS_TEXT_WIDTH, 10.5)}</text>}
      <foreignObject x={FOCUS_X + FOCUS_WIDTH - 36} y={FOCUS_Y + 7} width="28" height="28">
        <button
          className={latestComments.length ? 'active-comment-marker has-comments' : 'active-comment-marker'}
          type="button"
          aria-label={latestComments.length ? `查看${focus.title}的最近评论` : `查看${focus.title}的评论`}
          title={latestComments.length ? '查看最近评论' : '暂无评论，点击进入详情添加'}
          onMouseEnter={(event) => onCommentMarkerEnter?.(event.currentTarget, focus.id)}
          onMouseLeave={onCommentMarkerLeave}
          onFocus={(event) => onCommentMarkerEnter?.(event.currentTarget, focus.id)}
          onBlur={onCommentMarkerLeave}
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); onCommentMarkerClick?.(event.currentTarget, focus.id); }}
        ><MessageCircle aria-hidden="true" /></button>
      </foreignObject>
      <FocusStatusGlyph status={focus.status} x={FOCUS_X + 16} y={FOCUS_Y + FOCUS_HEIGHT - 15} />
      <text x={FOCUS_X + 31} y={FOCUS_Y + FOCUS_HEIGHT - 11} fill={palette.text} fontFamily="Segoe UI, Microsoft YaHei, sans-serif" fontSize="11">{taskStatusText[focus.status]}</text>
      <text x={FOCUS_X + FOCUS_WIDTH - 12} y={FOCUS_Y + FOCUS_HEIGHT - 11} textAnchor="end" fill="#69756e" fontFamily="Segoe UI, Microsoft YaHei, sans-serif" fontSize="9.5">{formatStatusDate(focus.statusChangedAt)}</text>
    </g>
  </g>;
}

export function ActiveFocusGraph({ tasks, dependencies, focusTaskId, latestComments = [], onTaskClick, onAddComment, onCanvasClick }: ActiveFocusGraphProps) {
  const instanceId = useId().replaceAll(':', '');
  const markerId = `${instanceId}-active-arrow`;
  const gridId = `${instanceId}-active-grid`;
  const activeTasks = useMemo(() => tasks
    .filter((task) => task.status === 'in_progress' || task.status === 'paused')
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'in_progress' ? -1 : 1;
      return b.statusChangedAt.localeCompare(a.statusChangedAt) || b.updatedAt.localeCompare(a.updatedAt);
    }), [tasks]);
  const [currentFocusId, setCurrentFocusId] = useState(focusTaskId);
  const [outgoingFocusId, setOutgoingFocusId] = useState<string | null>(null);
  const [transitionDirection, setTransitionDirection] = useState<TransitionDirection>('next');
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const popupCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [commentPopup, setCommentPopup] = useState<{ taskId: string; comments: PreviewLatestComment[]; left: number; top: number; width: number; pinned: boolean } | null>(null);
  const commentsByTask = useMemo(() => {
    const map = new Map<string, PreviewLatestComment[]>();
    for (const comment of latestComments) map.set(comment.taskId, [...(map.get(comment.taskId) ?? []), comment]);
    return map;
  }, [latestComments]);
  useEffect(() => () => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    if (popupCloseTimer.current) clearTimeout(popupCloseTimer.current);
  }, []);
  const selectedFocusId = activeTasks.some((task) => task.id === currentFocusId)
    ? currentFocusId
    : activeTasks.some((task) => task.id === focusTaskId) ? focusTaskId : activeTasks[0]?.id ?? focusTaskId;
  const focus = tasks.find((task) => task.id === selectedFocusId);
  if (!focus) return <div className="mini-graph empty-mini">尚未添加任务</div>;
  const outgoingFocus = outgoingFocusId ? tasks.find((task) => task.id === outgoingFocusId) : undefined;
  const isTransitioning = outgoingFocusId !== null;
  const currentIndex = Math.max(0, activeTasks.findIndex((task) => task.id === focus.id));
  const showCarousel = activeTasks.length > 1;
  const finishTransition = () => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    transitionTimer.current = null;
    setOutgoingFocusId(null);
  };
  const beginTransition = (task: Task, direction: TransitionDirection) => {
    if (isTransitioning || task.id === focus.id) return;
    setCommentPopup(null);
    setTransitionDirection(direction);
    setOutgoingFocusId(focus.id);
    setCurrentFocusId(task.id);
    transitionTimer.current = setTimeout(() => {
      transitionTimer.current = null;
      setOutgoingFocusId(null);
    }, 360);
  };
  const changeFocus = (event: MouseEvent<HTMLButtonElement>, offset: number) => {
    event.preventDefault();
    event.stopPropagation();
    const nextIndex = (currentIndex + offset + activeTasks.length) % activeTasks.length;
    const nextTask = activeTasks[nextIndex];
    if (nextTask) beginTransition(nextTask, offset > 0 ? 'next' : 'previous');
  };
  const selectFocus = (event: MouseEvent<HTMLButtonElement>, index: number) => {
    event.preventDefault();
    event.stopPropagation();
    const selectedTask = activeTasks[index];
    if (selectedTask) beginTransition(selectedTask, index > currentIndex ? 'next' : 'previous');
  };
  const clearPopupClose = () => {
    if (popupCloseTimer.current) clearTimeout(popupCloseTimer.current);
    popupCloseTimer.current = null;
  };
  const schedulePopupClose = () => {
    clearPopupClose();
    popupCloseTimer.current = setTimeout(() => setCommentPopup((current) => current?.pinned ? current : null), 150);
  };
  const openCommentPopup = (marker: HTMLButtonElement, taskId: string, pinned = false) => {
    const container = graphRef.current;
    if (!container) return;
    clearPopupClose();
    const markerRect = marker.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const width = Math.min(260, Math.max(190, containerRect.width - 24));
    const height = 190;
    let left = markerRect.right - containerRect.left + 8;
    let top = markerRect.top - containerRect.top;
    if (left + width > containerRect.width - 8) left = markerRect.left - containerRect.left - width - 8;
    left = Math.max(8, left);
    if (top + height > containerRect.height - 8) top = Math.max(8, containerRect.height - height - 8);
    setCommentPopup({ taskId, comments: commentsByTask.get(taskId) ?? [], left, top, width, pinned });
  };
  const toggleCommentPopup = (marker: HTMLButtonElement, taskId: string) => {
    if (commentPopup?.taskId === taskId && commentPopup.pinned) {
      setCommentPopup(null);
      return;
    }
    openCommentPopup(marker, taskId, true);
  };
  const markerStart = activeTasks.length <= 7 ? 0 : Math.min(Math.max(currentIndex - 2, 0), activeTasks.length - 5);
  const markerIndices = activeTasks.length <= 7
    ? activeTasks.map((_, index) => index)
    : Array.from({ length: 5 }, (_, index) => markerStart + index);

  return <div ref={graphRef} className="mini-graph active-focus-graph" onClick={onCanvasClick}>
    <svg className="active-focus-graph-svg" viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="当前任务及直接依赖">
      <defs>
        <pattern id={gridId} width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#dbe2dd" /></pattern>
        <marker id={markerId} markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M 0 0 L 9 4.5 L 0 9 Z" fill={GRAPH_EDGE_COLOR} /></marker>
      </defs>
      <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="#f6f8f6" />
      <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill={`url(#${gridId})`} />
      <ActiveGraphLayer key={focus.id} className={isTransitioning ? `active-focus-layer-current active-focus-enter-${transitionDirection}` : 'active-focus-layer-current'} focus={focus} tasks={tasks} dependencies={dependencies} markerId={markerId} latestComments={commentsByTask.get(focus.id) ?? []} onTaskClick={onTaskClick} onCommentMarkerEnter={(marker, taskId) => openCommentPopup(marker, taskId)} onCommentMarkerLeave={schedulePopupClose} onCommentMarkerClick={toggleCommentPopup} />
      {outgoingFocus && <ActiveGraphLayer className={`active-focus-layer-outgoing active-focus-exit-${transitionDirection}`} focus={outgoingFocus} tasks={tasks} dependencies={dependencies} markerId={markerId} latestComments={commentsByTask.get(outgoingFocus.id) ?? []} onTaskClick={onTaskClick} onCommentMarkerEnter={(marker, taskId) => openCommentPopup(marker, taskId)} onCommentMarkerLeave={schedulePopupClose} onCommentMarkerClick={toggleCommentPopup} onAnimationEnd={finishTransition} />}
    </svg>
    {commentPopup && <aside
      className="active-comment-popup"
      role="dialog"
      aria-label="最近评论"
      style={{ left: commentPopup.left, top: commentPopup.top, width: commentPopup.width }}
      onMouseEnter={clearPopupClose}
      onMouseLeave={() => { if (!commentPopup.pinned) schedulePopupClose(); }}
      onClick={(event) => event.stopPropagation()}
    >
      <header><strong>最近评论</strong><button type="button" aria-label="关闭评论" onClick={() => setCommentPopup(null)}>×</button></header>
      {commentPopup.comments.length ? <div className="active-comment-list">{commentPopup.comments.map((comment) => <article key={comment.taskId + comment.createdAt}><time>{new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(comment.createdAt))}</time><p>{comment.content}</p></article>)}</div> : <div className="active-comment-empty"><p>暂无评论</p><button type="button" onClick={() => { const taskId = commentPopup.taskId; setCommentPopup(null); (onAddComment ?? onTaskClick)?.(taskId); }}>进入详情添加评论</button></div>}
    </aside>}
    {showCarousel && <div className="active-focus-carousel" aria-label={`活跃任务 ${currentIndex + 1} / ${activeTasks.length}`} aria-busy={isTransitioning}>
      <button className="active-carousel-arrow previous" type="button" aria-label="上一个活跃任务" title="上一个活跃任务" disabled={isTransitioning} onClick={(event) => changeFocus(event, -1)}><ChevronLeft /></button>
      <button className="active-carousel-arrow next" type="button" aria-label="下一个活跃任务" title="下一个活跃任务" disabled={isTransitioning} onClick={(event) => changeFocus(event, 1)}><ChevronRight /></button>
      <div className="active-carousel-dots">
        {markerStart > 0 && <span className="active-carousel-more" aria-hidden="true" />}
        {markerIndices.map((index) => {
          const task = activeTasks[index];
          return task ? <button
            className={index === currentIndex ? 'active-carousel-dot selected' : 'active-carousel-dot'}
            type="button"
            key={task.id}
            aria-label={`查看活跃任务 ${index + 1}：${task.title}`}
            aria-current={index === currentIndex ? 'true' : undefined}
            disabled={isTransitioning}
            onClick={(event) => selectFocus(event, index)}
          /> : null;
        })}
        {markerStart + markerIndices.length < activeTasks.length && <span className="active-carousel-more" aria-hidden="true" />}
      </div>
    </div>}
  </div>;
}
