export type AppRole = "super_admin" | "club_admin" | "event_ops";
export type AdminStatus = "active" | "invited" | "suspended";
export type ApprovalStatus = "draft" | "pending" | "approved" | "rejected" | "clarification_requested";
export type EventLifecycleStatus = "draft" | "pending_approval" | "approved" | "ready" | "live" | "completed" | "archived";
export type BillboardType = "video" | "poster";
export type HealthStatus = "operational" | "degraded" | "warning" | "critical" | "not_monitored";
export type BackupStatus = "pending" | "running" | "success" | "failed" | "not_configured";

export type Profile = {
  id: string;
  name: string;
  email: string;
  login_id?: string | null;
  role: AppRole;
  club_id: string | null;
  status: AdminStatus;
  id_banned?: boolean;
  ip_banned?: boolean;
  banned_ip?: string | null;
  ban_reason?: string | null;
  last_login_at: string | null;
};

export type Club = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  short_name?: string | null;
  description?: string | null;
  accent?: string | null;
  social?: string | null;
  deleted_at?: string | null;
};

export type Billboard = {
  id: string;
  club_id: string;
  title?: string | null;
  about_club?: string | null;
  type: BillboardType;
  media_url: string;
  display_order?: number;
  active: boolean;
  status: ApprovalStatus;
  rejection_reason: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  clubs?: Club | null;
};

export type TeamMember = {
  id: string;
  name: string;
  photo_url: string | null;
  position: string;
  display_order: number;
};

export type Event = {
  id: string;
  club_id: string;
  title: string;
  description: string;
  event_datetime: string;
  poster_url: string | null;
  status: ApprovalStatus;
  lifecycle_status?: EventLifecycleStatus;
  category?: string | null;
  venue?: string | null;
  registration_url?: string | null;
  rejection_reason: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  deleted_at?: string | null;
  clubs?: Club | null;
};

export type CrashLog = {
  id: string;
  severity: string;
  message: string;
  page_url: string | null;
  source: string;
  error_type: string | null;
  response_time_ms: number | null;
  resolved: boolean;
  environment?: string | null;
  route?: string | null;
  http_status?: number | null;
  frequency?: number;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AuditLog = {
  id: string;
  actor_id: string | null;
  actor_name: string;
  actor_role?: AppRole | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  diff: Record<string, unknown>;
  ip_address?: string | null;
  user_agent?: string | null;
  request_id?: string | null;
  result?: "success" | "failure";
  failure_reason?: string | null;
  created_at: string;
};

export type ApprovalRequest = {
  id: string;
  requested_by: string | null;
  requester_name: string;
  requester_role: AppRole;
  resource_type: string;
  resource_id: string | null;
  action: string;
  risk: "low" | "medium" | "high" | "critical";
  status: ApprovalStatus;
  reason: string | null;
  previous_value: Record<string, unknown>;
  proposed_value: Record<string, unknown>;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
};

export type Notification = {
  id: string;
  recipient_id: string | null;
  role_target: AppRole | null;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical" | "success";
  read_at: string | null;
  related_resource_type: string | null;
  related_resource_id: string | null;
  created_at: string;
};

export type BackupRun = {
  id: string;
  backup_type: string;
  status: BackupStatus;
  started_at: string;
  completed_at: string | null;
  size_bytes: number | null;
  storage_location: string | null;
  failure_reason: string | null;
  manifest: Record<string, unknown>;
};
