import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, type DatabaseContext } from './database.js';
import { SagnexStore, StoreError } from './store.js';

describe('SagnexStore', () => {
  let context: DatabaseContext;
  let store: SagnexStore;

  beforeEach(() => {
    context = createDatabase(':memory:');
    store = new SagnexStore(context);
  });
  afterEach(() => context.close());

  it('creates an event graph and derives progress', async () => {
    const label = await store.createLabel({ name: '产品', color: '#176b4b' });
    const event = await store.createEvent({ title: '发布', description: '说明', labelIds: [label.id] });
    expect(event.status).toBe('creating');
    const task = await store.createTask(event.id, { title: '校对', description: '', positionX: 0, positionY: 0 });
    await store.transitionTask(task.id, 'in_progress', false);
    await store.transitionTask(task.id, 'completed', false);
    const completed = await store.getEvent(event.id);
    expect(completed.status).toBe('completed');
    expect(completed.completedTasks).toBe(1);
    expect(await store.getTaskHistory(task.id)).toHaveLength(2);
  });

  it('requires confirmation for unmet soft dependencies', async () => {
    const event = await store.createEvent({ title: '发布', description: '', labelIds: [] });
    const first = await store.createTask(event.id, { title: '前置', description: '', positionX: 0, positionY: 0 });
    const second = await store.createTask(event.id, { title: '后续', description: '', positionX: 100, positionY: 0 });
    await store.createDependency(event.id, { sourceTaskId: first.id, targetTaskId: second.id });
    await expect(store.transitionTask(second.id, 'in_progress', false)).rejects.toMatchObject({ statusCode: 409 });
    await expect(store.transitionTask(second.id, 'in_progress', true)).resolves.toMatchObject({ task: { status: 'in_progress' } });
  });

  it('permanently deletes progressed tasks, history, and dependencies', async () => {
    const event = await store.createEvent({ title: '事项', description: '', labelIds: [] });
    const progressed = await store.createTask(event.id, { title: '已动', description: '', positionX: 0, positionY: 0 });
    const dependent = await store.createTask(event.id, { title: '后续', description: '', positionX: 200, positionY: 0 });
    await store.createDependency(event.id, { sourceTaskId: progressed.id, targetTaskId: dependent.id });
    await store.transitionTask(progressed.id, 'in_progress', false);
    await store.deleteTask(progressed.id);
    const graph = await store.getEvent(event.id);
    expect(graph.tasks.map((task) => task.id)).toEqual([dependent.id]);
    expect(graph.dependencies).toHaveLength(0);
    await expect(store.getTaskHistory(progressed.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('only permanently deletes archived events', async () => {
    const event = await store.createEvent({ title: '事项', description: '', labelIds: [] });
    await expect(store.deleteArchivedEvent(event.id)).rejects.toBeInstanceOf(StoreError);
    await store.setArchived(event.id, true);
    await store.deleteArchivedEvent(event.id);
    await expect(store.getEvent(event.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('exports and restores a complete backup', async () => {
    const event = await store.createEvent({ title: '保留', description: '', labelIds: [] });
    const task = await store.createTask(event.id, { title: '任务', description: '', positionX: 1, positionY: 2 });
    await store.transitionTask(task.id, 'in_progress', false);
    const backup = await store.exportBackup();
    await store.createEvent({ title: '多余', description: '', labelIds: [] });
    await store.importBackup(backup);
    const events = await store.listEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe('保留');
    expect(await store.getTaskHistory(task.id)).toHaveLength(1);
  });

  it('writes the pre-restore database copy to the configured directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sagnex-backup-dir-'));
    const database = createDatabase(join(root, 'data', 'sagnex.sqlite'));
    const configuredDirectory = join(root, 'safety-copies');
    const diskStore = new SagnexStore(database, { backupDirectory: configuredDirectory });
    try {
      await diskStore.createEvent({ title: '恢复前数据', description: '', labelIds: [] });
      const result = await diskStore.importBackup(await diskStore.exportBackup());
      expect(result.backupPath).toContain(configuredDirectory);
      expect(existsSync(result.backupPath!)).toBe(true);
    } finally {
      database.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('sanitizes custom SVG label icons before storage', async () => {
    const label = await store.createLabel({
      name: '自定义',
      color: '#176b4b',
      icon: 'svg:<svg viewBox="0 0 24 24" onclick="alert(1)"><script>alert(1)</script><path d="M2 2h20v20z" /></svg>'
    });
    expect(label.icon).toContain('<path');
    expect(label.icon).not.toContain('script');
    expect(label.icon).not.toContain('onclick');
  });

  it('keeps statusChangedAt tied to status changes', async () => {
    const event = await store.createEvent({ title: '日期', description: '', labelIds: [] });
    const task = await store.createTask(event.id, { title: '任务', description: '', positionX: 0, positionY: 0 });
    expect(task.statusChangedAt).toBe(task.createdAt);
    await store.updateTask(task.id, { description: '只改简介' });
    expect((await store.getEvent(event.id)).tasks[0]?.statusChangedAt).toBe(task.createdAt);
    await new Promise((resolve) => setTimeout(resolve, 2));
    const transitioned = await store.transitionTask(task.id, 'in_progress', false);
    expect(transitioned.task.statusChangedAt >= task.statusChangedAt).toBe(true);
  });
});
