import type { AppRole, Profile } from "@/lib/supabase/types";

export type Permission =
  | "dashboard:super"
  | "dashboard:club"
  | "dashboard:ops"
  | "clubs:read"
  | "clubs:write_request"
  | "events:read"
  | "events:operate"
  | "events:write_request"
  | "promotions:write_request"
  | "approvals:review"
  | "approvals:request"
  | "admins:manage"
  | "audit:read_global"
  | "health:read"
  | "errors:read"
  | "backups:read"
  | "backups:trigger"
  | "settings:manage";

const rolePermissions: Record<AppRole, Permission[]> = {
  super_admin: [
    "dashboard:super",
    "clubs:read",
    "clubs:write_request",
    "events:read",
    "events:operate",
    "events:write_request",
    "promotions:write_request",
    "approvals:review",
    "approvals:request",
    "admins:manage",
    "audit:read_global",
    "health:read",
    "errors:read",
    "backups:read",
    "backups:trigger",
    "settings:manage"
  ],
  club_admin: [
    "dashboard:club",
    "clubs:read",
    "clubs:write_request",
    "events:read",
    "events:write_request",
    "promotions:write_request",
    "approvals:request",
    "errors:read"
  ],
  event_ops: ["dashboard:ops", "events:read", "events:operate", "events:write_request", "approvals:request"]
};

export function hasPermission(role: AppRole, permission: Permission) {
  return rolePermissions[role]?.includes(permission) ?? false;
}

export function assertPermission(profile: Profile, permission: Permission) {
  if (!hasPermission(profile.role, permission)) {
    throw new Error(`Permission denied: ${permission}`);
  }
}

export function canAccessPath(role: AppRole, pathname: string) {
  const rules: Array<[RegExp, Permission]> = [
    [/^\/$/, role === "super_admin" ? "dashboard:super" : role === "club_admin" ? "dashboard:club" : "dashboard:ops"],
    [/^\/events/, "events:read"],
    [/^\/promotions|^\/billboards/, "promotions:write_request"],
    [/^\/approvals/, role === "super_admin" ? "approvals:review" : "approvals:request"],
    [/^\/administrators|^\/team-access|^\/users/, "admins:manage"],
    [/^\/audit-log|^\/activity/, "audit:read_global"],
    [/^\/errors/, "errors:read"],
    [/^\/clubs/, "clubs:read"],
    [/^\/schedule|^\/venues|^\/registrations|^\/operations/, "events:operate"],
    [/^\/system-health/, "health:read"],
    [/^\/backups/, "backups:read"],
    [/^\/settings/, "settings:manage"],
    [/^\/team-members/, "settings:manage"]
  ];
  const match = rules.find(([pattern]) => pattern.test(pathname));
  return match ? hasPermission(role, match[1]) : true;
}
