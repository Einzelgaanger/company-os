/**
 * Feature flags — Phase 7 email stays off until CASA (C-5).
 */
export type FeatureFlags = {
  /** Gmail/Outlook ingestion — default false. */
  email_ingestion: boolean;
  /** When true, outbound WhatsApp requires human approve (pilot). */
  whatsapp_manual_approve: boolean;
};

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  email_ingestion: false,
  whatsapp_manual_approve: false,
};

export function resolveFeatureFlags(
  overrides: Partial<FeatureFlags> = {},
  env: Record<string, string | undefined> = typeof process !== "undefined"
    ? (process.env as Record<string, string | undefined>)
    : {},
): FeatureFlags {
  return {
    email_ingestion:
      overrides.email_ingestion ?? env.FEATURE_EMAIL_INGESTION === "true",
    whatsapp_manual_approve:
      overrides.whatsapp_manual_approve ??
      env.FEATURE_WHATSAPP_MANUAL_APPROVE !== "false",
  };
}

/** Hard gate: refuse email ingest jobs when flag is off. */
export function assertEmailIngestionEnabled(flags: FeatureFlags): void {
  if (!flags.email_ingestion) {
    throw new Error(
      "C-5: email_ingestion is disabled. Enable only after CASA LoA (Phase 7).",
    );
  }
}
