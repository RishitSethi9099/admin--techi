import { Card } from "@/components/ui/card";

export function MetricCard({
  label,
  value,
  note
}: {
  label: string;
  value: string | number;
  note?: string;
}) {
  return (
    <Card className="p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
      {note ? <div className="mt-1 text-xs text-muted">{note}</div> : null}
    </Card>
  );
}
