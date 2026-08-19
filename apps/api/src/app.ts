import {
  copyEventInputSchema,
  createDependencyInputSchema,
  createEventInputSchema,
  createLabelInputSchema,
  createTaskCommentInputSchema,
  createTaskInputSchema,
  eventStatusSchema,
  transitionInputSchema,
  updateEventInputSchema,
  updateLabelInputSchema,
  updateLayoutInputSchema,
  updateTaskInputSchema
} from '@sagnex/contracts';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import { ZodError, z } from 'zod';
import type { DatabaseContext } from './database.js';
import { AuthError, AuthService, readCookie, sessionCookie, clearSessionCookie, type AuthOptions } from './auth.js';
import { SagnexStore, StoreError } from './store.js';
import { WebDavError, WebDavService } from './webdav.js';

const idParamsSchema = z.object({ id: z.string().uuid() });
const eventIdParamsSchema = z.object({ eventId: z.string().uuid() });
const taskIdParamsSchema = z.object({ taskId: z.string().uuid() });
const backupNameParamsSchema = z.object({ name: z.string().min(1).max(180) });
const webDavConfigSchema = z.object({
  endpoint: z.string().trim().min(1).max(2048),
  username: z.string().trim().min(1).max(320),
  password: z.string().max(1024).optional(),
  remotePath: z.string().trim().min(1).max(320).default('Sagnex')
});

export function createApp(context: DatabaseContext, options: { fetcher?: typeof fetch; backupDirectory?: string; auth?: AuthOptions } = {}) {
  const app = Fastify({ logger: false, bodyLimit: 25 * 1024 * 1024 });
  const store = new SagnexStore(context, { backupDirectory: options.backupDirectory });
  const webdav = new WebDavService(context, store, options.fetcher);
  const auth = new AuthService(context, options.auth);

  app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || /^https?:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(origin)) callback(null, true);
      else callback(Object.assign(new Error('Origin not allowed'), { statusCode: 403 }), false);
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthError) return reply.status(error.statusCode).send({ message: error.message });
    if (error instanceof StoreError) {
      return reply.status(error.statusCode).send({ message: error.message, details: error.details });
    }
    if (error instanceof WebDavError) {
      return reply.status(error.statusCode).send({ message: error.message });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({ message: '请求数据无效', details: error.issues });
    }
    if (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode < 500) {
      return reply.status(error.statusCode).send({ message: error instanceof Error ? error.message : '请求失败' });
    }
    console.error('[Sagnex API]', error);
    return reply.status(500).send({ message: '服务器内部错误' });
  });

  const isSecureRequest = (request: { headers: Record<string, string | string[] | undefined> }) => {
    const forwarded = request.headers['x-forwarded-proto'];
    return forwarded === 'https' || (Array.isArray(forwarded) ? forwarded[0] === 'https' : false);
  };

  app.addHook('preHandler', async (request, reply) => {
    if (!auth.enabled || request.url === '/api/health' || request.url.startsWith('/api/auth/')) return;
    const session = auth.getSession(readCookie(request.headers.cookie, 'sagnex_session'));
    if (!session) return reply.status(401).send({ message: '请先登录', authRequired: true });
    reply.header('Set-Cookie', sessionCookie(session.id, isSecureRequest(request), Math.max(0, Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000))));
  });

  app.get('/api/health', async () => ({ name: 'sagnex', ok: true }));

  app.get('/api/auth/status', async (request, reply) => {
    if (!auth.enabled) return { authRequired: false, authenticated: true, email: null, expiresAt: null };
    const session = auth.getSession(readCookie(request.headers.cookie, 'sagnex_session'));
    if (!session) return { authRequired: true, authenticated: false, email: null, expiresAt: null };
    reply.header('Set-Cookie', sessionCookie(session.id, isSecureRequest(request), Math.max(0, Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000))));
    return { authRequired: true, authenticated: true, email: session.email, expiresAt: session.expiresAt };
  });
  app.post('/api/auth/request-code', async (request) => {
    const input = z.object({ email: z.string().trim().email() }).parse(request.body);
    return { ok: true, ...(await auth.requestCode(input.email, request.ip)) };
  });
  app.post('/api/auth/verify', async (request, reply) => {
    const input = z.object({ email: z.string().trim().email(), code: z.string().regex(/^\d{6}$/) }).parse(request.body);
    const session = auth.verifyCode(input.email, input.code);
    reply.header('Set-Cookie', sessionCookie(session.id, isSecureRequest(request), Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000)));
    return { authRequired: true, authenticated: true, email: session.email, expiresAt: session.expiresAt };
  });
  app.post('/api/auth/logout', async (request, reply) => {
    auth.logout(readCookie(request.headers.cookie, 'sagnex_session'));
    reply.header('Set-Cookie', clearSessionCookie(isSecureRequest(request)));
    return { ok: true };
  });

  app.get('/api/events', async (request) => {
    const query = z.object({
      search: z.string().optional(),
      status: eventStatusSchema.optional(),
      labelId: z.string().uuid().optional(),
      archived: z.enum(['true', 'false']).optional(),
      active: z.enum(['true', 'false']).optional(),
      preview: z.enum(['focused', 'full']).optional()
    }).parse(request.query);
    return store.listEvents({
      search: query.search,
      status: query.status,
      labelId: query.labelId,
      archived: query.archived === undefined ? undefined : query.archived === 'true',
      active: query.active === 'true',
      preview: query.preview
    });
  });
  app.post('/api/events', async (request, reply) => reply.status(201).send(await store.createEvent(createEventInputSchema.parse(request.body))));
  app.post('/api/events/:eventId/copy', async (request, reply) => {
    const { eventId } = eventIdParamsSchema.parse(request.params);
    return reply.status(201).send(await store.copyEvent(eventId, copyEventInputSchema.parse(request.body)));
  });
  app.get('/api/events/:id', async (request) => store.getEvent(idParamsSchema.parse(request.params).id));
  app.patch('/api/events/:id', async (request) => store.updateEvent(idParamsSchema.parse(request.params).id, updateEventInputSchema.parse(request.body)));
  app.post('/api/events/:id/archive', async (request) => store.setArchived(idParamsSchema.parse(request.params).id, true));
  app.post('/api/events/:id/restore', async (request) => store.setArchived(idParamsSchema.parse(request.params).id, false));
  app.delete('/api/events/:id', async (request, reply) => {
    await store.deleteArchivedEvent(idParamsSchema.parse(request.params).id);
    return reply.status(204).send();
  });
  app.get('/api/events/:id/export', async (request, reply) => {
    const id = idParamsSchema.parse(request.params).id;
    reply.header('Content-Disposition', `attachment; filename="sagnex-event-${id}.json"`);
    return store.exportEvent(id);
  });

  app.post('/api/events/:eventId/tasks', async (request, reply) => {
    const { eventId } = eventIdParamsSchema.parse(request.params);
    return reply.status(201).send(await store.createTask(eventId, createTaskInputSchema.parse(request.body)));
  });
  app.post('/api/tasks/:taskId/successors', async (request, reply) => {
    const { taskId } = taskIdParamsSchema.parse(request.params);
    return reply.status(201).send(await store.createSuccessorTask(taskId, createTaskInputSchema.parse(request.body)));
  });
  app.patch('/api/tasks/:taskId', async (request) => store.updateTask(taskIdParamsSchema.parse(request.params).taskId, updateTaskInputSchema.parse(request.body)));
  app.delete('/api/tasks/:taskId', async (request, reply) => {
    await store.deleteTask(taskIdParamsSchema.parse(request.params).taskId);
    return reply.status(204).send();
  });
  app.post('/api/tasks/:taskId/transition', async (request) => {
    const { taskId } = taskIdParamsSchema.parse(request.params);
    const input = transitionInputSchema.parse(request.body);
    return store.transitionTask(taskId, input.toStatus, input.confirmSoftDependencies, input.comment);
  });
  app.get('/api/tasks/:taskId/history', async (request) => store.getTaskHistory(taskIdParamsSchema.parse(request.params).taskId));
  app.get('/api/tasks/:taskId/comments', async (request) => store.listTaskComments(taskIdParamsSchema.parse(request.params).taskId));
  app.post('/api/tasks/:taskId/comments', async (request, reply) => {
    const { taskId } = taskIdParamsSchema.parse(request.params);
    return reply.status(201).send(await store.createTaskComment(taskId, createTaskCommentInputSchema.parse(request.body)));
  });
  app.delete('/api/task-comments/:id', async (request, reply) => {
    await store.deleteTaskComment(idParamsSchema.parse(request.params).id);
    return reply.status(204).send();
  });
  app.patch('/api/events/:eventId/layout', async (request, reply) => {
    const { eventId } = eventIdParamsSchema.parse(request.params);
    await store.updateLayout(eventId, updateLayoutInputSchema.parse(request.body));
    return reply.status(204).send();
  });

  app.post('/api/events/:eventId/dependencies', async (request, reply) => {
    const { eventId } = eventIdParamsSchema.parse(request.params);
    return reply.status(201).send(await store.createDependency(eventId, createDependencyInputSchema.parse(request.body)));
  });
  app.delete('/api/dependencies/:id', async (request, reply) => {
    await store.deleteDependency(idParamsSchema.parse(request.params).id);
    return reply.status(204).send();
  });

  app.get('/api/labels', async () => store.listLabels());
  app.post('/api/labels', async (request, reply) => reply.status(201).send(await store.createLabel(createLabelInputSchema.parse(request.body))));
  app.patch('/api/labels/:id', async (request) => store.updateLabel(idParamsSchema.parse(request.params).id, updateLabelInputSchema.parse(request.body)));
  app.delete('/api/labels/:id', async (request, reply) => {
    await store.deleteLabel(idParamsSchema.parse(request.params).id);
    return reply.status(204).send();
  });

  app.get('/api/data/info', async () => {
    const [events, labels] = await Promise.all([store.listEvents(), store.listLabels()]);
    return {
      databasePath: context.path,
      backupDirectory: store.getBackupDirectory(),
      eventCount: events.length,
      taskCount: events.reduce((sum, event) => sum + event.totalTasks, 0),
      labelCount: labels.length
    };
  });
  app.get('/api/backups/export', async (request, reply) => {
    reply.header('Content-Disposition', 'attachment; filename="sagnex-backup.json"');
    return store.exportBackup();
  });
  app.post('/api/backups/import', async (request) => store.importBackup(request.body));

  app.get('/api/webdav/config', async () => webdav.getConfig());
  app.put('/api/webdav/config', async (request) => webdav.saveConfig(webDavConfigSchema.parse(request.body)));
  app.post('/api/webdav/test', async () => {
    await webdav.test();
    return { ok: true };
  });
  app.post('/api/webdav/backups/latest', async () => webdav.pushLatest());
  app.post('/api/webdav/backups/named', async (request) => {
    const input = z.object({ name: z.string().trim().min(1).max(80) }).parse(request.body);
    return webdav.createNamed(input.name);
  });
  app.get('/api/webdav/backups', async () => webdav.list());
  app.get('/api/webdav/backups/:name', async (request) => webdav.download(backupNameParamsSchema.parse(request.params).name));
  app.post('/api/webdav/backups/:name/restore', async (request) => webdav.restore(backupNameParamsSchema.parse(request.params).name));
  app.delete('/api/webdav/backups/:name', async (request, reply) => {
    await webdav.delete(backupNameParamsSchema.parse(request.params).name);
    return reply.status(204).send();
  });

  return app;
}
