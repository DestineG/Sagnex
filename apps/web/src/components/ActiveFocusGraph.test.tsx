import type { Dependency, Task } from '@sagnex/contracts';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActiveFocusGraph, calculateCommentPopupPosition } from './ActiveFocusGraph';

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
  it('places comment panels beside the focus only when enough right-side space exists', () => {
    const roomy = calculateCommentPopupPosition(
      { left: 0, right: 600, top: 0, bottom: 238, width: 600, height: 238 },
      { left: 200, right: 356, top: 80, bottom: 158, width: 156, height: 78 }
    );
    expect(roomy).toEqual({ left: 364, top: 52, width: 220, placement: 'right' });

    const narrow = calculateCommentPopupPosition(
      { left: 0, right: 420, top: 0, bottom: 238, width: 420, height: 238 },
      { left: 132, right: 288, top: 80, bottom: 158, width: 156, height: 78 }
    );
    expect(narrow).toEqual({ left: 30, top: 52, width: 360, placement: 'sheet' });
  });

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

  it('shows the latest comments from the focus marker without opening the task', async () => {
    const onTaskClick = vi.fn();
    const { container } = render(<ActiveFocusGraph
      tasks={[focus, predecessor, successor]}
      dependencies={dependencies}
      focusTaskId={focus.id}
      latestComments={[
        { taskId: focus.id, content: '第二条评论 👍', createdAt: '2026-01-02T00:00:00.000Z' },
        { taskId: focus.id, content: '第一条评论', createdAt: '2026-01-01T00:00:00.000Z' }
      ]}
      onTaskClick={onTaskClick}
    />);
    const marker = within(container).getByRole('button', { name: `查看${focus.title}的最近评论` });
    const markerObject = marker.parentElement;
    expect(marker).not.toHaveAttribute('title');
    expect(markerObject).toHaveAttribute('x', '260');
    expect(markerObject).toHaveAttribute('y', '83');
    expect(markerObject).toHaveAttribute('width', '24');
    expect(markerObject).toHaveAttribute('height', '24');
    expect(marker.querySelector('.lucide-message-circle-more')).toBeInTheDocument();
    expect(marker.querySelector('.active-comment-dot')).not.toBeInTheDocument();
    await userEvent.hover(marker);
    expect(screen.getByRole('dialog', { name: '最近评论' })).toHaveTextContent('第二条评论 👍');
    await userEvent.click(marker);
    expect(onTaskClick).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '最近评论' })).toHaveTextContent('第一条评论');
  });

  it('offers a detail link when the focus task has no comments', async () => {
    const onTaskClick = vi.fn();
    const { container } = render(<ActiveFocusGraph tasks={[focus]} dependencies={[]} focusTaskId={focus.id} onTaskClick={onTaskClick} />);
    await userEvent.click(within(container).getByRole('button', { name: `查看${focus.title}的评论` }));
    await userEvent.click(screen.getByRole('button', { name: '进入详情添加评论' }));
    expect(onTaskClick).toHaveBeenCalledWith(focus.id);
  });

  it('cycles through running and paused tasks without opening the event', async () => {
    const onTaskClick = vi.fn();
    const cardClick = vi.fn();
    const { container } = render(<div onClick={cardClick}><ActiveFocusGraph tasks={[focus, predecessor, successor]} dependencies={dependencies} focusTaskId={focus.id} onTaskClick={onTaskClick} /></div>);

    await userEvent.click(within(container).getByRole('button', { name: '下一个活跃任务' }));
    expect(within(container).getByText('后续任务')).toBeInTheDocument();
    expect(container.querySelector('.active-focus-node')).toHaveAttribute('aria-label', '后续任务，已暂停');
    expect(container.querySelector('.active-focus-layer-current')).toHaveClass('active-focus-enter-next');
    expect(container.querySelector('.active-focus-layer-outgoing')).toHaveClass('active-focus-exit-next');
    expect(within(container).getByRole('button', { name: '下一个活跃任务' })).toBeDisabled();
    expect(onTaskClick).not.toHaveBeenCalled();
    expect(cardClick).not.toHaveBeenCalled();

    fireEvent.animationEnd(container.querySelector('.active-focus-layer-outgoing')!);
    await userEvent.click(within(container).getByRole('button', { name: '下一个活跃任务' }));
    expect(container.querySelector('.active-focus-node')).toHaveAttribute('aria-label', '当前任务，进行中');
    fireEvent.animationEnd(container.querySelector('.active-focus-layer-outgoing')!);
    await userEvent.click(within(container).getByRole('button', { name: '上一个活跃任务' }));
    expect(container.querySelector('.active-focus-node')).toHaveAttribute('aria-label', '后续任务，已暂停');
    expect(container.querySelector('.active-focus-layer-current')).toHaveClass('active-focus-enter-previous');
  });

  it('selects a task from the position dots and hides controls for a single active task', async () => {
    const { container, rerender } = render(<ActiveFocusGraph tasks={[focus, predecessor, successor]} dependencies={dependencies} focusTaskId={focus.id} />);
    await userEvent.click(within(container).getByRole('button', { name: '查看活跃任务 2：后续任务' }));
    expect(container.querySelector('.active-focus-node')).toHaveAttribute('aria-label', '后续任务，已暂停');
    fireEvent.animationEnd(container.querySelector('.active-focus-layer-outgoing')!);

    rerender(<ActiveFocusGraph tasks={[focus, predecessor]} dependencies={dependencies.slice(0, 1)} focusTaskId={focus.id} />);
    expect(within(container).queryByRole('button', { name: '下一个活跃任务' })).not.toBeInTheDocument();
    expect(container.querySelector('.active-carousel-dots')).not.toBeInTheDocument();
  });

  it('keeps long carousel indicators compact', () => {
    const activeTasks = Array.from({ length: 9 }, (_, index): Task => ({
      ...focus,
      id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
      title: `活跃任务 ${index + 1}`,
      statusChangedAt: `2026-01-${String(10 - index).padStart(2, '0')}T00:00:00.000Z`
    }));
    const { container } = render(<ActiveFocusGraph tasks={activeTasks} dependencies={[]} focusTaskId={activeTasks[0]!.id} />);
    expect(container.querySelectorAll('.active-carousel-dot')).toHaveLength(5);
    expect(container.querySelectorAll('.active-carousel-more')).toHaveLength(1);
  });

  it('opens the event from blank canvas space without changing node navigation', async () => {
    const onCanvasClick = vi.fn();
    const onTaskClick = vi.fn();
    const { container } = render(<ActiveFocusGraph tasks={[focus, predecessor, successor]} dependencies={dependencies} focusTaskId={focus.id} onCanvasClick={onCanvasClick} onTaskClick={onTaskClick} />);

    fireEvent.click(container.querySelector('.active-focus-graph-svg')!);
    expect(onCanvasClick).toHaveBeenCalledOnce();
    await userEvent.click(within(container).getByRole('button', { name: '当前任务，进行中' }));
    expect(onTaskClick).toHaveBeenCalledWith(focus.id);
    expect(onCanvasClick).toHaveBeenCalledOnce();
  });
});
