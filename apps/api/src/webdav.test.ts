import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type DatabaseContext } from './database.js';

describe('WebDAV backup API', () => {
  let context: DatabaseContext;
  const files = new Map<string, string>();

  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    const method = init?.method ?? 'GET';
    if (method === 'MKCOL') return new Response('', { status: 201 });
    if (method === 'PUT') {
      files.set(decodeURIComponent(url.pathname.split('/').at(-1)!), String(init?.body ?? ''));
      return new Response('', { status: 201 });
    }
    if (method === 'PROPFIND') {
      const entries = [...files.entries()].map(([name, body]) => `<d:response><d:href>/dav/Sagnex/${encodeURIComponent(name)}</d:href><d:propstat><d:status>HTTP/1.1 200 OK</d:status><d:prop><d:getlastmodified>Thu, 06 Aug 2026 08:00:00 GMT</d:getlastmodified><d:getcontentlength>${body.length}</d:getcontentlength></d:prop></d:propstat></d:response>`).join('');
      return new Response(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${entries}</d:multistatus>`, { status: 207 });
    }
    const name = decodeURIComponent(url.pathname.split('/').at(-1)!);
    if (method === 'GET' && files.has(name)) return new Response(files.get(name), { status: 200 });
    if (method === 'DELETE' && files.delete(name)) return new Response('', { status: 204 });
    return new Response('', { status: 404 });
  };

  beforeEach(() => { context = createDatabase(':memory:'); files.clear(); });
  afterEach(() => context.close());

  it('pushes latest, lists named backups, and restores through the store', async () => {
    const app = createApp(context, { fetcher });
    await app.inject({ method: 'PUT', url: '/api/webdav/config', payload: { endpoint: 'https://dav.example.test/dav/', username: 'user', password: 'secret', remotePath: 'Sagnex' } });
    await app.inject({ method: 'POST', url: '/api/events', payload: { title: '保留', description: '', labelIds: [] } });
    expect((await app.inject({ method: 'POST', url: '/api/webdav/backups/latest' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/webdav/backups/named', payload: { name: '阶段一' } })).statusCode).toBe(200);
    const listed = await app.inject({ method: 'GET', url: '/api/webdav/backups' });
    expect(listed.json()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'latest.sagnex.json', isLatest: true })]));
    await app.inject({ method: 'POST', url: '/api/events', payload: { title: '多余', description: '', labelIds: [] } });
    const restored = await app.inject({ method: 'POST', url: '/api/webdav/backups/latest.sagnex.json/restore' });
    expect(restored.statusCode, restored.body).toBe(200);
    const events = await app.inject({ method: 'GET', url: '/api/events' });
    expect(events.json()).toHaveLength(1);
    await app.close();
  });
});
