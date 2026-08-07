import type { Dependency, Task } from '@sagnex/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActiveFocusGraph } from './ActiveFocusGraph';

const focus: Task = {
  id: '00000000-0000-4000-8000-000000000001', eventId: '00000000-0000-4000-8000-000000000002',
  title: '当前任务', description: '当前任务简介', status: 'in_progress', positionX: 280, positionY: 100,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', statusChangedAt: '2026-01-01T00:00:00.000Z'
};
const predecessor: Task = { ...focus, id: '00000000-0000-4000-8000-000000000003', title: '前置任务', status: 'completed', positionX: 0 };
const successor: Task = { ...focus, id: '00000000-0000-4000-8000-000000000004', title: '后续任务', status: 'paused', positionX: 560 };
const dependencies: Dependency[] = [
  { id: '00000000-0000-4000-8000-000000000005', eventId: focus.eventId, sourceTaskId: predecessor.id, targetTaskId: focus.id, createdAt: focus.createdAt },
  { id: '00000000-0000-4000-8000-000000000006', eventId: focus.eventId, sourceTaskId: focus.id, targetTaskId: successor.id, createdAt: focus.createdAt }
];

describe('ActiveFocusGraph', () => {
  it('renders one detailed focus and all direct neighbors', () => {
    const { container } = render(<ActiveFocusGraph tasks={[focus, predecessor, successor]} dependencies={dependencies} focusTaskId={focus.id} />);
    expect(container.querySelectorAll('.active-focus-node')).toHaveLength(1);
    expect(container.querySelectorAll('.active-compact-node')).toHaveLength(2);
    expect(container.querySelectorAll('.active-focus-edges path')).toHaveLength(2);
    expect(screen.getByText('当前任务简介')).toBeInTheDocument();
  });

  it('opens compact and detailed tasks independently', async () => {
    const onTaskClick = vi.fn();
    const { container } = render(<ActiveFocusGraph tasks={[focus, predecessor, successor]} dependencies={dependencies} focusTaskId={focus.id} onTaskClick={onTaskClick} />);
    await userEvent.click(within(container).getByRole('button', { name: '前置任务，已完成' }));
    await userEvent.click(within(container).getByRole('button', { name: '当前任务，进行中' }));
    expect(onTaskClick).toHaveBeenNthCalledWith(1, predecessor.id);
    expect(onTaskClick).toHaveBeenNthCalledWith(2, focus.id);
  });
});
