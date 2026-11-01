/**
 * The FieldKit domain.
 *
 * Deliberately free of React, React Native and any Expo module: the offline
 * model and the sync engine are plain TypeScript, which is what makes them
 * testable in Node without a simulator attached.
 */

export const JOB_STATUSES = [
  "scheduled",
  "en_route",
  "on_site",
  "blocked",
  "completed",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_PRIORITIES = ["low", "normal", "high", "emergency"] as const;
export type JobPriority = (typeof JOB_PRIORITIES)[number];

export interface ChecklistItem {
  id: string;
  label: string;
  /** Required items must be done before a job can be completed. */
  required: boolean;
  done: boolean;
}

export interface JobNote {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
}

/**
 * A field job.
 *
 * `rev` is the revision the *server* last assigned. It is the token the sync
 * engine sends back so the server can detect that this device was working
 * from an outdated copy. It is bumped by the server, never by the client.
 */
export interface Job {
  id: string;
  reference: string;
  title: string;
  customerName: string;
  siteAddress: string;
  /** ISO-8601 instant the visit is scheduled for. */
  scheduledFor: string;
  priority: JobPriority;
  status: JobStatus;
  assigneeId: string | null;
  checklist: ChecklistItem[];
  notes: JobNote[];
  /** Free-text completion summary, required when completing a job. */
  completionNotes: string;
  updatedAt: string;
  rev: number;
}

/** The subset of a job a technician can change from the device. */
export const MUTABLE_FIELDS = [
  "status",
  "priority",
  "checklist",
  "notes",
  "completionNotes",
] as const;
export type MutableField = (typeof MUTABLE_FIELDS)[number];

export type MutationKind =
  | "set_status"
  | "set_priority"
  | "toggle_checklist"
  | "add_note"
  | "complete_job";

export interface Mutation {
  /** Stable client-generated id. Doubles as the idempotency key. */
  id: string;
  jobId: string;
  kind: MutationKind;
  payload: Record<string, unknown>;
  createdAt: string;
  /** The server revision this change was made against. */
  baseRev: number;
  attempts: number;
  /** Next time this mutation may be retried (epoch ms). */
  nextAttemptAt: number;
  lastError: string | null;
  /** Set once the mutation has exhausted its retries. */
  deadLettered: boolean;
}

export type ConflictResolution = "keep_mine" | "keep_theirs";

/**
 * A field the device and the server both changed since the device last
 * synced. Held until a human decides — automatic resolution of genuinely
 * competing edits is how field apps quietly lose a technician's work.
 */
export interface Conflict {
  id: string;
  jobId: string;
  field: MutableField;
  mine: unknown;
  theirs: unknown;
  base: unknown;
  detectedAt: string;
}

export type SyncPhase = "idle" | "syncing" | "offline" | "error";

export interface SyncState {
  phase: SyncPhase;
  pending: number;
  deadLettered: number;
  conflicts: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}
