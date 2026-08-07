import type {
  BackupEnvelope,
  CopyEventInput,
  CreateDependencyInput,
  CreateEventInput,
  CreateLabelInput,
  CreateTaskInput,
  EventStatus,
  EventGraph,
  EventSummary,
  Label,
  StateChange,
  Task,
  TaskComment,
  TaskStatus,
  UpdateEventInput,
  UpdateLabelInput,
  UpdateLayoutInput,
  UpdateTaskInput
} from '@sagnex/contracts';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly details?: any) {
    super(message);
  }
}

export interface WebDavConfig {
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, {
    ...init,
    headers
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: '请求失败' }));
    throw new ApiError(payload.message ?? '请求失败', response.status, payload.details);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const json = (value: unknown): RequestInit => ({ body: JSON.stringify(value) });

export const api = {
  listEvents: (query = '') => request<EventSummary[]>(`/api/events${query}`),
  getEvent: (id: string) => request<EventGraph>(`/api/events/${id}`),
  createEvent: (input: CreateEventInput) => request<EventGraph>('/api/events', { method: 'POST', ...json(input) }),
  copyEvent: (eventId: string, input: CopyEventInput) => request<EventGraph>(`/api/events/${eventId}/copy`, { method: 'POST', ...json(input) }),
  updateEvent: (id: string, input: UpdateEventInput) => request<EventGraph>(`/api/events/${id}`, { method: 'PATCH', ...json(input) }),
  archiveEvent: (id: string) => request<EventGraph>(`/api/events/${id}/archive`, { method: 'POST' }),
  restoreEvent: (id: string) => request<EventGraph>(`/api/events/${id}/restore`, { method: 'POST' }),
  deleteEvent: (id: string) => request<void>(`/api/events/${id}`, { method: 'DELETE' }),
  createTask: (eventId: string, input: CreateTaskInput) => request<Task>(`/api/events/${eventId}/tasks`, { method: 'POST', ...json(input) }),
  updateTask: (taskId: string, input: UpdateTaskInput) => request<Task>(`/api/tasks/${taskId}`, { method: 'PATCH', ...json(input) }),
  deleteTask: (taskId: string) => request<void>(`/api/tasks/${taskId}`, { method: 'DELETE' }),
  transitionTask: (taskId: string, toStatus: TaskStatus, confirmSoftDependencies = false, comment = '') => request<{ task: Task }>(`/api/tasks/${taskId}/transition`, { method: 'POST', ...json({ toStatus, confirmSoftDependencies, comment }) }),
  getTaskHistory: (taskId: string) => request<StateChange[]>(`/api/tasks/${taskId}/history`),
  listTaskComments: (taskId: string) => request<TaskComment[]>(`/api/tasks/${taskId}/comments`),
  createTaskComment: (taskId: string, content: string) => request<TaskComment>(`/api/tasks/${taskId}/comments`, { method: 'POST', ...json({ content }) }),
  deleteTaskComment: (id: string) => request<void>(`/api/task-comments/${id}`, { method: 'DELETE' }),
  updateLayout: (eventId: string, input: UpdateLayoutInput) => request<void>(`/api/events/${eventId}/layout`, { method: 'PATCH', ...json(input) }),
  createDependency: (eventId: string, input: CreateDependencyInput) => request(`/api/events/${eventId}/dependencies`, { method: 'POST', ...json(input) }),
  deleteDependency: (id: string) => request<void>(`/api/dependencies/${id}`, { method: 'DELETE' }),
  listLabels: () => request<Label[]>('/api/labels'),
  createLabel: (input: CreateLabelInput) => request<Label>('/api/labels', { method: 'POST', ...json(input) }),
  updateLabel: (id: string, input: UpdateLabelInput) => request<Label>(`/api/labels/${id}`, { method: 'PATCH', ...json(input) }),
  deleteLabel: (id: string) => request<void>(`/api/labels/${id}`, { method: 'DELETE' }),
  dataInfo: () => request<{ databasePath: string; backupDirectory: string | null; eventCount: number; taskCount: number; labelCount: number }>('/api/data/info'),
  exportBackup: () => request<BackupEnvelope>('/api/backups/export'),
  exportEvent: (id: string) => request<BackupEnvelope>(`/api/events/${id}/export`),
  importBackup: (data: unknown) => request<{ backupPath: string | null }>('/api/backups/import', { method: 'POST', ...json(data) }),
  getWebDavConfig: () => request<WebDavConfig | null>('/api/webdav/config'),
  saveWebDavConfig: (input: { endpoint: string; username: string; password?: string; remotePath: string }) => request<WebDavConfig>('/api/webdav/config', { method: 'PUT', ...json(input) }),
  testWebDav: () => request<{ ok: true }>('/api/webdav/test', { method: 'POST' }),
  pushLatestWebDav: () => request<WebDavBackupEntry>('/api/webdav/backups/latest', { method: 'POST' }),
  createNamedWebDav: (name: string) => request<WebDavBackupEntry>('/api/webdav/backups/named', { method: 'POST', ...json({ name }) }),
  listWebDavBackups: () => request<WebDavBackupEntry[]>('/api/webdav/backups'),
  downloadWebDavBackup: (name: string) => request<BackupEnvelope>(`/api/webdav/backups/${encodeURIComponent(name)}`),
  restoreWebDavBackup: (name: string) => request<{ backupPath: string | null }>(`/api/webdav/backups/${encodeURIComponent(name)}/restore`, { method: 'POST' }),
  deleteWebDavBackup: (name: string) => request<void>(`/api/webdav/backups/${encodeURIComponent(name)}`, { method: 'DELETE' })
};

export function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const eventStatusText: Record<EventStatus, string> = {
  creating: '创建中',
  ready: '待开始',
  in_progress: '进行中',
  paused: '已暂停',
  awaiting_progress: '待推进',
  completed: '已完成'
};
export const taskStatusText: Record<TaskStatus, string> = {
  not_started: '未开始', in_progress: '进行中', paused: '已暂停', completed: '已完成'
};

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function formatStatusDate(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function exportStamp() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}
