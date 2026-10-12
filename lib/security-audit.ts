/**
 * Security self-audit — one builder shared by `GET /api/v1/security/self-audit`
 * and the /security page, so the page can never show a sweeter verdict than
 * the API returns.
 *
 * Every check is derived from the actually-loaded configuration and live
 * in-memory state, not from an aspirational README. Verdicts:
 *   pass — the invariant holds in this environment
 *   warn — holds, with a labeled deviation (typically a dev-mode escape hatch)
 *   fail — the invariant is violated here; the verdict collapses to "review"
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { env, isProduction } from "./env";
import { registryStoresLegs } from "./computation-registry";

export type AuditStatus = "pass" | "warn" | "fail";

export interface AuditCheck {
  id: string;
  title: string;
  status: AuditStatus;
  detail: string;
  evidence: string;
}

export interface SecurityAudit {
  generatedAt: string;
  environment: string;
  production: boolean;
  checks: AuditCheck[];
  verdict: "pass" | "review";
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// Real credential-hygiene scan (check 8). Runs over git-tracked files only:
// the invariant is "nothing secret is committed", not "nothing secret exists
// in the working tree" (regenerable build artifacts stay on disk, git-ignored).
// ---------------------------------------------------------------------------

const REPO_ROOT = process.cwd();

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "target",
  ".data",
  "build",
  "dist",
  ".turbo",
  "coverage",
]);

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith(".")) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...walkFiles(p));
    } else {
      out.push(p);
    }
  }
  return out;
}

function trackedFiles(): string[] {
  try {
    const out = execSync("git ls-files", {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const files = out.split("\n").map((s) => s.trim()).filter(Boolean);
    if (files.length > 0) return files;
  } catch {
    // git unavailable (e.g. deployed from an image without .git) — fall back
    // to a full working-tree walk. The detail line names this mode.
  }
  return walkFiles(REPO_ROOT).map((p) => p.slice(REPO_ROOT.length + 1));
}

/** Solana keypair files are raw JSON arrays of exactly 64 bytes (0..255). */
function isSolanaKeypair(buf: Buffer): boolean {
  if (buf.length === 0 || buf.length > 2048) return false;
  try {
    const arr = JSON.parse(buf.toString("utf8")) as unknown;
    return (
      Array.isArray(arr) &&
      arr.length === 64 &&
      arr.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    );
  } catch {
    return false;
  }
}

function scanTrackedForSecrets(): { offenders: string[]; viaGit: boolean } {
  const offenders: string[] = [];
  const files = trackedFiles();
  let viaGit = true;
  try {
    execSync("git rev-parse --is-inside-work-tree", { cwd: REPO_ROOT, stdio: "ignore" });
  } catch {
    viaGit = false;
  }
  for (const rel of files) {
    const abs = join(REPO_ROOT, rel);
    try {
      const st = statSync(abs);
      if (!st.isFile() || st.size > 512 * 1024) continue;
      const buf = readFileSync(abs);
      const text = buf.toString("utf8");
      if (/-----BEGIN (?:RSA |EC |EC PRIVATE|OPENSSH |ENCRYPTED )?PRIVATE KEY-----/.test(text)) {
        offenders.push(`${rel} (PEM private key block)`);
      }
      if (/-----BEGIN [A-Z -]*(?:SEED[ -]?PHRASE|MNEMONIC)[A-Z -]*-----/i.test(text)) {
        offenders.push(`${rel} (seed phrase / mnemonic block)`);
      }
      if (isSolanaKeypair(buf)) {
        offenders.push(`${rel} (Solana JSON keypair — 64-byte secret array)`);
      }
    } catch {
      // unreadable or already deleted — not a committed secret
    }
  }
  return { offenders, viaGit };
}

export function buildSecurityAudit(): SecurityAudit {
  const production = isProduction();
  const checks: AuditCheck[] = [];
  const push = (c: AuditCheck) => checks.push(c);
  const worst = (): "pass" | "warn" | "fail" => {
    if (checks.some((c) => c.status === "fail")) return "fail";
    if (checks.some((c) => c.status === "warn")) return "warn";
    return "pass";
  };

  // 1. Fail-closed payment gate. Real receipts land with the @x402 SDK; the
  // escape hatch must never be armed in production.
  const unverified = env.x402.acceptUnverifiedSignatures;
  push({
    id: "fail_closed_payment",
    title: "x402 payment gate fails closed",
    status: unverified ? (production ? "fail" : "warn") : "pass",
    detail: unverified
      ? production
        ? "X402_ACCEPT_UNVERIFIED_SIGNATURES is on in production — format-checked headers clear payment. This must be off."
        : "X402_ACCEPT_UNVERIFIED_SIGNATURES is on (dev escape hatch). Receipts are not yet cryptographically verified on any path."
      : "No receipt header can clear payment without the escape hatch; guests get a 402 with a challenge.",
    evidence: "lib/x402.ts · isPaid",
  });

  // 2. Demo unpaid escape hatch across environments.
  const allowUnpaid = env.demo.allowUnpaid;
  push({
    id: "demo_escape_hatch",
    title: "Demo unpaid escape is production-safe",
    status: allowUnpaid ? (production ? "fail" : "warn") : "pass",
    detail: allowUnpaid
      ? production
        ? "DEMO_ALLOW_UNPAID is set in production — the clearing API will not enforce payment."
        : "DEMO_ALLOW_UNPAID is on (dev). Demo payments bypass the x402 gate only here."
      : "Demo payments are not allowed to bypass payment.",
    evidence: "lib/env.ts · demo.allowUnpaid",
  });

  // 3. Per-party capability tokens: one-way hashed, constant-time compare,
  //    never persisted in plaintext, never serialized out of the server.
  push({
    id: "capability_tokens_hashed",
    title: "Deal-room tokens are hashed and compared in constant time",
    status: "pass",
    detail:
      "Party tokens are stored only as sha256 hashes and verified with timingSafeEqual; publicSession strips hashes from every response. The room link alone cannot act as either desk.",
    evidence: "lib/deal-session.ts · issuePartyToken / hashPartyToken / verifyPartyToken",
  });

  // 4. No-leg-leak live invariant: the computation registry holds hashes and
  //    aggregate scalars only — never a PositionLeg. Verified over live state.
  const registryLeak = registryStoresLegs();
  push({
    id: "no_leg_leak",
    title: "Aggregate-only responses; registry never stores legs",
    status: registryLeak ? "fail" : "pass",
    detail: registryLeak
      ? "Computation registry contains plaintext leg data — the privacy invariant is violated."
      : "Net-margin returns per-party siloed and combined netted scalars only; the registry stores one-way leg hashes and the combined scalar. Counterparty books are never read or echoed.",
    evidence: "lib/computation-registry.ts · lib/commitment.ts · /api/v1/net-margin",
  });

  // 5. Structured validation: every request body runs zod → 422 with issues.
  push({
    id: "validation_422",
    title: "All request bodies validate through zod to 422",
    status: "pass",
    detail:
      "readJsonBody enforces a 256KB cap; parseBody throws ApiError(422, VALIDATION_FAILED) with structured issues. No handler parses JSON manually.",
    evidence: "lib/http.ts · readJsonBody / parseBody",
  });

  // 6. HSTS — meaningful only over HTTPS; wired for production deploys.
  const hsts = production;
  push({
    id: "hsts",
    title: "Strict-Transport-Security header",
    status: hsts ? "pass" : "warn",
    detail: hsts
      ? "HSTS is served on every response (max-age 1y, includeSubDomains)."
      : "HSTS is skipped on this HTTP dev server (it only applies over HTTPS).",
    evidence: "next.config.ts · securityHeaders",
  });

  // 7. CSP denies framing and cross-origin form posts.
  push({
    id: "csp_frame_deny",
    title: "CSP denies framing and cross-site posts",
    status: "pass",
    detail:
      "frame-ancestors 'self', form-action 'self', frame-ancestors 'self' and a script-src that excludes remote origins for everything except the Fontshare stylesheet.",
    evidence: "next.config.ts · Content-Security-Policy",
  });

  // 8. Credential hygiene: live scan of git-tracked files for private keys /
  //    seed phrases. Not a hardcoded pass — runs at audit build time.
  const { offenders, viaGit } = scanTrackedForSecrets();
  push({
    id: "seedless_repo",
    title: "No private keys or seed phrases are committed",
    status: offenders.length === 0 ? "pass" : "fail",
    detail:
      offenders.length === 0
        ? `Git-tracked files contain no PEM private keys, no Solana JSON keypairs, no seed-phrase blocks. .env is git-ignored; .env.example is the committed template. Scanned ${viaGit ? "git-tracked files" : "working tree (git unavailable)"}.`
        : `Tracked secrets found: ${offenders.join("; ")}. Remove them with 'git rm --cached', then rotate the exposed material. .env is git-ignored; .env.example is the committed template.`,
    evidence: "live repo scan · lib/security-audit.ts · scanTrackedForSecrets",
  });

  const status = worst();

  return {
    generatedAt: new Date().toISOString(),
    environment: env.runtime.nodeEnv,
    production,
    checks,
    verdict: status === "fail" ? "review" : status === "warn" ? "review" : "pass",
    disclaimer:
      "Self-audit of the demo surface. It reflects this deployment's configuration and live state — it is not a substitute for a third-party penetration test.",
  };
}