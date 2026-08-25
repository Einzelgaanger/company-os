import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import * as argon2 from "argon2";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { createHash, randomBytes } from "node:crypto";

/** Password helpers — wire to `users.password_hash` in Phase 0 completion. */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

const ACCESS_TTL_SEC = 15 * 60; // 15 minutes
const REFRESH_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

export type AccessClaims = JWTPayload & {
  sub: string;
  tid: string;
  role: string;
  sid: string;
  typ: "access";
};

export type SessionStub = {
  sessionId: string;
  familyId: string;
  userId: string;
  tenantId: string;
  role: string;
  refreshHash: string;
  expiresAt: Date;
  revoked: boolean;
};

/** In-memory session store — replace with `sessions` table in Phase 0 completion. */
const sessions = new Map<string, SessionStub>();

function accessSecret(): Uint8Array {
  const raw = process.env.JWT_ACCESS_SECRET;
  if (!raw || raw.trim().length < 16) {
    throw new Error(
      "JWT_ACCESS_SECRET is required (min 16 chars). Refusing to boot with a fallback secret.",
    );
  }
  return new TextEncoder().encode(raw);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueAccessToken(input: {
  userId: string;
  tenantId: string;
  role: string;
  sessionId: string;
}): Promise<string> {
  return new SignJWT({
    tid: input.tenantId,
    role: input.role,
    sid: input.sessionId,
    typ: "access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(accessSecret());
}

/** Create a session + refresh token (hashed at rest). Stubs rotation family. */
export async function createSession(input: {
  userId: string;
  tenantId: string;
  role: string;
}): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> {
  const sessionId = randomBytes(16).toString("hex");
  const familyId = randomBytes(16).toString("hex");
  const refreshToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SEC * 1000);

  sessions.set(sessionId, {
    sessionId,
    familyId,
    userId: input.userId,
    tenantId: input.tenantId,
    role: input.role,
    refreshHash: hashToken(refreshToken),
    expiresAt,
    revoked: false,
  });

  const accessToken = await issueAccessToken({
    userId: input.userId,
    tenantId: input.tenantId,
    role: input.role,
    sessionId,
  });

  return { accessToken, refreshToken, sessionId };
}

/** Previously rotated refresh hashes — presenting one = reuse → revoke family. */
const retiredRefreshHashes = new Map<string, string>(); // hash → familyId

/**
 * Refresh rotation with reuse detection.
 * Presenting a used refresh token revokes the entire session family.
 */
export async function rotateRefresh(
  refreshToken: string,
): Promise<
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false; reason: "invalid" | "reuse_detected" | "expired" }
> {
  const presentedHash = hashToken(refreshToken);

  const retiredFamily = retiredRefreshHashes.get(presentedHash);
  if (retiredFamily) {
    for (const s of sessions.values()) {
      if (s.familyId === retiredFamily) s.revoked = true;
    }
    return { ok: false, reason: "reuse_detected" };
  }

  let match: SessionStub | undefined;
  for (const s of sessions.values()) {
    if (s.refreshHash === presentedHash) {
      match = s;
      break;
    }
  }

  if (!match) {
    return { ok: false, reason: "invalid" };
  }

  if (match.revoked) {
    for (const s of sessions.values()) {
      if (s.familyId === match.familyId) s.revoked = true;
    }
    return { ok: false, reason: "reuse_detected" };
  }

  if (match.expiresAt.getTime() < Date.now()) {
    match.revoked = true;
    return { ok: false, reason: "expired" };
  }

  retiredRefreshHashes.set(match.refreshHash, match.familyId);

  const newRefresh = randomBytes(32).toString("hex");
  match.refreshHash = hashToken(newRefresh);
  match.expiresAt = new Date(Date.now() + REFRESH_TTL_SEC * 1000);

  const accessToken = await issueAccessToken({
    userId: match.userId,
    tenantId: match.tenantId,
    role: match.role,
    sessionId: match.sessionId,
  });

  return { ok: true, accessToken, refreshToken: newRefresh };
}

export async function revokeSession(sessionId: string): Promise<void> {
  const s = sessions.get(sessionId);
  if (s) s.revoked = true;
}

/** Revoke all sessions for a user in a tenant (SCIM deprovision). */
export async function revokeSessionsForUser(
  tenantId: string,
  userId: string,
): Promise<number> {
  let n = 0;
  for (const s of sessions.values()) {
    if (s.tenantId === tenantId && s.userId === userId && !s.revoked) {
      s.revoked = true;
      n += 1;
    }
  }
  return n;
}

export async function verifyAccessToken(
  token: string,
): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, accessSecret());
    if (payload.typ !== "access" || !payload.sub || !payload.tid) return null;
    return payload as AccessClaims;
  } catch {
    return null;
  }
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: {
      userId: string;
      tenantId: string;
      role: string;
      sessionId: string;
    };
  }
}

async function authPlugin(app: FastifyInstance) {
  app.decorateRequest("auth", undefined);

  /** Soft-parse Bearer so global authz preHandler sees req.auth before route hooks. */
  app.addHook("onRequest", async (request) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return;
    const claims = await verifyAccessToken(header.slice(7));
    if (!claims?.sub || !claims.tid || !claims.sid) return;
    const session = sessions.get(String(claims.sid));
    if (!session || session.revoked) return;
    request.auth = {
      userId: claims.sub,
      tenantId: String(claims.tid),
      role: String(claims.role ?? "member"),
      sessionId: String(claims.sid),
    };
  });

  app.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.auth) return;
      const header = request.headers.authorization;
      if (!header?.startsWith("Bearer ")) {
        return reply.code(401).send({ error: "unauthorized" });
      }
      const claims = await verifyAccessToken(header.slice(7));
      if (!claims?.sub || !claims.tid || !claims.sid) {
        return reply.code(401).send({ error: "unauthorized" });
      }
      const session = sessions.get(String(claims.sid));
      if (!session || session.revoked) {
        return reply.code(401).send({ error: "unauthorized" });
      }
      request.auth = {
        userId: claims.sub,
        tenantId: String(claims.tid),
        role: String(claims.role ?? "member"),
        sessionId: String(claims.sid),
      };
    },
  );
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}

export default fp(authPlugin, { name: "auth" });

export const AUTH_ACCESS_TTL_SEC = ACCESS_TTL_SEC;
export const AUTH_REFRESH_TTL_SEC = REFRESH_TTL_SEC;
