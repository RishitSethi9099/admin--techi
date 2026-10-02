"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Archive,
  CalendarDays,
  CheckSquare,
  LayoutGrid,
  MonitorPlay,
  ScrollText,
  Users
} from "lucide-react";
import type { AppRole } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import { canAccessPath } from "@/lib/permissions";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/team-access", label: "Team Access", icon: Users },
  { href: "/errors", label: "Errors", icon: Activity },
  { href: "/billboards", label: "Billboards", icon: MonitorPlay },
  { href: "/events", label: "Events, Schedule & Venue", icon: CalendarDays },
  { href: "/audit-log", label: "Audit Log", icon: ScrollText },
  { href: "/approvals", label: "Approvals", icon: CheckSquare },
  { href: "/backups", label: "Backups", icon: Archive }
];

export function Sidebar({ role, openErrors = null }: { role: AppRole; openErrors?: number | null }) {
  const activePath = usePathname();

  return (
    <aside className="hidden min-h-screen w-72 shrink-0 bg-sidebar px-4 py-5 text-white lg:block">
      <div className="px-3">
        <div className="text-xl font-bold">Techi</div>
        <div className="mt-1 text-xs text-slate-300">Society control room</div>
      </div>
      <nav className="mt-8 space-y-1">
        {nav
          .filter((item) => canAccessPath(role, item.href))
          .map((item) => {
            const Icon = item.icon;
            const active = item.href === "/" ? activePath === "/" : activePath === item.href || activePath.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-sidebar-hover",
                  active && "bg-sidebar-hover text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {item.href === "/errors" && openErrors ? (
                  <span className="min-w-[1.5rem] rounded-full bg-red-500 px-2 py-0.5 text-center text-xs font-bold text-white" aria-label={`${openErrors} open errors`}>
                    {openErrors > 99 ? "99+" : openErrors}
                  </span>
                ) : null}
              </Link>
            );
          })}
      </nav>
    </aside>
  );
}
