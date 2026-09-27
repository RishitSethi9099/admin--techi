"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Mail } from "lucide-react";
import { signIn } from "@/lib/actions/auth";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const accountStatus = searchParams.get("status");
  const accountStatusMessage =
    accountStatus === "blocked"
      ? "This admin ID or IP is banned. Ask a Super Admin to remove the ban from Team Access."
      : accountStatus === "suspended"
        ? "This admin account is suspended. Ask a Super Admin to set it back to Active."
        : null;

  return (
    <form
      className="w-full max-w-md rounded-2xl border border-border bg-white p-7 shadow-card"
      action={(formData) => {
        setError(null);
        formData.set("next", searchParams.get("next") ?? "/");
        startTransition(async () => {
          const result = await signIn(formData);
          if (result?.error) setError(result.error);
          if (result?.success) {
            router.push(result.next ?? "/");
            router.refresh();
          }
        });
      }}
    >
      <div className="mb-7">
        <div className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">Techi</div>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Admin sign in</h1>
        <p className="mt-2 text-sm text-muted">Use your invited admin account to manage club content.</p>
      </div>
      <label className="mb-4 block">
        <span className="mb-2 block text-sm font-medium text-foreground">Email</span>
        <span className="flex items-center gap-2 rounded-xl border border-border bg-muted-soft px-3">
          <Mail className="h-4 w-4 text-muted" />
          <input name="email" type="email" required className="h-11 flex-1 bg-transparent outline-none" />
        </span>
      </label>
      <label className="mb-5 block">
        <span className="mb-2 block text-sm font-medium text-foreground">Password</span>
        <span className="flex items-center gap-2 rounded-xl border border-border bg-muted-soft px-3">
          <Lock className="h-4 w-4 text-muted" />
          <input name="password" type="password" required className="h-11 flex-1 bg-transparent outline-none" />
        </span>
      </label>
      {accountStatusMessage ? <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{accountStatusMessage}</p> : null}
      {error ? <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
      <button
        disabled={isPending}
        className="h-11 w-full rounded-xl bg-primary font-semibold text-white transition hover:bg-[#4841da] disabled:opacity-60"
      >
        {isPending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
