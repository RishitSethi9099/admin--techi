import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { DEFAULT_ROTATION, loadRotation } from "@/lib/screen-rotation";
import type {
  ApprovalRequest,
  AuditLog,
  BackupRun,
  Billboard,
  Club,
  CrashLog,
  Event,
  EventSlot,
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
  const { data, error } = await supabase.from("clubs").select("id,name,slug,short_name,logo_url").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Club[];
}

export async function getAdmins() {
  if (!hasSupabaseEnv()) return demoAdmins;

  const supabase = createSupabaseServerClient();
  const { data, error: richError } = await supabase
    .from("users")
    .select("id,name,email,login_id,role,club_id,status,id_banned,ip_banned,banned_ip,ban_reason,last_login_at")
    .order("created_at", { ascending: false });
  if (richError) {
    const { data: fallbackData, error } = await supabase
      .from("users")
      .select("id,name,email,role,club_id,status,last_login_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (fallbackData ?? []).map((admin) => ({
      ...admin,
      login_id: null,
      id_banned: false,
      ip_banned: false,
      banned_ip: null,
      ban_reason: null
    })) as Profile[];
  }
  const admins = (data ?? []) as Profile[];
  const adminIds = admins.map((admin) => admin.id);
  if (!adminIds.length) return admins;

  const { data: access } = await supabase
    .from("admin_club_access")
    .select("user_id,clubs(id,name,slug,short_name,logo_url)")
    .in("user_id", adminIds);

  const clubsByAdmin = new Map<string, Club[]>();
  for (const row of access ?? []) {
    const userId = row.user_id as string;
    const club = Array.isArray(row.clubs) ? row.clubs[0] : row.clubs;
    if (!club) continue;
    clubsByAdmin.set(userId, [...(clubsByAdmin.get(userId) ?? []), club as Club]);
  }

  return admins.map((admin) => ({
    ...admin,
    assigned_clubs: clubsByAdmin.get(admin.id) ?? []
  }));
}

export async function getAssignedClubIds(userId: string) {
  if (!hasSupabaseEnv()) return [] as string[];

  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("admin_club_access")
    .select("club_id")
    .eq("user_id", userId);

  return (data ?? []).map((row) => row.club_id as string);
}

export async function getBillboards() {
  if (!hasSupabaseEnv()) {
    return [] as Billboard[];
  }

  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("billboards")
    .select("*,clubs(id,name,slug,short_name,logo_url),event_slots(id,club_id,event_number,event_name,event_tier,required_media_type,active)")
    .order("updated_at", { ascending: false });
  return (data ?? []) as Billboard[];
}

export async function getEventSlots() {
  if (!hasSupabaseEnv()) {
    return [] as EventSlot[];
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("event_slots")
    .select("id,club_id,event_number,event_name,event_tier,required_media_type,active,clubs(id,name,slug,short_name,logo_url)")
    .eq("active", true)
    .order("event_number", { ascending: true });
  if (error) {
    if (error.message.includes("event_slots")) return [] as EventSlot[];
    throw new Error(error.message);
  }
  return (data ?? []).map((slot) => {
    const club = Array.isArray(slot.clubs) ? slot.clubs[0] : slot.clubs;
    return { ...slot, clubs: club ?? null };
  }) as unknown as EventSlot[];
}

export async function getScreenRotation() {
  if (!hasSupabaseEnv()) {
    return { settings: DEFAULT_ROTATION, configured: false, missingTable: false, error: null as string | null };
  }
  return loadRotation(createSupabaseServerClient() as never);
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
  const { data, error } = await supabase
    .from("events")
    .select("*,clubs(id,name,slug,short_name,logo_url)")
    .order("start_datetime", { ascending: true });
  if (error) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("events")
      .select("*,clubs(id,name,slug,short_name,logo_url)")
      .order("event_datetime", { ascending: true });
    if (fallbackError) throw new Error(fallbackError.message);
    return (fallbackData ?? []).map((event) => ({
      ...event,
      start_datetime: event.start_datetime ?? event.event_datetime,
      end_datetime: event.end_datetime ?? event.event_datetime,
      status: event.status === "approved" ? "published" : event.status === "pending" ? "draft" : event.status
    })) as Event[];
  }
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
