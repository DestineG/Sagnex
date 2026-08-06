import type { Dependency, Task } from '@sagnex/contracts';
import { GraphSvg } from './GraphSvg';

interface MiniGraphProps {
  tasks: Task[];
  dependencies: Dependency[];
  onTaskClick?: (taskId: string) => void;
}

export function MiniGraph({ tasks, dependencies, onTaskClick }: MiniGraphProps) {
  if (tasks.length === 0) return <div className="mini-graph empty-mini">尚未添加任务</div>;
  return <div className="mini-graph"><GraphSvg className="mini-graph-svg" tasks={tasks} dependencies={dependencies} interactive onTaskClick={onTaskClick} /></div>;
}
