import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDatabase } from './database.js';

describe('database migrations', () => {
  it('removes legacy voided tasks and their related records', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'sagnex-migration-')), 'legacy.sqlite');
    const legacy = new Database(path);
    legacy.pragma('foreign_keys = ON');
    legacy.exec(`
      CREATE TABLE events (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE tasks (id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK(status IN ('not_started','in_progress','paused','completed','voided')), position_x REAL NOT NULL, position_y REAL NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, status_changed_at TEXT NOT NULL);
      CREATE TABLE dependencies (id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE, source_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, target_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, created_at TEXT NOT NULL, CHECK(source_task_id <> target_task_id), UNIQUE(source_task_id, target_task_id));
      CREATE TABLE task_state_changes (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, from_status TEXT NOT NULL, to_status TEXT NOT NULL, changed_at TEXT NOT NULL);
      PRAGMA user_version = 5;
      INSERT INTO events VALUES ('event', '事件', '', NULL, '2026-01-01', '2026-01-01');
      INSERT INTO tasks VALUES ('kept', 'event', '保留', '', 'not_started', 0, 0, '2026-01-01', '2026-01-01', '2026-01-01');
      INSERT INTO tasks VALUES ('removed', 'event', '作废', '', 'voided', 0, 0, '2026-01-01', '2026-01-01', '2026-01-01');
      INSERT INTO dependencies VALUES ('edge', 'event', 'kept', 'removed', '2026-01-01');
      INSERT INTO task_state_changes VALUES ('change', 'removed', 'in_progress', 'voided', '2026-01-01');
    `);
    legacy.close();

    const context = createDatabase(path);
    expect(context.raw.pragma('user_version', { simple: true })).toBe(8);
    expect(context.raw.prepare('SELECT id FROM tasks ORDER BY id').all()).toEqual([{ id: 'kept' }]);
    expect(context.raw.prepare('SELECT id FROM dependencies').all()).toEqual([]);
    expect(context.raw.prepare('SELECT id FROM task_state_changes').all()).toEqual([]);
    expect(context.raw.pragma('table_info(task_state_changes)')).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'comment' })]));
    expect(context.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'task_comments'").get()).toEqual({ name: 'task_comments' });
    expect(() => context.raw.prepare("INSERT INTO tasks VALUES ('invalid', 'event', '非法', '', 'voided', 0, 0, '2026-01-01', '2026-01-01', '2026-01-01')").run()).toThrow();
    context.close();
  });
});
