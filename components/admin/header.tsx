import Link from "next/link";
import { Bell, Search, ShieldCheck } from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import type { Profile } from "@/lib/supabase/types";

export function Header({ profile, openErrors = null }: { profile: Profile; openErrors?: number | null }) {
  const initials = profile.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="flex h-20 items-center justify-between border-b border-border bg-white px-5 lg:px-8">
      <div className="hidden max-w-md flex-1 items-center gap-3 rounded-lg border border-border bg-muted-soft px-3 lg:flex">
        <Search className="h-4 w-4 text-muted" />
        <input className="h-11 flex-1 bg-transparent text-sm outline-none" placeholder="Search records, clubs, incidents" />
      </div>
      <div className="ml-auto flex items-center gap-4">
        <div className="hidden items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-semibold capitalize text-foreground md:flex">
          <ShieldCheck className="h-4 w-4 text-primary" />
          {profile.role.replace("_", " ")}
        </div>
        {openErrors !== null ? (
          <Link
            href="/errors"
            className="relative grid h-10 w-10 place-items-center rounded-lg border border-border text-muted hover:text-foreground"
            aria-label={openErrors ? `${openErrors} open errors` : "Errors"}
            title={openErrors ? `${openErrors} open error${openErrors === 1 ? "" : "s"}` : "No open errors"}
          >
            <Bell className="h-4 w-4" />
            {openErrors ? (
              <span className="absolute -right-1.5 -top-1.5 min-w-[1.25rem] rounded-full bg-red-500 px-1.5 text-center text-[11px] font-bold leading-5 text-white">
                {openErrors > 99 ? "99+" : openErrors}
              </span>
            ) : null}
          </Link>
        ) : null}
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
            {initials}
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-semibold text-foreground">{profile.name}</div>
            <div className="text-xs capitalize text-muted">{profile.role.replace("_", " ")}</div>
          </div>
        </div>
        <form action={signOut}>
          <button className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted transition hover:text-foreground">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
