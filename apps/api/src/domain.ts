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

export function getActiveTaskCounts(tasks: Pick<Task, 'status'>[]): { inProgressTasks: number; pausedTasks: number } {
  return {
    inProgressTasks: tasks.filter((task) => task.status === 'in_progress').length,
    pausedTasks: tasks.filter((task) => task.status === 'paused').length
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

export function selectPreviewFocusTask(tasks: Task[], dependencies: Dependency[]): Task | undefined {
  const byStatusTime = (a: Task, b: Task) => b.statusChangedAt.localeCompare(a.statusChangedAt) || b.updatedAt.localeCompare(a.updatedAt);
  const running = tasks.filter((task) => task.status === 'in_progress').sort(byStatusTime);
  if (running[0]) return running[0];
  const paused = tasks.filter((task) => task.status === 'paused').sort(byStatusTime);
  if (paused[0]) return paused[0];
  const visibleIds = new Set(tasks.map((task) => task.id));
  const hasOutgoing = new Set(dependencies
    .filter((edge) => visibleIds.has(edge.sourceTaskId) && visibleIds.has(edge.targetTaskId))
    .map((edge) => edge.sourceTaskId));
  return tasks.filter((task) => !hasOutgoing.has(task.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    ?? [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

export function selectPreviewTaskIds(tasks: Task[], dependencies: Dependency[]): Set<string> {
  const focus = selectPreviewFocusTask(tasks, dependencies);
  if (!focus) return new Set();
  const selected = new Set([focus.id]);
  for (const edge of dependencies) {
    if (edge.targetTaskId === focus.id) selected.add(edge.sourceTaskId);
    if (edge.sourceTaskId === focus.id) selected.add(edge.targetTaskId);
  }
  return selected;
}
