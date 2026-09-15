/**
 * Design tokens — 07_DESIGN_SYSTEM §7.3.
 *
 * `src/index.css` is the source of truth for everything the DOM renders: use the
 * Tailwind classes (`bg-status-waiting-tint`, `text-status-waiting-ink`, …) which
 * resolve to the custom properties declared there.
 *
 * This module exists for one reason: SVG presentation attributes do not perform
 * `var()` substitution, so Recharts `fill`/`stroke` props need literal values.
 * `pnpm check:tokens` asserts these match the CSS declarations exactly, so the
 * two never drift apart.
 *
 * Brand and status are disjoint sets — no colour appears in both, ever (§7.3).
 */

import type { FlowState } from "./flow";

/** Identity and interaction only. Never a status. */
export const BRAND = {
  ink: "#0E1F1A",
  primary: "#0E1F1A",
  /** Lime — marketing/auth CTA fill + logo node; never app control fill; never text on light. */
  accent: "#D3F36B",
  accentWash: "#F4FBE3",
  muted: "#5B6560",
  surface: "#FFFFFF",
  surfaceRaised: "#F8F8F7",
  bg: "#F5F5F3",
  border: "#E5E5E2",
} as const;

export type StatusToken = "moving" | "ready" | "waiting" | "review" | "attention" | "done";

/**
 * Flow states only, on a blue → orange axis. `mark` is for charts and dots,
 * `ink` clears AA on `tint`, `tint` is the chip surface.
 */
export const STATUS: Record<StatusToken, { mark: string; ink: string; tint: string }> = {
  moving: { mark: "#2D7A9E", ink: "#1F5A75", tint: "#EAF2F7" },
  ready: { mark: "#7B837E", ink: "#4C524E", tint: "#F1F2F0" },
  waiting: { mark: "#C77D18", ink: "#8A5410", tint: "#FBF1E2" },
  review: { mark: "#5B7C99", ink: "#3F5A73", tint: "#EDF1F6" },
  attention: { mark: "#B3402B", ink: "#8C2F1F", tint: "#FAEDEA" },
  done: { mark: "#3E7A5B", ink: "#2A5A42", tint: "#EAF3EE" },
};

/** Fever chart zones (§7.3) — reuse the status hues; position carries meaning. */
export const FEVER = {
  ok: "#3E7A5B",
  watch: "#C77D18",
  act: "#B3402B",
} as const;

/**
 * The single mapping from a flow state to a status token. `proposed` and
 * `cancelled` are not flow states the status axis speaks about, so both take the
 * neutral grey rather than inventing a colour for them.
 */
export const STATUS_TOKEN_BY_FLOW_STATE: Record<FlowState, StatusToken> = {
  proposed: "ready",
  ready: "ready",
  active: "moving",
  waiting_internal: "waiting",
  waiting_external: "waiting",
  waiting_decision: "waiting",
  waiting_dependency: "waiting",
  review: "review",
  done: "done",
  cancelled: "ready",
};
