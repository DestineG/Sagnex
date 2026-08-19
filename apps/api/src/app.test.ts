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

  it('copies an event with a validated copy mode', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/events', payload: { title: '事件', description: '', labelIds: [] } });
    const event = created.json();
    const copied = await app.inject({ method: 'POST', url: `/api/events/${event.id}/copy`, payload: { title: '事件副本', mode: 'shallow' } });
    expect(copied.statusCode, copied.body).toBe(201);
    expect(copied.json()).toMatchObject({ title: '事件副本', archivedAt: null });
    const invalid = await app.inject({ method: 'POST', url: `/api/events/${event.id}/copy`, payload: { title: '无效副本', mode: 'unknown' } });
    expect(invalid.statusCode).toBe(400);
  });

  it('filters by the expanded event statuses', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/events', payload: { title: '待开始事件', description: '', labelIds: [] } });
    const event = created.json();
    await app.inject({ method: 'POST', url: `/api/events/${event.id}/tasks`, payload: { title: '任务', description: '', positionX: 0, positionY: 0 } });

    const response = await app.inject({ method: 'GET', url: '/api/events?status=ready' });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual([expect.objectContaining({ id: event.id, status: 'ready' })]);
  });

  it('permanently deletes progressed tasks', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/events', payload: { title: '事件', description: '', labelIds: [] } });
    const event = created.json();
    const taskResponse = await app.inject({ method: 'POST', url: `/api/events/${event.id}/tasks`, payload: { title: '任务', description: '', positionX: 0, positionY: 0 } });
    const task = taskResponse.json();
    await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/transition`, payload: { toStatus: 'in_progress', confirmSoftDependencies: false } });
    const deleted = await app.inject({ method: 'DELETE', url: `/api/tasks/${task.id}` });
    expect(deleted.statusCode, deleted.body).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/tasks/${task.id}/history` })).statusCode).toBe(404);
  });

  it('creates a validated successor task with its dependency', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/events', payload: { title: '任务链', description: '', labelIds: [] } });
    const sourceResponse = await app.inject({ method: 'POST', url: `/api/events/${created.json().id}/tasks`, payload: { title: '起点', description: '', positionX: 40, positionY: 80 } });
    const source = sourceResponse.json();
    const successor = await app.inject({ method: 'POST', url: `/api/tasks/${source.id}/successors`, payload: { title: '后继', description: '', positionX: 310, positionY: 80 } });
    expect(successor.statusCode, successor.body).toBe(201);
    expect(successor.json()).toMatchObject({
      task: { title: '后继', eventId: created.json().id },
      dependency: { sourceTaskId: source.id }
    });
    const invalid = await app.inject({ method: 'POST', url: `/api/tasks/${source.id}/successors`, payload: { title: '', description: '' } });
    expect(invalid.statusCode).toBe(400);
  });

  it('creates, lists, and deletes task comments', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/events', payload: { title: '评论事件', description: '', labelIds: [] } });
    const taskResponse = await app.inject({ method: 'POST', url: `/api/events/${created.json().id}/tasks`, payload: { title: '任务', description: '', positionX: 0, positionY: 0 } });
    const task = taskResponse.json();
    const comment = await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/comments`, payload: { content: '评论内容' } });
    expect(comment.statusCode, comment.body).toBe(201);
    expect((await app.inject({ method: 'GET', url: `/api/tasks/${task.id}/comments` })).json()).toEqual([expect.objectContaining({ content: '评论内容' })]);
    expect((await app.inject({ method: 'DELETE', url: `/api/task-comments/${comment.json().id}` })).statusCode).toBe(204);
  });

  it('reports the effective pre-restore backup directory', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/data/info' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ databasePath: ':memory:', backupDirectory: null });
  });

  it('continues to allow the local development origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'http://127.0.0.1:4173', host: '127.0.0.1:4784' }
    });
    expect(response.statusCode, response.body).toBe(200);
  });

  it('rejects requests from an unrelated origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'https://example.com' }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ message: 'Origin not allowed' });
  });

  it('requires a one-time email code when authentication is enabled', async () => {
    let sentCode = '';
    await app.close();
    context.close();
    context = createDatabase(':memory:');
    app = createApp(context, { auth: { allowedEmail: 'owner@example.com', sendCode: async (_email, code) => { sentCode = code; } } });

    expect((await app.inject({ method: 'GET', url: '/api/events' })).statusCode).toBe(401);
    const requested = await app.inject({ method: 'POST', url: '/api/auth/request-code', payload: { email: 'owner@example.com' } });
    expect(requested.statusCode, requested.body).toBe(200);
    const verified = await app.inject({ method: 'POST', url: '/api/auth/verify', payload: { email: 'owner@example.com', code: sentCode } });
    expect(verified.statusCode, verified.body).toBe(200);
    const cookie = verified.headers['set-cookie'];
    expect(cookie).toBeTruthy();
    expect((await app.inject({ method: 'GET', url: '/api/events', headers: { cookie: String(cookie).split(';')[0] } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/auth/verify', payload: { email: 'owner@example.com', code: sentCode } })).statusCode).toBe(400);
  });
});
