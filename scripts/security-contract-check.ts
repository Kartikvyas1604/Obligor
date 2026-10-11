/**
 * Per-endpoint security contract check.
 *
 * Proves that EVERY route's auth and validation is actually enforced — not just
 * that the happy path works. Run against a built server (see ci.yml). Asserts:
 *   - capability-token auth (401 without the acting desk's token)
 *   - body validation (422) and business-rule rejection (400/409)
 *   - payment gating (402) and privacy invariants (no per-leg leakage)
 *   - resource-not-found (404)
 *
 * Exits non-zero if any endpoint lets an unauthorized or malformed request
 * through. No test framework — deterministic HTTP against a real server.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000";

const WALLET_A = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const WALLET_B = "4Nd1mBQtrMJVYVf1fPtrC8q1cx4PzmpKvx64h3FsYytW";
const PAY = "x402_sig_contract_check_0000000000"; // well-formed (>=16 chars)

const results: string[] = [];
let failures = 0;

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push(`PASS  ${name}`);
  } catch (err) {
    failures += 1;
    results.push(`FAIL  ${name}\n        ${err instanceof Error ? err.message : String(err)}`);
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function req(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: Record<string, unknown> | null; text: string }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

async function main() {
  // ---- Health / surface ----
  await check("GET /health → 200 and advertises no secrets", async () => {
    const { status, json, text } = await req("GET", "/api/v1/health");
    assert(status === 200, `expected 200, got ${status}`);
    assert(json?.ok === true, "expected ok:true");
    assert(!/private|secret|key/i.test(text), "health response leaked a secret-looking field");
  });

  // ---- Deal sessions: capability-token auth is enforced per action ----
  const created = await req("POST", "/api/v1/sessions", {
    walletA: WALLET_A,
    labelA: "Desk A",
    legsA: [],
  });
  const sessionId = (created.json?.session as { sessionId?: string } | undefined)?.sessionId ?? "";
  const tokenA = (created.json?.partyTokenA as string | undefined) ?? "";

  await check("POST /sessions → 201, token returned once, hash never exposed", async () => {
    assert(created.status === 201, `expected 201, got ${created.status}`);
    assert(typeof tokenA === "string" && tokenA.length > 0, "no partyTokenA returned");
    const session = created.json?.session as Record<string, unknown> | undefined;
    assert(session && !("partyTokenHashes" in session), "token hash leaked in response");
    assert(typeof sessionId === "string" && sessionId.length > 0, "no session id");
  });

  await check("GET /sessions/{id} without token → book redacted", async () => {
    const { status, json } = await req("GET", `/api/v1/sessions/${sessionId}`);
    assert(status === 200, `expected 200, got ${status}`);
    const session = json?.session as { partyA?: { legsWithheld?: boolean; legs?: unknown[] } };
    assert(session.partyA?.legsWithheld === true, "party A legs not withheld from anon caller");
    assert((session.partyA?.legs ?? []).length === 0, "party A legs leaked to anon caller");
  });

  await check("GET /sessions/{id} with tokenA → A's own book visible", async () => {
    const { status, json } = await req("GET", `/api/v1/sessions/${sessionId}`, undefined, {
      "x-party-token": tokenA,
    });
    assert(status === 200, `expected 200, got ${status}`);
    const session = json?.session as { partyA?: { legsWithheld?: boolean } };
    assert(!session.partyA?.legsWithheld, "owner could not see own book");
  });

  await check("POST /sessions/{id} update_legs as A WITHOUT token → 401", async () => {
    const { status, json } = await req("POST", `/api/v1/sessions/${sessionId}`, {
      action: "update_legs",
      partyId: "A",
      legs: [{ venue: "manual", instrument: "SOL", bucket: "SOL", side: "long", qty: 1, markUsd: 100 }],
    });
    assert(status === 401, `expected 401, got ${status}`);
    assert(json?.error === "UNAUTHORIZED", `expected UNAUTHORIZED, got ${json?.error}`);
  });

  await check("POST /sessions/{id} update_legs as A WITH tokenA → 200", async () => {
    const { status } = await req(
      "POST",
      `/api/v1/sessions/${sessionId}`,
      {
        action: "update_legs",
        partyId: "A",
        legs: [{ venue: "manual", instrument: "SOL", bucket: "SOL", side: "long", qty: 1, markUsd: 100 }],
      },
      { "x-party-token": tokenA },
    );
    assert(status === 200, `expected 200, got ${status}`);
  });

  const joined = await req("POST", `/api/v1/sessions/${sessionId}`, {
    action: "join",
    walletB: WALLET_B,
    labelB: "Desk B",
    legsB: [],
  });
  const tokenB = (joined.json?.partyTokenB as string | undefined) ?? "";

  await check("POST /sessions/{id} join → 200 with partyTokenB; hash hidden", async () => {
    assert(joined.status === 200, `expected 200, got ${joined.status}`);
    assert(typeof tokenB === "string" && tokenB.length > 0, "no partyTokenB returned");
    const session = joined.json?.session as Record<string, unknown> | undefined;
    assert(session && !("partyTokenHashes" in session), "token hash leaked on join");
  });

  await check("POST /sessions/{id} update_legs as B WITHOUT token → 401", async () => {
    const { status } = await req("POST", `/api/v1/sessions/${sessionId}`, {
      action: "update_legs",
      partyId: "B",
      legs: [{ venue: "manual", instrument: "BTC", bucket: "BTC", side: "short", qty: 1, markUsd: 100 }],
    });
    assert(status === 401, `expected 401, got ${status}`);
  });

  await check("POST /sessions/{id} seal as A WITHOUT token → 401", async () => {
    const { status } = await req("POST", `/api/v1/sessions/${sessionId}`, {
      action: "seal",
      partyId: "A",
    });
    assert(status === 401, `expected 401, got ${status}`);
  });

  await check("POST /sessions/{id} settle/clear WITHOUT both tokens → 401", async () => {
    const settle = await req("POST", `/api/v1/sessions/${sessionId}`, { action: "settle" });
    const clear = await req("POST", `/api/v1/sessions/${sessionId}`, { action: "clear" });
    assert(settle.status === 401, `settle expected 401, got ${settle.status}`);
    assert(clear.status === 401, `clear expected 401, got ${clear.status}`);
  });

  await check("POST /sessions/{id} unknown action → 422", async () => {
    const { status, json } = await req("POST", `/api/v1/sessions/${sessionId}`, { action: "nope" });
    assert(status === 422, `expected 422, got ${status}`);
    assert(json?.error === "VALIDATION_FAILED", `expected VALIDATION_FAILED, got ${json?.error}`);
  });

  await check("GET /sessions/{unknown} → 404", async () => {
    const { status } = await req("GET", "/api/v1/sessions/does-not-exist-xyz");
    assert(status === 404, `expected 404, got ${status}`);
  });

  // ---- Escrow write intents: validation + idempotency ----
  await check("POST /escrow/deposit malformed body → 422", async () => {
    const { status, json } = await req("POST", "/api/v1/escrow/deposit", {
      escrowId: "x",
      partyA: WALLET_A,
      partyB: WALLET_B,
      amountAUsd: 10,
      amountBUsd: 5,
    });
    assert(status === 422, `expected 422, got ${status}`);
    assert(json?.error === "VALIDATION_FAILED", `expected VALIDATION_FAILED, got ${json?.error}`);
  });

  const depositBody = {
    escrowId: "esc-contract-check",
    chain: "solana",
    partyA: WALLET_A,
    partyB: WALLET_B,
    amountAUsd: 1000,
    amountBUsd: 500,
  };
  const idemKey = `contract-${Date.now()}`;

  await check("POST /escrow/deposit valid → 200 deposit_recorded", async () => {
    const { status, json } = await req("POST", "/api/v1/escrow/deposit", depositBody, {
      "Idempotency-Key": idemKey,
    });
    assert(status === 200, `expected 200, got ${status}`);
    assert(json?.status === "deposit_recorded", `unexpected status ${json?.status}`);
  });

  await check("POST /escrow/deposit replay (same key+body) → replayed:true", async () => {
    const { status, json } = await req("POST", "/api/v1/escrow/deposit", depositBody, {
      "Idempotency-Key": idemKey,
    });
    assert(status === 200, `expected 200 replay, got ${status}`);
    assert(json?.replayed === true, "replay did not flag replayed:true");
  });

  await check("POST /escrow/deposit same key + different body → 409", async () => {
    const { status, json } = await req(
      "POST",
      "/api/v1/escrow/deposit",
      { ...depositBody, amountAUsd: 9999 },
      { "Idempotency-Key": idemKey },
    );
    assert(status === 409, `expected 409 conflict, got ${status}`);
    assert(json?.error === "IDEMPOTENCY_CONFLICT", `expected IDEMPOTENCY_CONFLICT, got ${json?.error}`);
  });

  await check("POST /escrow/settle netted > locked → 400", async () => {
    const { status } = await req("POST", "/api/v1/escrow/settle", {
      escrowId: "esc-contract-check",
      totalLockedUsd: 100,
      nettedMarginUsd: 500,
      proofHash: "proof_hash_12345678",
      partyALockedUsd: 60,
      partyBLockedUsd: 40,
    });
    assert(status === 400, `expected 400, got ${status}`);
  });

  await check("POST /escrow/settle splits do not reconcile → 400", async () => {
    const { status } = await req("POST", "/api/v1/escrow/settle", {
      escrowId: "esc-contract-check",
      totalLockedUsd: 100,
      nettedMarginUsd: 20,
      proofHash: "proof_hash_12345678",
      partyALockedUsd: 10,
      partyBLockedUsd: 10,
    });
    assert(status === 400, `expected 400, got ${status}`);
  });

  await check("POST /escrow/settle valid → 200, no fabricated tx hash", async () => {
    const { status, json, text } = await req("POST", "/api/v1/escrow/settle", {
      escrowId: "esc-contract-check",
      totalLockedUsd: 100,
      nettedMarginUsd: 20,
      proofHash: "proof_hash_12345678",
      partyALockedUsd: 60,
      partyBLockedUsd: 40,
    });
    assert(status === 200, `expected 200, got ${status}`);
    assert(json?.status === "settlement_computed", `unexpected status ${json?.status}`);
    assert(!/"txHash"|"transactionHash"|"signature"/.test(text), "settlement fabricated a tx hash");
  });

  // ---- Clearing routes: payment gate + privacy invariant ----
  await check("POST /net-margin unpaid → 402 payment required", async () => {
    const { status, json } = await req("POST", "/api/v1/net-margin", {
      chain: "solana",
      partyA: { wallet: WALLET_A, legs: [] },
      partyB: { wallet: WALLET_B, legs: [] },
    });
    assert(status === 402, `expected 402, got ${status} (${json?.error ?? ""})`);
    assert(json?.error === "PAYMENT-REQUIRED", `expected PAYMENT-REQUIRED, got ${json?.error}`);
  });

  await check("POST /net-margin paid but no legs → 400 (never invents positions)", async () => {
    const { status } = await req(
      "POST",
      "/api/v1/net-margin",
      { chain: "solana", partyA: { wallet: WALLET_A, legs: [] }, partyB: { wallet: WALLET_B, legs: [] } },
      { "x-payment-signature": PAY },
    );
    assert(status === 400, `expected 400, got ${status}`);
  });

  await check("POST /net-margin paid + valid → 200 with aggregates only (no per-leg leak)", async () => {
    const { status, json, text } = await req(
      "POST",
      "/api/v1/net-margin",
      {
        chain: "solana",
        partyA: {
          wallet: WALLET_A,
          legs: [{ venue: "manual", instrument: "SOL", bucket: "SOL", side: "long", qty: 10, markUsd: 100 }],
        },
        partyB: {
          wallet: WALLET_B,
          legs: [{ venue: "manual", instrument: "SOL", bucket: "SOL", side: "short", qty: 8, markUsd: 100 }],
        },
      },
      { "x-payment-signature": PAY },
    );
    assert(status === 200, `expected 200, got ${status} (${json?.error ?? ""})`);
    const margin = json?.margin as Record<string, unknown> | undefined;
    assert(margin, "no margin in response");
    assert(!("legs" in margin), "margin leaked per-leg data");
    assert(!text.includes('"signedExposureUsd"'), "response leaked per-leg signed exposure");
  });

  await check("POST /net-margin/parallel < 3 pairs → 400", async () => {
    const { status } = await req("POST", "/api/v1/net-margin/parallel", {
      chain: "monad",
      pairs: [
        { pairId: "p1", a: { wallet: WALLET_A, legs: [] }, b: { wallet: WALLET_B, legs: [] } },
        { pairId: "p2", a: { wallet: WALLET_A, legs: [] }, b: { wallet: WALLET_B, legs: [] } },
      ],
    });
    assert(status === 400, `expected 400, got ${status}`);
  });

  // ---- Demo-only counterfactual: explicit acknowledgement required ----
  await check("POST /demo/adversarial-plaintext without ack → 422", async () => {
    const { status } = await req("POST", "/api/v1/demo/adversarial-plaintext", {});
    assert(status === 422, `expected 422, got ${status}`);
  });

  await check("POST /demo/adversarial-plaintext with ack → 200 (fixtures on)", async () => {
    const { status } = await req("POST", "/api/v1/demo/adversarial-plaintext", {
      iUnderstandThisLeaksBothBooks: true,
    });
    assert(status === 200, `expected 200, got ${status}`);
  });

  console.log(results.join("\n"));
  console.log(`\n${results.length - failures}/${results.length} endpoint contract checks passed`);
  if (failures > 0) process.exitCode = 1;
}

void main().catch((err) => {
  console.error("contract check crashed:", err);
  process.exitCode = 1;
});
