import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type SagnexDatabase = BetterSQLite3Database<typeof schema>;

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
  changed_at TEXT NOT NULL
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
`;

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
  raw.exec(migrationSql);
  raw.pragma('user_version = 5');
  return {
    raw,
    db: drizzle(raw, { schema }),
    path,
    close: () => raw.close()
  };
}
