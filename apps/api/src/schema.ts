import { real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  archivedAt: text('archived_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const labels = sqliteTable('labels', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  color: text('color').notNull(),
  icon: text('icon').notNull().default('tag'),
  createdAt: text('created_at').notNull()
}, (table) => [uniqueIndex('labels_normalized_name_idx').on(table.normalizedName)]);

export const eventLabels = sqliteTable('event_labels', {
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  labelId: text('label_id').notNull().references(() => labels.id, { onDelete: 'cascade' })
}, (table) => [uniqueIndex('event_labels_pair_idx').on(table.eventId, table.labelId)]);

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status', { enum: ['not_started', 'in_progress', 'paused', 'completed'] }).notNull(),
  positionX: real('position_x').notNull(),
  positionY: real('position_y').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  statusChangedAt: text('status_changed_at').notNull()
});

export const dependencies = sqliteTable('dependencies', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  sourceTaskId: text('source_task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  targetTaskId: text('target_task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull()
}, (table) => [uniqueIndex('dependencies_pair_idx').on(table.sourceTaskId, table.targetTaskId)]);

export const stateChanges = sqliteTable('task_state_changes', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  fromStatus: text('from_status', { enum: ['not_started', 'in_progress', 'paused', 'completed'] }).notNull(),
  toStatus: text('to_status', { enum: ['not_started', 'in_progress', 'paused', 'completed'] }).notNull(),
  comment: text('comment'),
  changedAt: text('changed_at').notNull()
});

export const taskComments = sqliteTable('task_comments', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull()
});

export const webdavSettings = sqliteTable('webdav_settings', {
  id: text('id').primaryKey(),
  endpoint: text('endpoint').notNull(),
  username: text('username').notNull(),
  remotePath: text('remote_path').notNull(),
  updatedAt: text('updated_at').notNull()
});
