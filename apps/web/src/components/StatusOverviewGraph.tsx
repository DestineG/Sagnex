import type { Dependency, Task, TaskStatus } from '@sagnex/contracts';
import { useId } from 'react';
import { taskStatusText } from '../api';
import { FLOW_NODE_HEIGHT as EDITOR_NODE_HEIGHT, FLOW_NODE_WIDTH as EDITOR_NODE_WIDTH, getEditorEdgePath, GRAPH_EDGE_COLOR } from './taskNodeGeometry';

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

interface StatusOverviewGraphProps {
  tasks: Task[];
  dependencies: Dependency[];
  onTaskClick?: (taskId: string) => void;
}

function centerOf(task: Task) {
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

function edgeGeometry(source: Task, target: Task) {
  const sourceCenter = centerOf(source);
  const targetCenter = centerOf(target);
  return getEditorEdgePath(
    { x: sourceCenter.x + NODE_WIDTH / 2, y: sourceCenter.y },
    { x: targetCenter.x - NODE_WIDTH / 2, y: targetCenter.y }
  );
}

export function StatusOverviewGraph({ tasks, dependencies, onTaskClick }: StatusOverviewGraphProps) {
  const markerId = `${useId().replaceAll(':', '')}-status-arrow`;
  if (tasks.length === 0) return <div className="status-overview-graph empty" role="img" aria-label="暂无任务" />;
  const bounds = graphBounds(tasks);
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  return <div className="status-overview-graph">
    <svg viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="完整任务状态图">
      <defs><marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M 0 0 L 8 4 L 0 8 Z" fill={GRAPH_EDGE_COLOR} /></marker></defs>
      <g className="status-overview-edges">
        {dependencies.map((dependency) => {
          const source = taskMap.get(dependency.sourceTaskId);
          const target = taskMap.get(dependency.targetTaskId);
          if (!source || !target) return null;
          return <path key={dependency.id} d={edgeGeometry(source, target)} markerEnd={`url(#${markerId})`} />;
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
