import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Slugify an organization name. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 48);
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : value;
  return isValid(d) ? format(d, "MMM d, yyyy") : "—";
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : value;
  return isValid(d) ? format(d, "MMM d, yyyy · HH:mm") : "—";
}

export function timeAgo(value?: string | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : value;
  return isValid(d) ? `${formatDistanceToNowStrict(d)} ago` : "—";
}

export function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function nowIso(): string {
  return new Date().toISOString();
}
