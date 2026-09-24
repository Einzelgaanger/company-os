/**
 * A3 — legal records are read from the API, never from browser storage.
 *
 * `tenant_compliance` holds the org attestation and `users.notice_acknowledged_at`
 * holds the individual acknowledgement. Clearing browser storage must not change
 * what the system will do, so this module has no persistence of its own.
 *
 * When `VITE_API_URL` is unset the SPA is a UI mock with no legal store behind it
 * and no real employee data to process; the gates report `enforced: false` so the
 * demo stays usable rather than pretending to hold a record it does not have.
 */
import { useEffect, useState } from "react";
import { api, apiConfigured, type ApiComplianceRecord, type ApiNoticeAck } from "@/lib/api";
import { db } from "@/lib/db";
import { isMockMode } from "@/lib/supabase";
import type { User } from "@/lib/types";

export const NOTICE_VERSION = "2026-08-v1";

export type LegalGates = {
  loading: boolean;
  /** True when a real legal store is behind these answers. */
  enforced: boolean;
  compliance: ApiComplianceRecord | null;
  notice: ApiNoticeAck | null;
  complianceAttested: boolean;
  noticeAcknowledged: boolean;
};

async function readOrNull<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

export function fetchCompliance(): Promise<ApiComplianceRecord | null> {
  if (!apiConfigured()) return Promise.resolve(null);
  return readOrNull(() => api.getCompliance());
}

export function fetchNoticeAck(): Promise<ApiNoticeAck | null> {
  if (!apiConfigured()) return Promise.resolve(null);
  return readOrNull(() => api.getNoticeAck());
}

type LegalRecords = {
  compliance: ApiComplianceRecord | null;
  notice: ApiNoticeAck | null;
};

/**
 * Reads both legal records once the caller has a tenant to read them for.
 * Gates fail closed: a record that has not arrived yet is not a record.
 *
 * The Fastify API is one store. Supabase is the other: the attestation lives
 * on organizations.settings and the notice ack on the user's notification
 * prefs, which is a column that already exists in production.
 */
export function useLegalGates(user: User | null): LegalGates {
  const enforced = apiConfigured() || !isMockMode;
  const [records, setRecords] = useState<LegalRecords | null>(null);

  useEffect(() => {
    if (!user?.org_id || !enforced) return;
    let cancelled = false;
    void (async () => {
      if (apiConfigured()) {
        const [compliance, notice] = await Promise.all([
          fetchCompliance(),
          fetchNoticeAck(),
        ]);
        if (!cancelled) setRecords({ compliance, notice });
        return;
      }
      const org = await db.getOrg(user.org_id);
      const stored = org?.settings.compliance;
      const version = stored?.employee_notice_version ?? NOTICE_VERSION;
      const ackedAt = user.notification_prefs.notice_acknowledged_at;
      const ackedVersion = user.notification_prefs.notice_acknowledged_version;
      if (cancelled) return;
      setRecords({
        compliance: stored
          ? {
              tenantId: user.org_id,
              attestedByUserId: null,
              attestedAt: stored.attested_at,
              lawfulBasis: stored.lawful_basis,
              high_risk_use_prohibited: true,
              payload: {
                dpoEmail: stored.dpo_email,
                dpiaCompleted: stored.dpia_completed,
                worksCouncilRequired: stored.works_council_required,
                worksCouncilConsulted: stored.works_council_consulted,
                employeeNoticeVersion: stored.employee_notice_version,
              },
            }
          : null,
        notice:
          ackedAt && ackedVersion === version
            ? { userId: user.id, at: ackedAt, version: ackedVersion }
            : null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [user, enforced]);

  if (!enforced) {
    return {
      loading: false,
      enforced: false,
      compliance: null,
      notice: null,
      complianceAttested: true,
      noticeAcknowledged: true,
    };
  }

  if (!records) {
    return {
      loading: Boolean(user?.org_id),
      enforced: true,
      compliance: null,
      notice: null,
      complianceAttested: false,
      noticeAcknowledged: false,
    };
  }

  return {
    loading: false,
    enforced: true,
    compliance: records.compliance,
    notice: records.notice,
    complianceAttested: Boolean(records.compliance?.attestedAt),
    noticeAcknowledged: Boolean(records.notice?.at),
  };
}
