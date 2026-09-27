import { AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";

export function EmptyState({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="flex min-h-48 flex-col items-center justify-center p-8 text-center">
      <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-muted">
        <AlertCircle className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-md text-sm leading-6 text-muted">{description}</p>
    </Card>
  );
}
