import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type ConnectionResumeClaims = {
  sessionId: string;
  organizationId: string;
  userId: string;
  expiresAt: number;
  nonce: string;
};

function secret() {
  const dedicated = process.env.RYTHM_CONNECTION_AGENT_RESUME_SECRET?.trim();
  if (dedicated && dedicated.length >= 32) return dedicated;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey || serviceRoleKey.length < 32) throw new Error("Connection Agent resume signing secret is not configured safely.");
  // Cryptographic domain separation: never use the service-role credential itself as a token key.
  return createHash("sha256").update("RYTHM_CONNECTION_AGENT_RESUME_V1\0").update(serviceRoleKey).digest("hex");
}

function b64(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function issueConnectionResumeToken(input: { sessionId: string; organizationId: string; userId: string; ttlSeconds?: number }) {
  const ttl = Math.max(60, Math.min(15 * 60, input.ttlSeconds ?? 10 * 60));
  const claims: ConnectionResumeClaims = {
    sessionId: input.sessionId,
    organizationId: input.organizationId,
    userId: input.userId,
    expiresAt: Math.floor(Date.now() / 1000) + ttl,
    nonce: randomBytes(16).toString("base64url"),
  };
  const payload = b64(JSON.stringify(claims));
  const token = `v1.${payload}.${sign(`v1.${payload}`)}`;
  return { token, claims };
}

export function verifyConnectionResumeToken(token: string, expected: { sessionId: string; organizationId: string; userId: string }) {
  const [version, payload, signature, extra] = token.split(".");
  if (version !== "v1" || !payload || !signature || extra) throw new Error("Resume token is invalid.");
  const expectedSignature = sign(`${version}.${payload}`);
  const left = Buffer.from(signature);
  const right = Buffer.from(expectedSignature);
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new Error("Resume token signature is invalid.");
  let claims: ConnectionResumeClaims;
  try { claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ConnectionResumeClaims; }
  catch { throw new Error("Resume token payload is invalid."); }
  if (claims.expiresAt <= Math.floor(Date.now() / 1000)) throw new Error("Resume token expired.");
  if (claims.sessionId !== expected.sessionId || claims.organizationId !== expected.organizationId || claims.userId !== expected.userId) throw new Error("Resume token scope mismatch.");
  return claims;
}
