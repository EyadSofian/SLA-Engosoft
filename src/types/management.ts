/** Row shapes for the management workspace (mgmt_* tables, served by /api/management). */

export type MgmtKind = 'task' | 'meeting' | 'appointment' | 'reminder' | 'decision';
export type MgmtPriority = 'urgent' | 'high' | 'normal' | 'low';
export type MgmtStatus = 'todo' | 'doing' | 'done' | 'cancelled';
export type MgmtSource = 'dashboard' | 'telegram' | 'api';

/** One task / meeting / appointment. */
export interface MgmtItem {
  id: string;
  kind: MgmtKind;
  title: string;
  details: string | null;
  owner_name: string | null;
  department: string | null;
  priority: MgmtPriority;
  status: MgmtStatus;
  /** Absolute timestamp — the AI already resolved «بكرة الساعة ٢» against Cairo. */
  due_at: string | null;
  duration_min: number | null;
  location: string | null;
  attendees: string[];
  tags: string[];
  source: MgmtSource;
  reporter: string | null;
  raw_text: string | null;
  ai_confidence: number | null;
  /** The AI wasn't sure — shown in its own lane until a human confirms. */
  needs_review: boolean;
  created_at: string;
  updated_at: string;
  done_at: string | null;
}

/** Editable subset — what the form sends on create and on edit. */
export interface MgmtDraft {
  kind: MgmtKind;
  title: string;
  details: string;
  owner_name: string;
  department: string;
  priority: MgmtPriority;
  status: MgmtStatus;
  /** `datetime-local` value (`2026-07-22T14:00`) or '' — converted on send. */
  due_at: string;
  duration_min: string;
  location: string;
  attendees: string;
}

/** One inbound Telegram message, kept whether or not extraction succeeded. */
export interface MgmtIngestEntry {
  id: string;
  source: MgmtSource;
  sender: string | null;
  raw_text: string;
  item_count: number;
  status: 'ok' | 'failed' | 'ignored';
  error: string | null;
  created_at: string;
}

/** What /api/management/session hands back after a correct passcode. */
export interface MgmtSession {
  token: string;
  expires_in_hours: number;
  team: string[];
  departments: string[];
  telegram_enabled: boolean;
  ai_enabled: boolean;
}
