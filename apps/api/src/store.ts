import {
  backupEnvelopeSchema,
  type BackupEnvelope,
  type CreateDependencyInput,
  type CreateEventInput,
  type CreateLabelInput,
  type CreateTaskCommentInput,
  type CreateTaskInput,
  type Dependency,
  type EventGraph,
  type EventStatus,
  type EventSummary,
  type Label,
  type StateChange,
  type Task,
  type TaskComment,
  type TaskStatus,
  type UpdateEventInput,
  type UpdateLabelInput,
  type UpdateLayoutInput,
  type UpdateTaskInput
} from '@sagnex/contracts';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DatabaseContext } from './database.js';
import { calculateEventStatus, canTransition, getProgress, selectPreviewTaskIds, wouldCreateCycle } from './domain.js';
import { InvalidLabelIconError, sanitizeLabelIcon } from './label-icon.js';
import { dependencies, eventLabels, events, labels, stateChanges, taskComments, tasks } from './schema.js';

export class StoreError extends Error {
  constructor(public readonly statusCode: number, message: string, public readonly details?: unknown) {
    super(message);
  }
}

interface EventFilters {
  search?: string;
  status?: EventStatus;
  labelId?: string;
  archived?: boolean;
  active?: boolean;
}

const now = () => new Date().toISOString();
const normalizeLabel = (value: string) => value.trim().toLocaleLowerCase();

export class SagnexStore {
  private readonly backupDirectory: string | null;

  constructor(private readonly context: DatabaseContext, options: { backupDirectory?: string } = {}) {
    this.backupDirectory = context.path === ':memory:'
      ? null
      : options.backupDirectory ?? join(dirname(context.path), 'backups');
  }

  getBackupDirectory(): string | null {
    return this.backupDirectory;
  }

  async listLabels(): Promise<Label[]> {
    const rows = await this.context.db
      .select({
        id: labels.id,
        name: labels.name,
        color: labels.color,
        icon: labels.icon,
        createdAt: labels.createdAt,
        usageCount: count(eventLabels.eventId)
      })
      .from(labels)
      .leftJoin(eventLabels, eq(labels.id, eventLabels.labelId))
      .groupBy(labels.id)
      .orderBy(asc(labels.name));
    return rows;
  }

  async createLabel(input: CreateLabelInput): Promise<Label> {
    const timestamp = now();
    let icon: string;
    try { icon = sanitizeLabelIcon(input.icon ?? 'tag'); } catch (error) {
      if (error instanceof InvalidLabelIconError) throw new StoreError(400, error.message);
      throw error;
    }
    const row = { id: crypto.randomUUID(), name: input.name, normalizedName: normalizeLabel(input.name), color: input.color, icon, createdAt: timestamp };
    try {
      await this.context.db.insert(labels).values(row);
    } catch {
      throw new StoreError(409, '同名标签已存在');
    }
    return { id: row.id, name: row.name, color: row.color, icon: row.icon, createdAt: row.createdAt, usageCount: 0 };
  }

  async updateLabel(id: string, input: UpdateLabelInput): Promise<Label> {
    await this.requireLabel(id);
    const values: Partial<typeof labels.$inferInsert> = {};
    if (input.name !== undefined) {
      values.name = input.name;
      values.normalizedName = normalizeLabel(input.name);
    }
    if (input.color !== undefined) values.color = input.color;
    if (input.icon !== undefined) {
      try { values.icon = sanitizeLabelIcon(input.icon); } catch (error) {
        if (error instanceof InvalidLabelIconError) throw new StoreError(400, error.message);
        throw error;
      }
    }
    try {
      await this.context.db.update(labels).set(values).where(eq(labels.id, id));
    } catch {
      throw new StoreError(409, '同名标签已存在');
    }
    const result = (await this.listLabels()).find((label) => label.id === id);
    if (!result) throw new StoreError(404, '标签不存在');
    return result;
  }

  async deleteLabel(id: string): Promise<void> {
    await this.requireLabel(id);
    await this.context.db.delete(labels).where(eq(labels.id, id));
  }

  async listEvents(filters: EventFilters = {}): Promise<EventSummary[]> {
    const [eventRows, taskRows, dependencyRows, labelRows, joinRows] = await Promise.all([
      this.context.db.select().from(events).orderBy(desc(events.updatedAt)),
      this.context.db.select().from(tasks),
      this.context.db.select().from(dependencies),
      this.listLabels(),
      this.context.db.select().from(eventLabels)
    ]);
    const search = filters.search?.trim().toLocaleLowerCase();
    const activeEventIds = filters.active
      ? new Set(taskRows.filter((task) => task.status === 'in_progress' || task.status === 'paused').map((task) => task.eventId))
      : null;
    const result = eventRows.map((event) => {
      const eventTasks = taskRows.filter((task) => task.eventId === event.id) as Task[];
      const eventDependencies = dependencyRows.filter((dependency) => dependency.eventId === event.id) as Dependency[];
      const ids = new Set(joinRows.filter((joinRow) => joinRow.eventId === event.id).map((joinRow) => joinRow.labelId));
      const eventLabelRows = labelRows.filter((label) => ids.has(label.id));
      const status = calculateEventStatus(eventTasks);
      const progress = getProgress(eventTasks);
      const previewIds = selectPreviewTaskIds(eventTasks, eventDependencies);
      return {
        ...event,
        status,
        ...progress,
        labels: eventLabelRows,
        previewTasks: eventTasks.filter((task) => previewIds.has(task.id)),
        previewDependencies: eventDependencies.filter((edge) => previewIds.has(edge.sourceTaskId) && previewIds.has(edge.targetTaskId))
      } satisfies EventSummary;
    });
    return result.filter((event) => {
      if (filters.active && (event.archivedAt !== null || !activeEventIds?.has(event.id))) return false;
      if (filters.archived !== undefined && (event.archivedAt !== null) !== filters.archived) return false;
      if (filters.status && event.status !== filters.status) return false;
      if (filters.labelId && !event.labels.some((label) => label.id === filters.labelId)) return false;
      if (search) {
        const haystack = `${event.title} ${event.description} ${event.labels.map((label) => label.name).join(' ')}`.toLocaleLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }

  async getEvent(id: string): Promise<EventGraph> {
    const event = await this.requireEvent(id);
    const summaries = await this.listEvents();
    const summary = summaries.find((item) => item.id === id);
    if (!summary) throw new StoreError(404, '事件不存在');
    const [eventTasks, eventDependencies] = await Promise.all([
      this.context.db.select().from(tasks).where(eq(tasks.eventId, id)).orderBy(asc(tasks.createdAt)),
      this.context.db.select().from(dependencies).where(eq(dependencies.eventId, id)).orderBy(asc(dependencies.createdAt))
    ]);
    return { ...summary, ...event, tasks: eventTasks as Task[], dependencies: eventDependencies as Dependency[] };
  }

  async createEvent(input: CreateEventInput): Promise<EventGraph> {
    await this.validateLabelIds(input.labelIds);
    const timestamp = now();
    const id = crypto.randomUUID();
    this.context.db.transaction((tx) => {
      tx.insert(events).values({ id, title: input.title, description: input.description, archivedAt: null, createdAt: timestamp, updatedAt: timestamp }).run();
      if (input.labelIds.length > 0) tx.insert(eventLabels).values(input.labelIds.map((labelId) => ({ eventId: id, labelId }))).run();
    });
    return this.getEvent(id);
  }

  async updateEvent(id: string, input: UpdateEventInput): Promise<EventGraph> {
    await this.requireEditableEvent(id);
    if (input.labelIds) await this.validateLabelIds(input.labelIds);
    const values: Partial<typeof events.$inferInsert> = { updatedAt: now() };
    if (input.title !== undefined) values.title = input.title;
    if (input.description !== undefined) values.description = input.description;
    this.context.db.transaction((tx) => {
      tx.update(events).set(values).where(eq(events.id, id)).run();
      if (input.labelIds) {
        tx.delete(eventLabels).where(eq(eventLabels.eventId, id)).run();
        if (input.labelIds.length > 0) tx.insert(eventLabels).values(input.labelIds.map((labelId) => ({ eventId: id, labelId }))).run();
      }
    });
    return this.getEvent(id);
  }

  async setArchived(id: string, archived: boolean): Promise<EventGraph> {
    await this.requireEvent(id);
    const timestamp = now();
    await this.context.db.update(events).set({ archivedAt: archived ? timestamp : null, updatedAt: timestamp }).where(eq(events.id, id));
    return this.getEvent(id);
  }

  async deleteArchivedEvent(id: string): Promise<void> {
    const event = await this.requireEvent(id);
    if (!event.archivedAt) throw new StoreError(409, '只有归档事件可以永久删除');
    await this.context.db.delete(events).where(eq(events.id, id));
  }

  async createTask(eventId: string, input: CreateTaskInput): Promise<Task> {
    await this.requireEditableEvent(eventId);
    const timestamp = now();
    const row: Task = {
      id: crypto.randomUUID(), eventId, title: input.title, description: input.description,
      status: 'not_started', positionX: input.positionX, positionY: input.positionY,
      createdAt: timestamp, updatedAt: timestamp, statusChangedAt: timestamp
    };
    this.context.db.transaction((tx) => {
      tx.insert(tasks).values(row).run();
      tx.update(events).set({ updatedAt: timestamp }).where(eq(events.id, eventId)).run();
    });
    return row;
  }

  async updateTask(taskId: string, input: UpdateTaskInput): Promise<Task> {
    const task = await this.requireTask(taskId);
    await this.requireEditableEvent(task.eventId);
    const timestamp = now();
    const values: Partial<typeof tasks.$inferInsert> = { updatedAt: timestamp };
    if (input.title !== undefined) values.title = input.title;
    if (input.description !== undefined) values.description = input.description;
    this.context.db.transaction((tx) => {
      tx.update(tasks).set(values).where(eq(tasks.id, taskId)).run();
      tx.update(events).set({ updatedAt: timestamp }).where(eq(events.id, task.eventId)).run();
    });
    return this.requireTask(taskId);
  }

  async updateLayout(eventId: string, input: UpdateLayoutInput): Promise<void> {
    await this.requireEditableEvent(eventId);
    const eventTasks = await this.context.db.select({ id: tasks.id }).from(tasks).where(eq(tasks.eventId, eventId));
    const taskIds = new Set(eventTasks.map((task) => task.id));
    if (input.positions.some((position) => !taskIds.has(position.taskId))) throw new StoreError(400, '布局包含其他事件的任务');
    const timestamp = now();
    this.context.db.transaction((tx) => {
      for (const position of input.positions) {
        tx.update(tasks).set({ positionX: position.positionX, positionY: position.positionY, updatedAt: timestamp }).where(eq(tasks.id, position.taskId)).run();
      }
      tx.update(events).set({ updatedAt: timestamp }).where(eq(events.id, eventId)).run();
    });
  }

  async deleteTask(taskId: string): Promise<void> {
    const task = await this.requireTask(taskId);
    await this.requireEditableEvent(task.eventId);
    const timestamp = now();
    this.context.db.transaction((tx) => {
      tx.delete(tasks).where(eq(tasks.id, taskId)).run();
      tx.update(events).set({ updatedAt: timestamp }).where(eq(events.id, task.eventId)).run();
    });
  }

  async transitionTask(taskId: string, toStatus: TaskStatus, confirmSoftDependencies: boolean, comment = ''): Promise<{ task: Task; unmetDependencies: Task[] }> {
    const task = await this.requireTask(taskId);
    await this.requireEditableEvent(task.eventId);
    if (!canTransition(task.status, toStatus)) throw new StoreError(409, `不能从 ${task.status} 切换到 ${toStatus}`);
    const unmetDependencies = toStatus === 'in_progress' ? await this.getUnmetDependencies(task) : [];
    if (unmetDependencies.length > 0 && !confirmSoftDependencies) {
      throw new StoreError(409, '前置任务尚未完成', { code: 'SOFT_DEPENDENCY_CONFIRMATION', tasks: unmetDependencies });
    }
    const timestamp = now();
    this.context.db.transaction((tx) => {
      tx.update(tasks).set({ status: toStatus, updatedAt: timestamp, statusChangedAt: timestamp }).where(eq(tasks.id, taskId)).run();
      tx.insert(stateChanges).values({ id: crypto.randomUUID(), taskId, fromStatus: task.status, toStatus, comment: comment.trim() || null, changedAt: timestamp }).run();
      tx.update(events).set({ updatedAt: timestamp }).where(eq(events.id, task.eventId)).run();
    });
    return { task: await this.requireTask(taskId), unmetDependencies };
  }

  async getTaskHistory(taskId: string): Promise<StateChange[]> {
    await this.requireTask(taskId);
    return this.context.db.select().from(stateChanges).where(eq(stateChanges.taskId, taskId)).orderBy(desc(stateChanges.changedAt)) as Promise<StateChange[]>;
  }

  async listTaskComments(taskId: string): Promise<TaskComment[]> {
    await this.requireTask(taskId);
    return this.context.db.select().from(taskComments).where(eq(taskComments.taskId, taskId)).orderBy(desc(taskComments.createdAt)) as Promise<TaskComment[]>;
  }

  async createTaskComment(taskId: string, input: CreateTaskCommentInput): Promise<TaskComment> {
    const task = await this.requireTask(taskId);
    await this.requireEditableEvent(task.eventId);
    const row: TaskComment = { id: crypto.randomUUID(), taskId, content: input.content, createdAt: now() };
    this.context.db.transaction((tx) => {
      tx.insert(taskComments).values(row).run();
      tx.update(events).set({ updatedAt: row.createdAt }).where(eq(events.id, task.eventId)).run();
    });
    return row;
  }

  async deleteTaskComment(id: string): Promise<void> {
    const [comment] = await this.context.db.select().from(taskComments).where(eq(taskComments.id, id)).limit(1);
    if (!comment) throw new StoreError(404, '任务评论不存在');
    const task = await this.requireTask(comment.taskId);
    await this.requireEditableEvent(task.eventId);
    const timestamp = now();
    this.context.db.transaction((tx) => {
      tx.delete(taskComments).where(eq(taskComments.id, id)).run();
      tx.update(events).set({ updatedAt: timestamp }).where(eq(events.id, task.eventId)).run();
    });
  }

  async createDependency(eventId: string, input: CreateDependencyInput): Promise<Dependency> {
    await this.requireEditableEvent(eventId);
    const [source, target] = await Promise.all([this.requireTask(input.sourceTaskId), this.requireTask(input.targetTaskId)]);
    if (source.eventId !== eventId || target.eventId !== eventId) throw new StoreError(400, '依赖任务必须属于同一事件');
    const eventDependencies = await this.context.db.select().from(dependencies).where(eq(dependencies.eventId, eventId));
    if (eventDependencies.some((edge) => edge.sourceTaskId === input.sourceTaskId && edge.targetTaskId === input.targetTaskId)) throw new StoreError(409, '依赖关系已经存在');
    if (wouldCreateCycle(eventDependencies as Dependency[], input.sourceTaskId, input.targetTaskId)) throw new StoreError(409, '依赖关系不能形成环');
    const timestamp = now();
    const row: Dependency = { id: crypto.randomUUID(), eventId, ...input, createdAt: timestamp };
    this.context.db.transaction((tx) => {
      tx.insert(dependencies).values(row).run();
      tx.update(events).set({ updatedAt: timestamp }).where(eq(events.id, eventId)).run();
    });
    return row;
  }

  async deleteDependency(id: string): Promise<void> {
    const [dependency] = await this.context.db.select().from(dependencies).where(eq(dependencies.id, id)).limit(1);
    if (!dependency) throw new StoreError(404, '依赖关系不存在');
    await this.requireEditableEvent(dependency.eventId);
    const timestamp = now();
    this.context.db.transaction((tx) => {
      tx.delete(dependencies).where(eq(dependencies.id, id)).run();
      tx.update(events).set({ updatedAt: timestamp }).where(eq(events.id, dependency.eventId)).run();
    });
  }

  async exportBackup(): Promise<BackupEnvelope> {
    const [labelRows, eventRows, joinRows, taskRows, dependencyRows, changeRows, commentRows] = await Promise.all([
      this.context.db.select().from(labels), this.context.db.select().from(events), this.context.db.select().from(eventLabels),
      this.context.db.select().from(tasks), this.context.db.select().from(dependencies), this.context.db.select().from(stateChanges),
      this.context.db.select().from(taskComments)
    ]);
    return {
      schemaVersion: 3,
      exportedAt: now(),
      labels: labelRows.map((label) => ({ id: label.id, name: label.name, color: label.color, icon: label.icon, createdAt: label.createdAt })),
      events: eventRows,
      eventLabels: joinRows,
      tasks: taskRows as Task[],
      dependencies: dependencyRows as Dependency[],
      stateChanges: changeRows as StateChange[],
      taskComments: commentRows as TaskComment[]
    };
  }

  async exportEvent(eventId: string): Promise<BackupEnvelope> {
    const all = await this.exportBackup();
    const event = all.events.find((item) => item.id === eventId);
    if (!event) throw new StoreError(404, '事件不存在');
    const eventTasks = all.tasks.filter((task) => task.eventId === eventId);
    const taskIds = new Set(eventTasks.map((task) => task.id));
    const joins = all.eventLabels.filter((joinRow) => joinRow.eventId === eventId);
    const labelIds = new Set(joins.map((joinRow) => joinRow.labelId));
    return {
      ...all,
      labels: all.labels.filter((label) => labelIds.has(label.id)),
      events: [event],
      eventLabels: joins,
      tasks: eventTasks,
      dependencies: all.dependencies.filter((edge) => edge.eventId === eventId),
      stateChanges: all.stateChanges.filter((change) => taskIds.has(change.taskId)),
      taskComments: all.taskComments.filter((comment) => taskIds.has(comment.taskId))
    };
  }

  async importBackup(input: unknown): Promise<{ backupPath: string | null }> {
    const backup = backupEnvelopeSchema.parse(input);
    try {
      for (const label of backup.labels) label.icon = sanitizeLabelIcon(label.icon);
    } catch (error) {
      if (error instanceof InvalidLabelIconError) throw new StoreError(400, error.message);
      throw error;
    }
    this.validateBackupReferences(backup);
    let backupPath: string | null = null;
    if (this.backupDirectory) {
      mkdirSync(this.backupDirectory, { recursive: true });
      backupPath = join(this.backupDirectory, `sagnex-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
      await this.context.raw.backup(backupPath);
    }
    const replace = this.context.raw.transaction(() => {
      this.context.raw.exec('DELETE FROM events; DELETE FROM labels;');
      const insertLabel = this.context.raw.prepare('INSERT INTO labels (id,name,normalized_name,color,icon,created_at) VALUES (?,?,?,?,?,?)');
      const insertEvent = this.context.raw.prepare('INSERT INTO events (id,title,description,archived_at,created_at,updated_at) VALUES (?,?,?,?,?,?)');
      const insertJoin = this.context.raw.prepare('INSERT INTO event_labels (event_id,label_id) VALUES (?,?)');
      const insertTask = this.context.raw.prepare('INSERT INTO tasks (id,event_id,title,description,status,position_x,position_y,created_at,updated_at,status_changed_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
      const insertDependency = this.context.raw.prepare('INSERT INTO dependencies (id,event_id,source_task_id,target_task_id,created_at) VALUES (?,?,?,?,?)');
      const insertChange = this.context.raw.prepare('INSERT INTO task_state_changes (id,task_id,from_status,to_status,comment,changed_at) VALUES (?,?,?,?,?,?)');
      const insertComment = this.context.raw.prepare('INSERT INTO task_comments (id,task_id,content,created_at) VALUES (?,?,?,?)');
      for (const label of backup.labels) insertLabel.run(label.id, label.name, normalizeLabel(label.name), label.color, label.icon, label.createdAt);
      for (const event of backup.events) insertEvent.run(event.id, event.title, event.description, event.archivedAt, event.createdAt, event.updatedAt);
      for (const joinRow of backup.eventLabels) insertJoin.run(joinRow.eventId, joinRow.labelId);
      for (const task of backup.tasks) insertTask.run(task.id, task.eventId, task.title, task.description, task.status, task.positionX, task.positionY, task.createdAt, task.updatedAt, task.statusChangedAt);
      for (const edge of backup.dependencies) insertDependency.run(edge.id, edge.eventId, edge.sourceTaskId, edge.targetTaskId, edge.createdAt);
      for (const change of backup.stateChanges) insertChange.run(change.id, change.taskId, change.fromStatus, change.toStatus, change.comment, change.changedAt);
      for (const comment of backup.taskComments) insertComment.run(comment.id, comment.taskId, comment.content, comment.createdAt);
    });
    replace();
    return { backupPath };
  }

  private async getUnmetDependencies(task: Task): Promise<Task[]> {
    const incoming = await this.context.db.select().from(dependencies).where(and(eq(dependencies.eventId, task.eventId), eq(dependencies.targetTaskId, task.id)));
    if (incoming.length === 0) return [];
    const sourceIds = incoming.map((edge) => edge.sourceTaskId);
    const sources = await this.context.db.select().from(tasks).where(inArray(tasks.id, sourceIds));
    return sources.filter((source) => source.status !== 'completed') as Task[];
  }

  private validateBackupReferences(backup: BackupEnvelope): void {
    const eventIds = new Set(backup.events.map((event) => event.id));
    const labelIds = new Set(backup.labels.map((label) => label.id));
    const taskIds = new Set(backup.tasks.map((task) => task.id));
    if (backup.tasks.some((task) => !eventIds.has(task.eventId))) throw new StoreError(400, '备份中存在无效任务引用');
    if (backup.eventLabels.some((joinRow) => !eventIds.has(joinRow.eventId) || !labelIds.has(joinRow.labelId))) throw new StoreError(400, '备份中存在无效标签引用');
    if (backup.dependencies.some((edge) => !eventIds.has(edge.eventId) || !taskIds.has(edge.sourceTaskId) || !taskIds.has(edge.targetTaskId))) throw new StoreError(400, '备份中存在无效依赖引用');
    if (backup.stateChanges.some((change) => !taskIds.has(change.taskId))) throw new StoreError(400, '备份中存在无效历史引用');
    if (backup.taskComments.some((comment) => !taskIds.has(comment.taskId))) throw new StoreError(400, '备份中存在无效评论引用');
  }

  private async requireEvent(id: string): Promise<typeof events.$inferSelect> {
    const [event] = await this.context.db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!event) throw new StoreError(404, '事件不存在');
    return event;
  }

  private async requireEditableEvent(id: string): Promise<typeof events.$inferSelect> {
    const event = await this.requireEvent(id);
    if (event.archivedAt) throw new StoreError(409, '归档事件不能编辑，请先恢复');
    return event;
  }

  private async requireTask(id: string): Promise<Task> {
    const [task] = await this.context.db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    if (!task) throw new StoreError(404, '任务不存在');
    return task as Task;
  }

  private async requireLabel(id: string): Promise<typeof labels.$inferSelect> {
    const [label] = await this.context.db.select().from(labels).where(eq(labels.id, id)).limit(1);
    if (!label) throw new StoreError(404, '标签不存在');
    return label;
  }

  private async validateLabelIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const rows = await this.context.db.select({ id: labels.id }).from(labels).where(inArray(labels.id, ids));
    if (rows.length !== new Set(ids).size) throw new StoreError(400, '包含不存在的标签');
  }
}
