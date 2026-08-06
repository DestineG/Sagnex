import type { Dependency, Task } from '@sagnex/contracts';
import { describe, expect, it } from 'vitest';
import { calculateEventStatus, canTransition, selectPreviewTaskIds, wouldCreateCycle } from './domain.js';

const task = (id: string, status: Task['status'], updatedAt = '2026-01-01T00:00:00.000Z'): Task => ({
  id, eventId: '00000000-0000-4000-8000-000000000001', title: id, description: '', status,
  positionX: 0, positionY: 0, createdAt: updatedAt, updatedAt, statusChangedAt: updatedAt
});
const dependency = (sourceTaskId: string, targetTaskId: string): Dependency => ({
  id: crypto.randomUUID(), eventId: '00000000-0000-4000-8000-000000000001', sourceTaskId, targetTaskId, createdAt: '2026-01-01T00:00:00.000Z'
});

describe('domain rules', () => {
  it('derives event status from effective tasks', () => {
    expect(calculateEventStatus([])).toBe('creating');
    expect(calculateEventStatus([task('a', 'not_started')])).toBe('creating');
    expect(calculateEventStatus([task('a', 'completed'), task('b', 'completed')])).toBe('completed');
    expect(calculateEventStatus([task('a', 'completed'), task('b', 'paused')])).toBe('in_progress');
    expect(calculateEventStatus([task('a', 'voided')])).toBe('creating');
  });

  it('allows only explicit task transitions', () => {
    expect(canTransition('not_started', 'in_progress')).toBe(true);
    expect(canTransition('not_started', 'completed')).toBe(false);
    expect(canTransition('completed', 'in_progress')).toBe(true);
    expect(canTransition('voided', 'in_progress')).toBe(false);
  });

  it('rejects self links and cycles', () => {
    const edges = [dependency('a', 'b'), dependency('b', 'c')];
    expect(wouldCreateCycle(edges, 'c', 'a')).toBe(true);
    expect(wouldCreateCycle(edges, 'c', 'd')).toBe(false);
    expect(wouldCreateCycle(edges, 'a', 'a')).toBe(true);
  });

  it('focuses running tasks and falls back to graph tails', () => {
    const tasks = [task('a', 'completed'), task('b', 'in_progress'), task('c', 'not_started'), task('d', 'not_started')];
    const edges = [dependency('a', 'b'), dependency('b', 'c'), dependency('c', 'd')];
    expect([...selectPreviewTaskIds(tasks, edges, 3)]).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    const withoutRunning = tasks.map((item) => ({ ...item, status: item.id === 'a' ? 'completed' as const : 'not_started' as const }));
    expect([...selectPreviewTaskIds(withoutRunning, edges, 2)]).toEqual(expect.arrayContaining(['c', 'd']));
  });
});
