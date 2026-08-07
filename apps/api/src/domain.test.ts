import type { Dependency, Task } from '@sagnex/contracts';
import { describe, expect, it } from 'vitest';
import { calculateEventStatus, canTransition, getActiveTaskCounts, selectPreviewFocusTask, selectPreviewTaskIds, wouldCreateCycle } from './domain.js';

const task = (id: string, status: Task['status'], updatedAt = '2026-01-01T00:00:00.000Z'): Task => ({
  id, eventId: '00000000-0000-4000-8000-000000000001', title: id, description: '', status,
  positionX: 0, positionY: 0, createdAt: updatedAt, updatedAt, statusChangedAt: updatedAt
});
const dependency = (sourceTaskId: string, targetTaskId: string): Dependency => ({
  id: crypto.randomUUID(), eventId: '00000000-0000-4000-8000-000000000001', sourceTaskId, targetTaskId, createdAt: '2026-01-01T00:00:00.000Z'
});

describe('domain rules', () => {
  it('derives event status from tasks', () => {
    expect(calculateEventStatus([])).toBe('creating');
    expect(calculateEventStatus([task('a', 'not_started')])).toBe('ready');
    expect(calculateEventStatus([task('a', 'completed'), task('b', 'completed')])).toBe('completed');
    expect(calculateEventStatus([task('a', 'paused'), task('b', 'in_progress')])).toBe('in_progress');
    expect(calculateEventStatus([task('a', 'completed'), task('b', 'paused')])).toBe('paused');
    expect(calculateEventStatus([task('a', 'completed'), task('b', 'not_started')])).toBe('awaiting_progress');
  });

  it('allows only explicit task transitions', () => {
    expect(canTransition('not_started', 'in_progress')).toBe(true);
    expect(canTransition('not_started', 'completed')).toBe(false);
    expect(canTransition('completed', 'in_progress')).toBe(true);
  });

  it('counts running and paused tasks separately', () => {
    expect(getActiveTaskCounts([task('a', 'in_progress'), task('b', 'paused'), task('c', 'in_progress'), task('d', 'completed')])).toEqual({
      inProgressTasks: 2,
      pausedTasks: 1
    });
  });

  it('rejects self links and cycles', () => {
    const edges = [dependency('a', 'b'), dependency('b', 'c')];
    expect(wouldCreateCycle(edges, 'c', 'a')).toBe(true);
    expect(wouldCreateCycle(edges, 'c', 'd')).toBe(false);
    expect(wouldCreateCycle(edges, 'a', 'a')).toBe(true);
  });

  it('focuses a running task and falls back to the latest graph tail', () => {
    const tasks = [task('a', 'completed'), task('b', 'in_progress'), task('c', 'not_started'), task('d', 'not_started')];
    const edges = [dependency('a', 'b'), dependency('b', 'c'), dependency('c', 'd')];
    expect(selectPreviewFocusTask(tasks, edges)?.id).toBe('b');
    expect(selectPreviewTaskIds(tasks, edges)).toEqual(new Set(['a', 'b', 'c']));
    const withoutRunning = tasks.map((item) => ({ ...item, status: item.id === 'a' ? 'completed' as const : 'not_started' as const }));
    expect(selectPreviewFocusTask(withoutRunning, edges)?.id).toBe('d');
    expect(selectPreviewTaskIds(withoutRunning, edges)).toEqual(new Set(['c', 'd']));
  });

  it('treats paused tasks as active preview focus', () => {
    const tasks = [task('a', 'not_started'), task('b', 'paused'), task('c', 'not_started'), task('d', 'not_started')];
    const dependencies = [dependency('a', 'b'), dependency('b', 'c')];
    expect(selectPreviewTaskIds(tasks, dependencies)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('prioritizes the newest running task and includes every direct neighbor', () => {
    const tasks = [
      task('a', 'not_started'),
      task('b', 'in_progress', '2026-01-03T00:00:00.000Z'),
      task('c', 'completed'),
      task('d', 'paused', '2026-01-04T00:00:00.000Z'),
      task('e', 'not_started'),
      task('f', 'not_started')
    ];
    const dependencies = [dependency('a', 'b'), dependency('c', 'b'), dependency('b', 'e'), dependency('b', 'f')];
    expect(selectPreviewFocusTask(tasks, dependencies)?.id).toBe('b');
    expect(selectPreviewTaskIds(tasks, dependencies)).toEqual(new Set(['a', 'b', 'c', 'e', 'f']));
  });
});
