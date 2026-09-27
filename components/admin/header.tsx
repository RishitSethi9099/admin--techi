import { Bell, Search, ShieldCheck } from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import type { Profile } from "@/lib/supabase/types";

export function Header({ profile }: { profile: Profile }) {
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
        <button className="grid h-10 w-10 place-items-center rounded-lg border border-border text-muted" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </button>
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
