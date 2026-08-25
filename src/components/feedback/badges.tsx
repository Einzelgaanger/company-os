import { StatusBadge, type StatusTone } from "@/components/shared/StatusBadge";
import type { CommitmentStatus, Priority, ProjectStatus, EscalationStatus } from "@/lib/types";

const STATUS_TONE: Record<CommitmentStatus, StatusTone> = {
  open: "neutral",
  in_progress: "info",
  at_risk: "pending",
  overdue: "danger",
  escalated: "danger",
  done: "ok",
};

const STATUS_LABEL: Record<CommitmentStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  at_risk: "At risk",
  overdue: "Overdue",
  escalated: "Escalated",
  done: "Done",
};

export function CommitmentStatusBadge({ status }: { status: CommitmentStatus }) {
  return <StatusBadge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusBadge>;
}

const PRIORITY_TONE: Record<Priority, StatusTone> = {
  low: "neutral",
  medium: "neutral",
  high: "pending",
  critical: "danger",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <StatusBadge tone={PRIORITY_TONE[priority]}>{priority}</StatusBadge>;
}

const PROJECT_LABEL: Record<ProjectStatus, string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <StatusBadge tone={status === "active" ? "ok" : "neutral"}>{PROJECT_LABEL[status]}</StatusBadge>
  );
}

const ESC_TONE: Record<EscalationStatus, StatusTone> = {
  open: "danger",
  acknowledged: "pending",
  resolved: "ok",
};

const ESC_LABEL: Record<EscalationStatus, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
};

export function EscalationStatusBadge({ status }: { status: EscalationStatus }) {
  return <StatusBadge tone={ESC_TONE[status]}>{ESC_LABEL[status]}</StatusBadge>;
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <StatusBadge tone={role === "owner" ? "ok" : "neutral"}>
      {role[0].toUpperCase() + role.slice(1)}
    </StatusBadge>
  );
}
