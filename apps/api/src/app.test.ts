import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type DatabaseContext } from './database.js';

describe('API', () => {
  let context: DatabaseContext;
  let app: ReturnType<typeof createApp>;
  beforeEach(() => { context = createDatabase(':memory:'); app = createApp(context); });
  afterEach(async () => { await app.close(); context.close(); });

  it('archives and returns an event', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/events', payload: { title: '事件', description: '', labelIds: [] } });
    expect(created.statusCode).toBe(201);
    const event = created.json();
    const archived = await app.inject({ method: 'POST', url: `/api/events/${event.id}/archive` });
    expect(archived.statusCode, archived.body).toBe(200);
    expect(archived.json().archivedAt).toBeTruthy();
  });

  it('returns JSON when deleting or voiding tasks and supports restore', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/events', payload: { title: '事件', description: '', labelIds: [] } });
    const event = created.json();
    const taskResponse = await app.inject({ method: 'POST', url: `/api/events/${event.id}/tasks`, payload: { title: '任务', description: '', positionX: 0, positionY: 0 } });
    const task = taskResponse.json();
    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/transition`, payload: { toStatus: 'in_progress', confirmSoftDependencies: false } });
    const voided = await app.inject({ method: 'DELETE', url: `/api/tasks/${task.id}` });
    expect(voided.statusCode, voided.body).toBe(200);
    expect(voided.json()).toEqual({ result: 'voided' });
    const restored = await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/restore`, payload: { confirmSoftDependencies: false } });
    expect(restored.statusCode, restored.body).toBe(200);
    expect(restored.json()).toMatchObject({ restoredStatus: 'in_progress', task: { status: 'in_progress' } });
  });
});
