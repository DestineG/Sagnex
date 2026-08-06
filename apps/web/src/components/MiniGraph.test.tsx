import type { Dependency, Task } from '@sagnex/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MiniGraph } from './MiniGraph';

const task: Task = {
  id: '00000000-0000-4000-8000-000000000001', eventId: '00000000-0000-4000-8000-000000000002',
  title: '节点任务', description: '', status: 'in_progress', positionX: 0, positionY: 0,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', statusChangedAt: '2026-01-01T00:00:00.000Z'
};

const secondTask: Task = {
  ...task,
  id: '00000000-0000-4000-8000-000000000003',
  title: '后续任务',
  status: 'paused',
  positionX: 280
};

const dependency: Dependency = {
  id: '00000000-0000-4000-8000-000000000004',
  eventId: task.eventId,
  sourceTaskId: task.id,
  targetTaskId: secondTask.id,
  createdAt: task.createdAt
};

describe('MiniGraph', () => {
  it('opens a task without triggering the surrounding card action', async () => {
    const onTaskClick = vi.fn();
    render(<MiniGraph tasks={[task]} dependencies={[]} onTaskClick={onTaskClick} />);
    await userEvent.click(screen.getByRole('button', { name: '节点任务，进行中' }));
    expect(onTaskClick).toHaveBeenCalledWith(task.id);
  });

  it('renders dependency paths and arrowheads inside the SVG', () => {
    const { container } = render(<MiniGraph tasks={[task, secondTask]} dependencies={[dependency]} />);
    expect(container.querySelector('.graph-edges path')).toBeInTheDocument();
    expect(container.querySelector('.graph-edges polygon')).toBeInTheDocument();
    expect(within(container).getByLabelText('任务关系图')).toBeInTheDocument();
  });
});
