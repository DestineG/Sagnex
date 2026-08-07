import type { Dependency, Task, TaskStatus } from '@sagnex/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatStatusDate, taskStatusText } from '../api';

const NODE_WIDTH = 208;
const NODE_HEIGHT = 108;
const PADDING = 44;

const statusColors: Record<TaskStatus, { accent: string; border: string; fill: string; text: string }> = {
  not_started: { accent: '#6f7973', border: '#cbd3ce', fill: '#ffffff', text: '#4f5953' },
  in_progress: { accent: '#16805b', border: '#52a987', fill: '#eff9f4', text: '#126446' },
  paused: { accent: '#b56714', border: '#d9a35d', fill: '#fff8ec', text: '#92500d' },
  completed: { accent: '#28748f', border: '#71aebe', fill: '#eef8fa', text: '#1f657b' }
};

interface Point { x: number; y: number }

interface GraphSvgProps {
  tasks: Task[];
  dependencies: Dependency[];
  className?: string;
  width?: number;
  height?: number;
  interactive?: boolean;
  showGrid?: boolean;
  onTaskClick?: (taskId: string) => void;
}

function boundsFor(tasks: Task[]) {
  const minX = Math.min(...tasks.map((task) => task.positionX)) - PADDING;
  const minY = Math.min(...tasks.map((task) => task.positionY)) - PADDING;
  const maxX = Math.max(...tasks.map((task) => task.positionX + NODE_WIDTH)) + PADDING;
  const maxY = Math.max(...tasks.map((task) => task.positionY + NODE_HEIGHT)) + PADDING;
  return { minX, minY, width: Math.max(maxX - minX, 360), height: Math.max(maxY - minY, 176) };
}

function boundaryPoint(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const scale = Math.max(Math.abs(dx) / (NODE_WIDTH / 2), Math.abs(dy) / (NODE_HEIGHT / 2), 1);
  return { x: from.x + dx / scale, y: from.y + dy / scale };
}

function edgeGeometry(source: Task, target: Task) {
  const sourceCenter = { x: source.positionX + NODE_WIDTH / 2, y: source.positionY + NODE_HEIGHT / 2 };
  const targetCenter = { x: target.positionX + NODE_WIDTH / 2, y: target.positionY + NODE_HEIGHT / 2 };
  const start = boundaryPoint(sourceCenter, targetCenter);
  const end = boundaryPoint(targetCenter, sourceCenter);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const controlA = horizontal ? { x: start.x + dx * 0.44, y: start.y } : { x: start.x, y: start.y + dy * 0.44 };
  const controlB = horizontal ? { x: end.x - dx * 0.44, y: end.y } : { x: end.x, y: end.y - dy * 0.44 };
  const angle = Math.atan2(end.y - controlB.y, end.x - controlB.x);
  const size = 8;
  const left = { x: end.x - Math.cos(angle - Math.PI / 6) * size, y: end.y - Math.sin(angle - Math.PI / 6) * size };
  const right = { x: end.x - Math.cos(angle + Math.PI / 6) * size, y: end.y - Math.sin(angle + Math.PI / 6) * size };
  return {
    path: `M ${start.x} ${start.y} C ${controlA.x} ${controlA.y}, ${controlB.x} ${controlB.y}, ${end.x} ${end.y}`,
    arrow: `${end.x},${end.y} ${left.x},${left.y} ${right.x},${right.y}`
  };
}

function StatusGlyph({ status, x, y }: { status: TaskStatus; x: number; y: number }) {
  const color = statusColors[status].accent;
  if (status === 'in_progress') return <path d={`M ${x} ${y - 5} L ${x + 9} ${y} L ${x} ${y + 5} Z`} fill={color} />;
  if (status === 'paused') return <><rect x={x} y={y - 5} width="3" height="10" rx="1" fill={color} /><rect x={x + 6} y={y - 5} width="3" height="10" rx="1" fill={color} /></>;
  if (status === 'completed') return <path d={`M ${x} ${y} l 4 4 l 8 -9`} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />;
  return <circle cx={x + 5} cy={y} r="5" fill="none" stroke={color} strokeWidth="1.8" />;
}

function estimatedGlyphWidth(character: string, fontSize: number): number {
  if (/\s/.test(character)) return fontSize * 0.32;
  if ((character.codePointAt(0) ?? 0) <= 0x7f) {
    if (/[A-Z0-9]/.test(character)) return fontSize * 0.62;
    if (/[a-z]/.test(character)) return fontSize * 0.54;
    return fontSize * 0.42;
  }
  return fontSize;
}

export function truncateSvgText(value: string, maxWidth: number, fontSize: number): string {
  const characters = Array.from(value);
  const totalWidth = characters.reduce((width, character) => width + estimatedGlyphWidth(character, fontSize), 0);
  if (totalWidth <= maxWidth) return value;
  const ellipsisWidth = estimatedGlyphWidth('…', fontSize);
  let width = 0;
  let result = '';
  for (const character of characters) {
    const characterWidth = estimatedGlyphWidth(character, fontSize);
    if (width + characterWidth + ellipsisWidth > maxWidth) break;
    result += character;
    width += characterWidth;
  }
  return `${result}…`;
}

export function GraphSvg({ tasks, dependencies, className, width, height, interactive = false, showGrid = true, onTaskClick }: GraphSvgProps) {
  if (tasks.length === 0) return null;
  const bounds = boundsFor(tasks);
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  return <svg
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
    width={width}
    height={height}
    preserveAspectRatio="xMidYMid meet"
    role="img"
    aria-label="任务关系图"
  >
    <defs>
      <pattern id="sagnex-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#dbe2dd" /></pattern>
      {tasks.map((task) => <clipPath id={`task-text-${task.id}`} key={task.id}>
        <rect x={task.positionX + 18} y={task.positionY + 9} width={NODE_WIDTH - 34} height="49" />
      </clipPath>)}
    </defs>
    <rect x={bounds.minX} y={bounds.minY} width={bounds.width} height={bounds.height} fill="#f6f8f6" />
    {showGrid && <rect x={bounds.minX} y={bounds.minY} width={bounds.width} height={bounds.height} fill="url(#sagnex-grid)" />}
    <g className="graph-edges">
      {dependencies.map((dependency) => {
        const source = taskMap.get(dependency.sourceTaskId);
        const target = taskMap.get(dependency.targetTaskId);
        if (!source || !target) return null;
        const geometry = edgeGeometry(source, target);
        return <g key={dependency.id}>
          <path d={geometry.path} fill="none" stroke="#87928b" strokeWidth="2" strokeLinecap="round" />
          <polygon points={geometry.arrow} fill="#87928b" />
        </g>;
      })}
    </g>
    <g className="graph-nodes">
      {tasks.map((task) => {
        const palette = statusColors[task.status];
        const node = <g>
          <rect x={task.positionX} y={task.positionY} width={NODE_WIDTH} height={NODE_HEIGHT} rx="7" fill={palette.fill} stroke={palette.border} strokeWidth="2" />
          <rect x={task.positionX} y={task.positionY} width="5" height={NODE_HEIGHT} rx="2.5" fill={palette.accent} />
          <text clipPath={`url(#task-text-${task.id})`} x={task.positionX + 18} y={task.positionY + 27} fill="#1f2923" fontFamily="Segoe UI, Microsoft YaHei, sans-serif" fontSize="15" fontWeight="600">{truncateSvgText(task.title, NODE_WIDTH - 36, 15)}</text>
          {task.description && <text clipPath={`url(#task-text-${task.id})`} x={task.positionX + 18} y={task.positionY + 51} fill="#69756e" fontFamily="Segoe UI, Microsoft YaHei, sans-serif" fontSize="11">{truncateSvgText(task.description, NODE_WIDTH - 36, 11)}</text>}
          <StatusGlyph status={task.status} x={task.positionX + 19} y={task.positionY + 82} />
          <text x={task.positionX + 37} y={task.positionY + 87} fill={palette.text} fontFamily="Segoe UI, Microsoft YaHei, sans-serif" fontSize="12">{taskStatusText[task.status]}</text>
          <text x={task.positionX + NODE_WIDTH - 16} y={task.positionY + 87} textAnchor="end" fill="#69756e" fontFamily="Segoe UI, Microsoft YaHei, sans-serif" fontSize="10">{formatStatusDate(task.statusChangedAt)}</text>
        </g>;
        if (!interactive) return <g key={task.id}>{node}</g>;
        return <g
          key={task.id}
          className="graph-node-action"
          role="button"
          tabIndex={0}
          aria-label={`${task.title}，${taskStatusText[task.status]}`}
          onClick={(event) => { event.stopPropagation(); onTaskClick?.(task.id); }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onTaskClick?.(task.id);
            }
          }}
        >{node}</g>;
      })}
    </g>
  </svg>;
}

export async function graphPngBlob(tasks: Task[], dependencies: Dependency[]): Promise<Blob> {
  if (tasks.length === 0) throw new Error('画布中没有可导出的任务');
  const bounds = boundsFor(tasks);
  const scale = Math.min(2, 2400 / Math.max(bounds.width, bounds.height));
  const width = Math.max(800, Math.round(bounds.width * scale));
  const height = Math.max(420, Math.round(bounds.height * scale));
  const markup = renderToStaticMarkup(<GraphSvg tasks={tasks} dependencies={dependencies} width={width} height={height} />);
  const source = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('无法渲染画布图像'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器不支持图像导出');
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法生成 PNG')), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
