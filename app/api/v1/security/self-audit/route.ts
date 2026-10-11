import { NextResponse } from "next/server";
import { rateLimitFor, withApi } from "@/lib/http";
import { buildSecurityAudit } from "@/lib/security-audit";

/**
 * GET /api/v1/security/self-audit
 * Live security self-audit: every check is derived from the actually-loaded
 * configuration and live in-memory state. No secrets or legs are disclosed —
 * the audit reports invariants and their evidence, not configuration values.
 */
export const GET = withApi(async ({ req }) => {
  rateLimitFor("default", req);
  return NextResponse.json({ ok: true, audit: buildSecurityAudit() });
});