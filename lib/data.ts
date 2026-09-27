import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";
import type {
  ApprovalRequest,
  AuditLog,
  BackupRun,
  Billboard,
  Club,
  CrashLog,
  Event,
  Notification,
  Profile,
  TeamMember
} from "@/lib/supabase/types";

const demoClubs: Club[] = [];

const demoAdmins: Profile[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Local Demo Admin",
    email: "admin@techi.local",
    login_id: "local-admin",
    role: "super_admin",
    club_id: null,
    status: "active",
    id_banned: false,
    ip_banned: false,
    banned_ip: null,
    ban_reason: null,
    last_login_at: null
  }
];

export async function getClubs() {
  if (!hasSupabaseEnv()) return demoClubs;

  const supabase = createSupabaseServerClient();
  const { data } = await supabase.from("clubs").select("id,name,slug,logo_url").order("name");
  return (data ?? []) as Club[];
}

export async function getAdmins() {
  if (!hasSupabaseEnv()) return demoAdmins;

  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("users")
    .select("id,name,email,login_id,role,club_id,status,id_banned,ip_banned,banned_ip,ban_reason,last_login_at")
    .order("created_at", { ascending: false });
  return (data ?? []) as Profile[];
}

export async function getBillboards() {
  if (!hasSupabaseEnv()) {
    return [] as Billboard[];
  }

  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("billboards")
    .select("*,clubs(id,name,slug,logo_url)")
    .order("updated_at", { ascending: false });
  return (data ?? []) as Billboard[];
}

export async function getTeamMembers() {
  if (!hasSupabaseEnv()) {
    return [] as TeamMember[];
  }

  const supabase = createSupabaseServerClient();
  const { data } = await supabase.from("team_members").select("*").order("display_order");
  return (data ?? []) as TeamMember[];
}

export async function getEvents() {
  if (!hasSupabaseEnv()) {
    return [] as Event[];
  }

  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("events")
    .select("*,clubs(id,name,slug,logo_url)")
    .order("event_datetime");
  return (data ?? []) as Event[];
}

export async function getCrashLogs() {
  if (!hasSupabaseEnv()) {
    return [] as CrashLog[];
  }

  const supabase = createSupabaseServerClient();
  const { data } = await supabase.from("crash_logs").select("*").order("created_at", { ascending: false }).limit(50);
  return (data ?? []) as CrashLog[];
}

export async function getAuditLogs() {
  if (!hasSupabaseEnv()) {
    return [] as AuditLog[];
  }

  const supabase = createSupabaseServerClient();
  const { data } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(100);
  return (data ?? []) as AuditLog[];
}

export async function getApprovalRequests() {
  if (!hasSupabaseEnv()) return [] as ApprovalRequest[];
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.from("approval_requests").select("*").order("created_at", { ascending: false }).limit(100);
  return (data ?? []) as ApprovalRequest[];
}

export async function getNotifications() {
  if (!hasSupabaseEnv()) return [] as Notification[];
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(30);
  return (data ?? []) as Notification[];
}

export async function getBackupRuns() {
  if (!hasSupabaseEnv()) return [] as BackupRun[];
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.from("backup_runs").select("*").order("started_at", { ascending: false }).limit(50);
  return (data ?? []) as BackupRun[];
}

export function backendConnectionStatus() {
  return hasSupabaseEnv() ? "connected" : "not_configured";
}
