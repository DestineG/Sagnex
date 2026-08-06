import type { Dependency, EventStatus, Task, TaskStatus } from '@sagnex/contracts';

const transitions: Record<TaskStatus, readonly TaskStatus[]> = {
  not_started: ['in_progress'],
  in_progress: ['paused', 'completed'],
  paused: ['in_progress', 'completed'],
  completed: ['in_progress']
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return transitions[from].includes(to);
}

export function calculateEventStatus(tasks: Pick<Task, 'status'>[]): EventStatus {
  if (tasks.length === 0) return 'creating';
  if (tasks.every((task) => task.status === 'completed')) return 'completed';
  if (tasks.some((task) => task.status === 'in_progress')) return 'in_progress';
  if (tasks.some((task) => task.status === 'paused')) return 'paused';
  if (tasks.every((task) => task.status === 'not_started')) return 'ready';
  return 'awaiting_progress';
}

export function getProgress(tasks: Pick<Task, 'status'>[]): { completedTasks: number; totalTasks: number } {
  return {
    completedTasks: tasks.filter((task) => task.status === 'completed').length,
    totalTasks: tasks.length
  };
}

export function wouldCreateCycle(
  dependencies: Pick<Dependency, 'sourceTaskId' | 'targetTaskId'>[],
  sourceTaskId: string,
  targetTaskId: string
): boolean {
  if (sourceTaskId === targetTaskId) return true;
  const outgoing = new Map<string, string[]>();
  for (const dependency of dependencies) {
    const targets = outgoing.get(dependency.sourceTaskId) ?? [];
    targets.push(dependency.targetTaskId);
    outgoing.set(dependency.sourceTaskId, targets);
  }
  const queue = [targetTaskId];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    if (current === sourceTaskId) return true;
    visited.add(current);
    queue.push(...(outgoing.get(current) ?? []));
  }
  return false;
}

export function selectPreviewTaskIds(tasks: Task[], dependencies: Dependency[], limit = 8): Set<string> {
  if (tasks.length === 0) return new Set();
  const visibleIds = new Set(tasks.map((task) => task.id));
  const active = tasks.filter((task) => task.status === 'in_progress' || task.status === 'paused');
  const targets = new Set(dependencies.filter((edge) => visibleIds.has(edge.sourceTaskId) && visibleIds.has(edge.targetTaskId)).map((edge) => edge.sourceTaskId));
  const focus = active.length > 0 ? active : tasks.filter((task) => !targets.has(task.id));
  const focusIds = new Set(focus.map((task) => task.id));
  const neighbors = new Set<string>();
  for (const edge of dependencies) {
    if (focusIds.has(edge.targetTaskId)) neighbors.add(edge.sourceTaskId);
    if (active.length > 0 && focusIds.has(edge.sourceTaskId)) neighbors.add(edge.targetTaskId);
  }
  const ordered = [...tasks].sort((a, b) => {
    const aRank = focusIds.has(a.id) ? 0 : neighbors.has(a.id) ? 1 : 2;
    const bRank = focusIds.has(b.id) ? 0 : neighbors.has(b.id) ? 1 : 2;
    if (aRank !== bRank) return aRank - bRank;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  return new Set(ordered.slice(0, limit).map((task) => task.id));
}
