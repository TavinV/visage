import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-6 py-10 text-center", className)}>
      <span className="text-flauzino-slate-300">{icon ?? <Inbox size={28} strokeWidth={1.5} />}</span>
      <p className="text-sm font-medium text-flauzino-slate-700">{title}</p>
      {description && <p className="max-w-sm text-xs text-flauzino-slate-500">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
