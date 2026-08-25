import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function EmptyState({
  title,
  description,
  action,
  illustration,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  illustration?: ReactNode;
}) {
  return (
    <div className="portal-empty space-y-3">
      {illustration && <div className="flex justify-center text-forest/40">{illustration}</div>}
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-forest">{title}</h3>
        {description && <p className="mx-auto max-w-md text-[11px] font-medium text-[#5A6B7D]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="portal-empty space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-forest">Something went wrong</h3>
        <p className="text-[11px] font-medium text-[#5A6B7D]">Something went wrong loading this. Try again.</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function StatCardsSkeleton() {
  return (
    <div className="portal-metrics">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="stat-card space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-10" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="portal-section">
      <div className="portal-section__body--pad space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
