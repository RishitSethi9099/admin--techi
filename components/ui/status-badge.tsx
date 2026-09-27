import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: string }) {
  const value = status.replaceAll("_", " ");
  const tone =
    status.includes("critical") || status.includes("failed") || status.includes("rejected")
      ? "red"
      : status.includes("warning") || status.includes("pending") || status.includes("degraded") || status.includes("clarification")
        ? "amber"
        : status.includes("approved") || status.includes("success") || status.includes("operational") || status.includes("active")
          ? "green"
          : status.includes("not_")
            ? "grey"
            : "purple";

  return <Badge tone={tone}>{value}</Badge>;
}
