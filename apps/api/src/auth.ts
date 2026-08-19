import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { createTransport } from 'nodemailer';
import type { DatabaseContext } from './database.js';

export class AuthError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

export interface AuthOptions {
  allowedEmail?: string;
  smtp?: {
    host: string;
    port: number;
    username: string;
    password: string;
    from: string;
  };
  idleMs?: number;
  maxMs?: number;
  sendCode?: (email: string, code: string) => Promise<void>;
  now?: () => Date;
}

export interface AuthSession {
  id: string;
  email: string;
  expiresAt: string;
}

const normalizeEmail = (email: string) => email.trim().toLocaleLowerCase();
const hashCode = (code: string) => createHash('sha256').update(code).digest('hex');
const dateAfter = (date: Date, milliseconds: number) => new Date(date.getTime() + milliseconds);

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key === name) return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

export function sessionCookie(value: string, secure: boolean, maxAgeSeconds: number): string {
  const attributes = [`sagnex_session=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}

export function clearSessionCookie(secure: boolean): string {
  return sessionCookie('', secure, 0);
}

export class AuthService {
  private readonly allowedEmail: string | null;
  private readonly idleMs: number;
  private readonly maxMs: number;
  private readonly now: () => Date;
  private readonly sendCode: (email: string, code: string) => Promise<void>;
  private readonly lastRequestByKey = new Map<string, number>();

  constructor(private readonly context: DatabaseContext, options: AuthOptions = {}) {
    this.allowedEmail = options.allowedEmail ? normalizeEmail(options.allowedEmail) : null;
    this.idleMs = options.idleMs ?? 14 * 24 * 60 * 60 * 1000;
    this.maxMs = options.maxMs ?? 30 * 24 * 60 * 60 * 1000;
    this.now = options.now ?? (() => new Date());
    this.sendCode = options.sendCode ?? this.createSmtpSender(options.smtp);
  }

  get enabled(): boolean {
    return this.allowedEmail !== null;
  }

  async requestCode(rawEmail: string, rateKey = 'unknown'): Promise<{ expiresAt: string }> {
    const email = normalizeEmail(rawEmail);
    if (!this.allowedEmail || email !== this.allowedEmail) throw new AuthError(403, '该邮箱未被允许登录');
    const now = this.now();
    const previousRequest = this.lastRequestByKey.get(rateKey);
    if (previousRequest && now.getTime() - previousRequest < 60_000) throw new AuthError(429, '验证码发送过于频繁，请稍后再试');
    const recent = this.context.raw.prepare('SELECT created_at as createdAt FROM auth_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1').get(email) as { createdAt?: string } | undefined;
    if (recent?.createdAt && now.getTime() - Date.parse(recent.createdAt) < 60_000) throw new AuthError(429, '验证码发送过于频繁，请稍后再试');
    this.lastRequestByKey.set(rateKey, now.getTime());

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = dateAfter(now, 10 * 60 * 1000);
    const id = randomUUID();
    this.context.raw.prepare('UPDATE auth_codes SET consumed_at = ? WHERE email = ? AND consumed_at IS NULL').run(now.toISOString(), email);
    this.context.raw.prepare('INSERT INTO auth_codes (id, email, code_hash, expires_at, attempts, consumed_at, created_at) VALUES (?, ?, ?, ?, 0, NULL, ?)').run(id, email, hashCode(code), expiresAt.toISOString(), now.toISOString());
    try {
      await this.sendCode(email, code);
    } catch (error) {
      this.context.raw.prepare('DELETE FROM auth_codes WHERE id = ?').run(id);
      this.lastRequestByKey.delete(rateKey);
      throw new AuthError(502, error instanceof Error ? `验证码发送失败：${error.message}` : '验证码发送失败');
    }
    return { expiresAt: expiresAt.toISOString() };
  }

  verifyCode(rawEmail: string, code: string): AuthSession {
    const email = normalizeEmail(rawEmail);
    if (!this.allowedEmail || email !== this.allowedEmail) throw new AuthError(403, '该邮箱未被允许登录');
    const now = this.now();
    const row = this.context.raw.prepare('SELECT id, code_hash as codeHash, expires_at as expiresAt, attempts FROM auth_codes WHERE email = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1').get(email) as { id: string; codeHash: string; expiresAt: string; attempts: number } | undefined;
    if (!row || Date.parse(row.expiresAt) <= now.getTime() || row.attempts >= 5) throw new AuthError(400, '验证码无效或已过期');
    this.context.raw.prepare('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    const expected = Buffer.from(row.codeHash, 'hex');
    const actual = Buffer.from(hashCode(code), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new AuthError(400, '验证码无效或已过期');

    const createdAt = now.toISOString();
    const expiresAt = dateAfter(now, this.idleMs);
    const absoluteExpiresAt = dateAfter(now, this.maxMs);
    const session: AuthSession = { id: randomUUID(), email, expiresAt: expiresAt.toISOString() };
    this.context.raw.transaction(() => {
      this.context.raw.prepare('UPDATE auth_codes SET consumed_at = ? WHERE id = ?').run(createdAt, row.id);
      this.context.raw.prepare('INSERT INTO sessions (id, email, created_at, last_seen_at, expires_at, absolute_expires_at) VALUES (?, ?, ?, ?, ?, ?)').run(session.id, email, createdAt, createdAt, session.expiresAt, absoluteExpiresAt.toISOString());
    })();
    return session;
  }

  getSession(id: string | null): AuthSession | null {
    if (!id) return null;
    const row = this.context.raw.prepare('SELECT id, email, expires_at as expiresAt, absolute_expires_at as absoluteExpiresAt FROM sessions WHERE id = ?').get(id) as { id: string; email: string; expiresAt: string; absoluteExpiresAt: string } | undefined;
    if (!row) return null;
    const now = this.now();
    const absolute = Date.parse(row.absoluteExpiresAt);
    if (Date.parse(row.expiresAt) <= now.getTime() || absolute <= now.getTime()) {
      this.context.raw.prepare('DELETE FROM sessions WHERE id = ?').run(id);
      return null;
    }
    const renewed = new Date(Math.min(dateAfter(now, this.idleMs).getTime(), absolute)).toISOString();
    this.context.raw.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?').run(now.toISOString(), renewed, id);
    return { id: row.id, email: row.email, expiresAt: renewed };
  }

  logout(id: string | null): void {
    if (id) this.context.raw.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  private createSmtpSender(smtp: AuthOptions['smtp']): (email: string, code: string) => Promise<void> {
    if (!smtp) return async () => { throw new Error('未配置 SMTP，无法发送验证码'); };
    const transporter = createTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465, auth: { user: smtp.username, pass: smtp.password } });
    return async (email, code) => {
      await transporter.sendMail({ from: smtp.from, to: email, subject: 'Sagnex 登录验证码', text: `你的 Sagnex 登录验证码是 ${code}，10 分钟内有效。` });
    };
  }
}

export function authOptionsFromEnvironment(env: NodeJS.ProcessEnv): AuthOptions {
  const allowedEmail = env.SAGNEX_AUTH_EMAIL?.trim() || undefined;
  if (!allowedEmail) return {};
  const smtpHost = env.SAGNEX_SMTP_HOST?.trim();
  const smtpUser = env.SAGNEX_SMTP_USER?.trim();
  const smtpPassword = env.SAGNEX_SMTP_PASSWORD ?? '';
  const smtpFrom = env.SAGNEX_SMTP_FROM?.trim() || smtpUser;
  const smtpPort = Number(env.SAGNEX_SMTP_PORT || 587);
  if (!smtpHost || !smtpUser || !smtpPassword || !smtpFrom || !Number.isInteger(smtpPort)) throw new Error('启用邮箱登录时必须完整配置 SAGNEX_SMTP_HOST/PORT/USER/PASSWORD/FROM');
  const days = (name: string, fallback: number) => Math.max(1, Number(env[name] || fallback));
  return { allowedEmail, smtp: { host: smtpHost, port: smtpPort, username: smtpUser, password: smtpPassword, from: smtpFrom }, idleMs: days('SAGNEX_SESSION_IDLE_DAYS', 14) * 86_400_000, maxMs: days('SAGNEX_SESSION_MAX_DAYS', 30) * 86_400_000 };
}
