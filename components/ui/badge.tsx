import { cn } from "@/lib/utils";

const tones = {
  green: "bg-green-50 text-green-600",
  amber: "bg-amber-50 text-amber-600",
  red: "bg-red-50 text-red-600",
  blue: "bg-blue-50 text-blue-600",
  purple: "bg-primary-soft text-primary",
  grey: "bg-slate-100 text-muted"
};

export function Badge({
  children,
  tone = "grey"
}: {
  children: React.ReactNode;
  tone?: keyof typeof tones;
}) {
  return (
    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}
