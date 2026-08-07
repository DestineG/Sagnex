import type { Dependency, Task } from '@sagnex/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StatusOverviewGraph } from './StatusOverviewGraph';

const first: Task = {
  id: '00000000-0000-4000-8000-000000000001', eventId: '00000000-0000-4000-8000-000000000002',
  title: '节点任务', description: '不应显示', status: 'in_progress', positionX: 0, positionY: 0,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', statusChangedAt: '2026-01-01T00:00:00.000Z'
};
const second: Task = { ...first, id: '00000000-0000-4000-8000-000000000003', title: '后续任务', status: 'paused', positionX: 280 };
const third: Task = { ...first, id: '00000000-0000-4000-8000-000000000005', title: '完成任务', status: 'completed', positionX: 560 };
const fourth: Task = { ...first, id: '00000000-0000-4000-8000-000000000006', title: '未开始任务', status: 'not_started', positionX: 840 };
const dependency: Dependency = {
  id: '00000000-0000-4000-8000-000000000004', eventId: first.eventId,
  sourceTaskId: first.id, targetTaskId: second.id, createdAt: first.createdAt
};

describe('StatusOverviewGraph', () => {
  it('renders only status blocks and complete dependency geometry', () => {
    const { container } = render(<StatusOverviewGraph tasks={[first, second, third, fourth]} dependencies={[dependency]} />);
    expect(container.querySelectorAll('.status-overview-node')).toHaveLength(4);
    expect(new Set([...container.querySelectorAll('.status-overview-node rect')].map((node) => node.getAttribute('fill'))).size).toBe(4);
    expect(container.querySelector('.status-overview-edges path')).toBeInTheDocument();
    expect(container.querySelector('.status-overview-edges path')).toHaveAttribute('marker-end');
    expect(container.querySelector('text')).not.toBeInTheDocument();
    expect(screen.queryByText('不应显示')).not.toBeInTheDocument();
  });

  it('opens the selected task without triggering a surrounding card', async () => {
    const onTaskClick = vi.fn();
    const { container } = render(<StatusOverviewGraph tasks={[first]} dependencies={[]} onTaskClick={onTaskClick} />);
    await userEvent.click(within(container).getByRole('button', { name: '节点任务，进行中' }));
    expect(onTaskClick).toHaveBeenCalledWith(first.id);
  });
});
