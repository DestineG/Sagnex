import { z } from 'zod';

export const taskStatusSchema = z.enum([
  'not_started',
  'in_progress',
  'paused',
  'completed'
]);

export const eventStatusSchema = z.enum([
  'creating',
  'ready',
  'in_progress',
  'paused',
  'awaiting_progress',
  'completed'
]);

export const labelIconValues = [
  'tag',
  'book-open',
  'briefcase-business',
  'code-2',
  'calendar-days',
  'flag',
  'star',
  'house',
  'heart-pulse',
  'graduation-cap',
  'palette',
  'plane',
  'shopping-bag',
  'dumbbell',
  'lightbulb',
  'target',
  'wallet-cards',
  'music',
  'camera',
  'users'
] as const;

export const builtinLabelIconSchema = z.enum(labelIconValues);
export const labelIconSchema = z.union([
  builtinLabelIconSchema,
  z.string().startsWith('emoji:').max(40),
  z.string().startsWith('svg:').max(20_004)
]);

export const labelSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string(),
  icon: labelIconSchema.default('tag'),
  usageCount: z.number().int().nonnegative().default(0),
  createdAt: z.string()
});

export const taskSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  status: taskStatusSchema,
  positionX: z.number(),
  positionY: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  statusChangedAt: z.string().optional()
}).transform((task) => ({ ...task, statusChangedAt: task.statusChangedAt ?? task.createdAt }));

export const dependencySchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  sourceTaskId: z.string().uuid(),
  targetTaskId: z.string().uuid(),
  createdAt: z.string()
});

export const stateChangeSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  fromStatus: taskStatusSchema,
  toStatus: taskStatusSchema,
  comment: z.string().max(500).nullable(),
  changedAt: z.string()
});

export const taskCommentSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  content: z.string().min(1).max(1000),
  createdAt: z.string()
});

export const eventSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  status: eventStatusSchema,
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedTasks: z.number().int().nonnegative(),
  totalTasks: z.number().int().nonnegative(),
  labels: z.array(labelSchema),
  previewTasks: z.array(taskSchema).default([]),
  previewDependencies: z.array(dependencySchema).default([])
});

export const eventGraphSchema = eventSummarySchema.extend({
  tasks: z.array(taskSchema),
  dependencies: z.array(dependencySchema)
});

export const createEventInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(''),
  labelIds: z.array(z.string().uuid()).default([])
});

export const updateEventInputSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  labelIds: z.array(z.string().uuid()).optional()
});

export const copyEventInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  mode: z.enum(['shallow', 'deep'])
});

export const createTaskInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(''),
  positionX: z.number().finite().default(80),
  positionY: z.number().finite().default(80)
});

export const updateTaskInputSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).optional()
});

export const updateLayoutInputSchema = z.object({
  positions: z.array(z.object({
    taskId: z.string().uuid(),
    positionX: z.number().finite(),
    positionY: z.number().finite()
  })).min(1)
});

export const createDependencyInputSchema = z.object({
  sourceTaskId: z.string().uuid(),
  targetTaskId: z.string().uuid()
});

export const transitionInputSchema = z.object({
  toStatus: taskStatusSchema.exclude(['not_started']),
  confirmSoftDependencies: z.boolean().default(false),
  comment: z.string().trim().max(500).default('')
});

export const createTaskCommentInputSchema = z.object({
  content: z.string().trim().min(1).max(1000)
});

export const createLabelInputSchema = z.object({
  name: z.string().trim().min(1).max(48),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: labelIconSchema.optional().default('tag')
});

export const updateLabelInputSchema = z.object({
  name: z.string().trim().min(1).max(48).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: labelIconSchema.optional()
}).refine(
  (value) => value.name !== undefined || value.color !== undefined || value.icon !== undefined,
  'At least one field is required'
);

export const backupEnvelopeSchema = z.object({
  schemaVersion: z.literal(3),
  exportedAt: z.string(),
  labels: z.array(z.object({
    id: z.string().uuid(), name: z.string(), color: z.string(), icon: labelIconSchema.default('tag'), createdAt: z.string()
  })),
  events: z.array(z.object({
    id: z.string().uuid(), title: z.string(), description: z.string(), archivedAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string()
  })),
  eventLabels: z.array(z.object({ eventId: z.string().uuid(), labelId: z.string().uuid() })),
  tasks: z.array(taskSchema),
  dependencies: z.array(dependencySchema),
  stateChanges: z.array(stateChangeSchema),
  taskComments: z.array(taskCommentSchema)
});

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type EventStatus = z.infer<typeof eventStatusSchema>;
export type LabelIcon = z.infer<typeof labelIconSchema>;
export type Label = z.infer<typeof labelSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Dependency = z.infer<typeof dependencySchema>;
export type StateChange = z.infer<typeof stateChangeSchema>;
export type TaskComment = z.infer<typeof taskCommentSchema>;
export type EventSummary = z.infer<typeof eventSummarySchema>;
export type EventGraph = z.infer<typeof eventGraphSchema>;
export type BackupEnvelope = z.infer<typeof backupEnvelopeSchema>;
export type CreateEventInput = z.infer<typeof createEventInputSchema>;
export type UpdateEventInput = z.infer<typeof updateEventInputSchema>;
export type CopyEventInput = z.infer<typeof copyEventInputSchema>;
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;
export type UpdateLayoutInput = z.infer<typeof updateLayoutInputSchema>;
export type CreateDependencyInput = z.infer<typeof createDependencyInputSchema>;
export type TransitionInput = z.infer<typeof transitionInputSchema>;
export type CreateTaskCommentInput = z.infer<typeof createTaskCommentInputSchema>;
export type CreateLabelInput = z.input<typeof createLabelInputSchema>;
export type UpdateLabelInput = z.input<typeof updateLabelInputSchema>;
