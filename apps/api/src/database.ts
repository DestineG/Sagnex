import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type SagnexDatabase = BetterSQLite3Database<typeof schema>;

const DATABASE_VERSION = 7;
const validTaskStatuses = ['not_started', 'in_progress', 'paused', 'completed'] as const;

const migrationSql = `
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS labels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'tag',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS event_labels (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  UNIQUE(event_id, label_id)
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('not_started','in_progress','paused','completed')),
  position_x REAL NOT NULL,
  position_y REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status_changed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dependencies (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  source_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  target_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  CHECK(source_task_id <> target_task_id),
  UNIQUE(source_task_id, target_task_id)
);
CREATE TABLE IF NOT EXISTS task_state_changes (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  comment TEXT,
  changed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS webdav_settings (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  username TEXT NOT NULL,
  remote_path TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tasks_event_idx ON tasks(event_id);
CREATE INDEX IF NOT EXISTS dependencies_event_idx ON dependencies(event_id);
CREATE INDEX IF NOT EXISTS state_changes_task_idx ON task_state_changes(task_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS task_comments_task_idx ON task_comments(task_id, created_at DESC);
`;

function migrateDatabase(raw: Database.Database, currentVersion: number) {
  if (currentVersion > DATABASE_VERSION) {
    throw new Error(`数据库版本 ${currentVersion} 高于当前应用支持的版本 ${DATABASE_VERSION}`);
  }

  if (currentVersion < 6) {
    raw.transaction(() => {
      // Voided tasks were replaced by permanent deletion in database version 6.
      raw.prepare("DELETE FROM tasks WHERE status = 'voided'").run();
      raw.pragma('user_version = 6');
    })();
  }

  if (currentVersion < 7) {
    raw.transaction(() => {
      const columns = raw.pragma('table_info(task_state_changes)') as Array<{ name: string }>;
      if (!columns.some((column) => column.name === 'comment')) raw.exec('ALTER TABLE task_state_changes ADD COLUMN comment TEXT');
      raw.exec(`
        CREATE TABLE IF NOT EXISTS task_comments (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS task_comments_task_idx ON task_comments(task_id, created_at DESC);
      `);
      raw.pragma('user_version = 7');
    })();
  }

  raw.exec(`
    CREATE TRIGGER IF NOT EXISTS tasks_status_insert_guard
    BEFORE INSERT ON tasks
    WHEN NEW.status NOT IN ('not_started','in_progress','paused','completed')
    BEGIN
      SELECT RAISE(ABORT, 'invalid task status');
    END;
    CREATE TRIGGER IF NOT EXISTS tasks_status_update_guard
    BEFORE UPDATE OF status ON tasks
    WHEN NEW.status NOT IN ('not_started','in_progress','paused','completed')
    BEGIN
      SELECT RAISE(ABORT, 'invalid task status');
    END;
  `);

  const placeholders = validTaskStatuses.map(() => '?').join(',');
  const invalid = raw.prepare(`SELECT id, status FROM tasks WHERE status NOT IN (${placeholders}) LIMIT 1`).get(...validTaskStatuses) as { id: string; status: string } | undefined;
  if (invalid) {
    throw new Error(`任务 ${invalid.id} 使用了不支持的状态“${invalid.status}”，数据库未通过完整性检查`);
  }
}

export interface DatabaseContext {
  raw: Database.Database;
  db: SagnexDatabase;
  path: string;
  close: () => void;
}

export function createDatabase(path: string): DatabaseContext {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const raw = new Database(path);
  raw.pragma('foreign_keys = ON');
  if (path !== ':memory:') raw.pragma('journal_mode = WAL');
  const currentVersion = raw.pragma('user_version', { simple: true }) as number;
  try {
    raw.exec(migrationSql);
    migrateDatabase(raw, currentVersion);
  } catch (error) {
    raw.close();
    throw error;
  }
  return {
    raw,
    db: drizzle(raw, { schema }),
    path,
    close: () => raw.close()
  };
}
