import { AlertTriangle } from "lucide-react";
import { backendConnectionStatus } from "@/lib/data";

export function ConnectionBanner() {
  if (backendConnectionStatus() === "connected") return null;

  return (
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <strong>Supabase is not connected.</strong> Real authentication, RBAC, audit logs, approvals, errors, and backup records will appear after
        `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and server secrets are configured. No production metrics are being simulated.
      </div>
    </div>
  );
}
