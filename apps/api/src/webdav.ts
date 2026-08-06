import { XMLParser } from 'fast-xml-parser';
import { Buffer } from 'node:buffer';
import type { DatabaseContext } from './database.js';
import type { SagnexStore } from './store.js';

export interface WebDavConfigInput {
  endpoint: string;
  username: string;
  password?: string;
  remotePath: string;
}

export interface WebDavConfigView {
  endpoint: string;
  username: string;
  remotePath: string;
  passwordSet: boolean;
}

export interface WebDavBackupEntry {
  name: string;
  modifiedAt: string | null;
  size: number | null;
  isLatest: boolean;
}

export class WebDavError extends Error {
  constructor(message: string, public readonly statusCode = 502) { super(message); }
}

type FetchLike = typeof fetch;

function normalizeConfig(input: WebDavConfigInput): Omit<WebDavConfigInput, 'password'> {
  let endpoint: URL;
  try { endpoint = new URL(input.endpoint.trim()); } catch { throw new WebDavError('WebDAV 地址无效', 400); }
  if (!['http:', 'https:'].includes(endpoint.protocol)) throw new WebDavError('WebDAV 地址必须使用 HTTP 或 HTTPS', 400);
  endpoint.search = '';
  endpoint.hash = '';
  const remotePath = input.remotePath.trim().replace(/^\/+|\/+$/g, '') || 'Sagnex';
  if (remotePath.split('/').some((part) => !part || part === '.' || part === '..')) throw new WebDavError('远端目录无效', 400);
  if (!input.username.trim()) throw new WebDavError('请输入 WebDAV 用户名', 400);
  return { endpoint: endpoint.toString().replace(/\/$/, ''), username: input.username.trim(), remotePath };
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export class WebDavService {
  private password = '';
  private readonly parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false });

  constructor(
    private readonly context: DatabaseContext,
    private readonly store: SagnexStore,
    private readonly fetcher: FetchLike = fetch
  ) {}

  getConfig(): WebDavConfigView | null {
    const row = this.context.raw.prepare('SELECT endpoint, username, remote_path AS remotePath FROM webdav_settings WHERE id = ?').get('default') as Omit<WebDavConfigView, 'passwordSet'> | undefined;
    return row ? { ...row, passwordSet: Boolean(this.password) } : null;
  }

  saveConfig(input: WebDavConfigInput): WebDavConfigView {
    const normalized = normalizeConfig(input);
    if (input.password !== undefined && input.password !== '') this.password = input.password;
    this.context.raw.prepare(`
      INSERT INTO webdav_settings (id, endpoint, username, remote_path, updated_at)
      VALUES ('default', ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET endpoint=excluded.endpoint, username=excluded.username,
        remote_path=excluded.remote_path, updated_at=excluded.updated_at
    `).run(normalized.endpoint, normalized.username, normalized.remotePath, new Date().toISOString());
    return { ...normalized, passwordSet: Boolean(this.password) };
  }

  async test(): Promise<void> {
    await this.ensureDirectory();
    await this.request(this.directoryUrl(), { method: 'PROPFIND', headers: { Depth: '0' } }, [207]);
  }

  async pushLatest(): Promise<WebDavBackupEntry> {
    await this.ensureDirectory();
    await this.putJson('latest.sagnex.json');
    return { name: 'latest.sagnex.json', modifiedAt: new Date().toISOString(), size: null, isLatest: true };
  }

  async createNamed(name: string): Promise<WebDavBackupEntry> {
    await this.ensureDirectory();
    const safeName = name.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').slice(0, 80);
    if (!safeName) throw new WebDavError('请输入备份名称', 400);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const filename = `${stamp}-${safeName}.sagnex.json`;
    await this.putJson(filename);
    return { name: filename, modifiedAt: new Date().toISOString(), size: null, isLatest: false };
  }

  async list(): Promise<WebDavBackupEntry[]> {
    const response = await this.request(this.directoryUrl(), { method: 'PROPFIND', headers: { Depth: '1' } }, [207]);
    const document = this.parser.parse(await response.text()) as any;
    const responses = asArray(document?.multistatus?.response);
    return responses.flatMap((item: any) => {
      const href = typeof item?.href === 'string' ? item.href : '';
      const rawName = decodeURIComponent(href.split('/').filter(Boolean).at(-1) ?? '');
      if (!rawName.endsWith('.sagnex.json')) return [];
      const propstats = asArray(item?.propstat);
      const prop = propstats.find((entry: any) => String(entry?.status ?? '').includes('200'))?.prop ?? propstats[0]?.prop ?? {};
      const size = Number(prop.getcontentlength);
      return [{
        name: rawName,
        modifiedAt: typeof prop.getlastmodified === 'string' ? new Date(prop.getlastmodified).toISOString() : null,
        size: Number.isFinite(size) ? size : null,
        isLatest: rawName === 'latest.sagnex.json'
      }];
    }).sort((a: WebDavBackupEntry, b: WebDavBackupEntry) => {
      if (a.isLatest !== b.isLatest) return a.isLatest ? -1 : 1;
      return (b.modifiedAt ?? '').localeCompare(a.modifiedAt ?? '');
    });
  }

  async download(name: string): Promise<unknown> {
    const response = await this.request(this.fileUrl(this.validateFilename(name)), { method: 'GET' }, [200]);
    try { return JSON.parse(await response.text()); } catch { throw new WebDavError('远端备份不是有效的 JSON 文件'); }
  }

  async restore(name: string): Promise<{ backupPath: string | null }> {
    return this.store.importBackup(await this.download(name));
  }

  async delete(name: string): Promise<void> {
    await this.request(this.fileUrl(this.validateFilename(name)), { method: 'DELETE' }, [200, 204]);
  }

  private validateFilename(name: string): string {
    if (!/^[^/\\]+\.sagnex\.json$/.test(name)) throw new WebDavError('备份文件名无效', 400);
    return name;
  }

  private requireConfig(): WebDavConfigView {
    const config = this.getConfig();
    if (!config) throw new WebDavError('请先配置 WebDAV', 409);
    if (!this.password) throw new WebDavError('API 重启后需要重新输入 WebDAV 应用密码', 409);
    return config;
  }

  private directoryUrl(): URL {
    const config = this.requireConfig();
    return this.buildUrl(config.remotePath);
  }

  private fileUrl(name: string): URL {
    const config = this.requireConfig();
    return this.buildUrl(`${config.remotePath}/${name}`);
  }

  private buildUrl(path: string): URL {
    const config = this.requireConfig();
    const url = new URL(config.endpoint);
    const basePath = url.pathname.replace(/\/$/, '');
    url.pathname = `${basePath}/${path.split('/').map(encodeURIComponent).join('/')}`;
    return url;
  }

  private async ensureDirectory(): Promise<void> {
    const config = this.requireConfig();
    let current = '';
    for (const segment of config.remotePath.split('/')) {
      current = current ? `${current}/${segment}` : segment;
      const response = await this.authorizedFetch(this.buildUrl(current), { method: 'MKCOL' });
      if (![201, 405].includes(response.status)) await this.throwResponse(response);
    }
  }

  private async putJson(name: string): Promise<void> {
    const backup = await this.store.exportBackup();
    await this.request(this.fileUrl(name), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(backup, null, 2)
    }, [200, 201, 204]);
  }

  private async request(url: URL, init: RequestInit, expected: number[]): Promise<Response> {
    const response = await this.authorizedFetch(url, init);
    if (!expected.includes(response.status)) await this.throwResponse(response);
    return response;
  }

  private authorizedFetch(url: URL, init: RequestInit): Promise<Response> {
    const config = this.requireConfig();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Basic ${Buffer.from(`${config.username}:${this.password}`).toString('base64')}`);
    return this.fetcher(url, { ...init, headers });
  }

  private async throwResponse(response: Response): Promise<never> {
    if (response.status === 401 || response.status === 403) throw new WebDavError('WebDAV 认证失败，请检查账号和应用密码', 401);
    if (response.status === 404) throw new WebDavError('远端目录或备份不存在', 404);
    const detail = (await response.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
    throw new WebDavError(`WebDAV 请求失败（${response.status}）${detail ? `：${detail}` : ''}`);
  }
}
