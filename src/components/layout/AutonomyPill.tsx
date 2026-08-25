import { Activity, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { api, apiConfigured } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";

type SweepInfo = {
  lastRunAt: string | null;
  nextDueAt: string | null;
  notes: string[];
};

/**
 * Read-only autonomy status + admin "Run sweep now" (POST /admin/sweeps/run).
 * Browser engine deleted — sweeps are server-side only (A1).
 */
export function AutonomyPill() {
  const { org, user } = useAuth();
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [info, setInfo] = useState<SweepInfo>({
    lastRunAt: null,
    nextDueAt: null,
    notes: ["Server sweeps run on the scheduler. This pill is read-only."],
  });

  const enabled = org?.settings.autonomy_enabled ?? true;
  const isAdmin = user?.role === "admin" || user?.role === "owner";

  useEffect(() => {
    if (!apiConfigured()) return;
    void api
      .getSweepStatus?.()
      .then((s) => setInfo(s))
      .catch(() => undefined);
  }, []);

  const runNow = useCallback(async () => {
    if (!isAdmin || running) return;
    setRunning(true);
    try {
      if (apiConfigured() && api.runSweep) {
        const res = await api.runSweep();
        setInfo({
          lastRunAt: res.ranAt,
          nextDueAt: res.nextDueAt ?? null,
          notes: res.notes ?? ["Sweep enqueued."],
        });
        toast("Sweep requested", "success");
      } else {
        toast("Connect VITE_API_URL to run server sweeps.", "default");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Sweep failed", "error");
    } finally {
      setRunning(false);
    }
  }, [isAdmin, running, toast]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold outline-none transition-colors",
          enabled
            ? "border-lime/50 bg-mint text-forest hover:bg-lime/30"
            : "border-[rgba(14,31,26,0.1)] bg-soft text-[#5A6B7D] hover:bg-mint",
        )}
        title="Autonomy (server)"
      >
        {running ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <span className="relative flex h-2 w-2">
            {enabled && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-60" />
            )}
            <span
              className={cn(
                "relative inline-flex h-2 w-2 rounded-full",
                enabled ? "bg-lime" : "bg-[#5A6B7D]",
              )}
            />
          </span>
        )}
        Autonomy {enabled ? "on" : "off"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>
          <div className="flex items-center gap-2 text-forest">
            <Activity className="h-4 w-4 text-forest" /> Server autonomy
          </div>
          <p className="mt-1 text-xs font-normal text-[#5A6B7D]">
            Sweeps run on the scheduler. This control does not execute work in the browser.
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-xs text-[#5A6B7D]">
          {info.lastRunAt ? (
            <div className="mb-1 font-medium text-forest">
              Last run {timeAgo(info.lastRunAt)}
            </div>
          ) : (
            <div className="mb-1 font-medium text-forest">No sweep recorded yet</div>
          )}
          <ul className="space-y-0.5">
            {info.notes.map((n, i) => (
              <li key={i}>• {n}</li>
            ))}
          </ul>
        </div>
        {isAdmin ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void runNow()} disabled={running}>
              <RefreshCw className="h-4 w-4" /> Run a sweep now
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
