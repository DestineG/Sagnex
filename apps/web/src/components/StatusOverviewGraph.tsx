import type { Dependency, Task, TaskStatus } from '@sagnex/contracts';
import { taskStatusText } from '../api';

const EDITOR_NODE_WIDTH = 208;
const EDITOR_NODE_HEIGHT = 108;
const NODE_WIDTH = 44;
const NODE_HEIGHT = 26;
const PADDING = 38;
const MIN_WIDTH = 300;
const MIN_HEIGHT = 104;

const statusColors: Record<TaskStatus, { fill: string; stroke: string }> = {
  not_started: { fill: '#e5ebe7', stroke: '#98a49d' },
  in_progress: { fill: '#2f9d73', stroke: '#176b4b' },
  paused: { fill: '#d79b45', stroke: '#a65d17' },
  completed: { fill: '#4d93a6', stroke: '#28748f' }
};

interface Point { x: number; y: number }

interface StatusOverviewGraphProps {
  tasks: Task[];
  dependencies: Dependency[];
  onTaskClick?: (taskId: string) => void;
}

function centerOf(task: Task): Point {
  return {
    x: task.positionX + EDITOR_NODE_WIDTH / 2,
    y: task.positionY + EDITOR_NODE_HEIGHT / 2
  };
}

function graphBounds(tasks: Task[]) {
  const centers = tasks.map(centerOf);
  const rawMinX = Math.min(...centers.map((point) => point.x)) - NODE_WIDTH / 2 - PADDING;
  const rawMaxX = Math.max(...centers.map((point) => point.x)) + NODE_WIDTH / 2 + PADDING;
  const rawMinY = Math.min(...centers.map((point) => point.y)) - NODE_HEIGHT / 2 - PADDING;
  const rawMaxY = Math.max(...centers.map((point) => point.y)) + NODE_HEIGHT / 2 + PADDING;
  const width = Math.max(rawMaxX - rawMinX, MIN_WIDTH);
  const height = Math.max(rawMaxY - rawMinY, MIN_HEIGHT);
  return {
    minX: (rawMinX + rawMaxX - width) / 2,
    minY: (rawMinY + rawMaxY - height) / 2,
    width,
    height
  };
}

function boundaryPoint(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const scale = Math.max(Math.abs(dx) / (NODE_WIDTH / 2), Math.abs(dy) / (NODE_HEIGHT / 2), 1);
  return { x: from.x + dx / scale, y: from.y + dy / scale };
}

function edgeGeometry(source: Task, target: Task) {
  const sourceCenter = centerOf(source);
  const targetCenter = centerOf(target);
  const start = boundaryPoint(sourceCenter, targetCenter);
  const end = boundaryPoint(targetCenter, sourceCenter);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const controlA = horizontal ? { x: start.x + dx * 0.42, y: start.y } : { x: start.x, y: start.y + dy * 0.42 };
  const controlB = horizontal ? { x: end.x - dx * 0.42, y: end.y } : { x: end.x, y: end.y - dy * 0.42 };
  const angle = Math.atan2(end.y - controlB.y, end.x - controlB.x);
  const size = 7;
  const left = { x: end.x - Math.cos(angle - Math.PI / 6) * size, y: end.y - Math.sin(angle - Math.PI / 6) * size };
  const right = { x: end.x - Math.cos(angle + Math.PI / 6) * size, y: end.y - Math.sin(angle + Math.PI / 6) * size };
  return {
    path: `M ${start.x} ${start.y} C ${controlA.x} ${controlA.y}, ${controlB.x} ${controlB.y}, ${end.x} ${end.y}`,
    arrow: `${end.x},${end.y} ${left.x},${left.y} ${right.x},${right.y}`
  };
}

export function StatusOverviewGraph({ tasks, dependencies, onTaskClick }: StatusOverviewGraphProps) {
  if (tasks.length === 0) return <div className="status-overview-graph empty" role="img" aria-label="暂无任务" />;
  const bounds = graphBounds(tasks);
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  return <div className="status-overview-graph">
    <svg viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="完整任务状态图">
      <g className="status-overview-edges">
        {dependencies.map((dependency) => {
          const source = taskMap.get(dependency.sourceTaskId);
          const target = taskMap.get(dependency.targetTaskId);
          if (!source || !target) return null;
          const geometry = edgeGeometry(source, target);
          return <g key={dependency.id}>
            <path d={geometry.path} />
            <polygon points={geometry.arrow} />
          </g>;
        })}
      </g>
      <g className="status-overview-nodes">
        {tasks.map((task) => {
          const center = centerOf(task);
          const palette = statusColors[task.status];
          return <g
            key={task.id}
            className={`status-overview-node status-${task.status}`}
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
          >
            <rect
              x={center.x - NODE_WIDTH / 2}
              y={center.y - NODE_HEIGHT / 2}
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              rx="5"
              fill={palette.fill}
              stroke={palette.stroke}
            />
          </g>;
        })}
      </g>
    </svg>
  </div>;
}
