# Obligor — Production Readiness Audit

> Phase 0 deliverable for the **OBLIGOR PRIME** production transformation
> (`docs/Prompt.md`). Source-of-truth precedence: `docs/AGENT.md` > other docs >
> code. Every claim below was verified by reading the actual code, not assumed.

- **Date:** 2026-10-14
- **HEAD at audit:** `142fdd8`
- **Domains in play:** Web3 / smart contracts, API / backend service, Web app / SaaS.
  Audit references: `production-ready/references/core-checklist.md` +
  `domains/web3.md` + `domains/api-backend.md` + `domains/webdev-saas.md`.
- **Verdict:** The repo is unusually honest (nothing fabricates a tx signature,
  attestation, or live mark), but against a strict *zero-demo / zero-simulation*
  bar, production realism is **absent by default** in four core areas:
  1. confidential compute is local simulation unless a real enclave wire is
     configured — and even then it cannot yield a hardware attestation;
  2. on-chain escrow is record-only unless `ESCROW_REAL_SETTLE=true`;
  3. x402 is a self-issued Ed25519 envelope with no on-chain/facilitator settlement;
  4. there is no live Kamino or Monad venue adapter at all.
  The Arcium MXE program does not compile, the Solidity vault cannot move funds,
  and the README omits the mandatory honesty disclosures.

---

## 1. Product understanding

**obligor** is confidential **two-party clearing**: two mutually distrusting desks
seal their own DeFi position books into a joint computation that emits only a
combined **net margin** scalar (plus aggregates that do not reconstruct the other
side's book). Neither party — nor the operator — sees the other book in
confidential mode. Each quote is machine-payable via x402 (`$0.01`/call). Per
chain it ships the strongest honest confidential backend:

| Chain | Backend | Trust model | Status |
| --- | --- | --- | --- |
| Solana (Colosseum, primary) | Arcium MXE | cryptographic MPC | **not wired / does not compile** |
| Monad / EVM (Metropolis, expansion) | AWS Nitro / Oyster TEE | hardware-attested enclave | HTTP transport exists, **no hardware attestation** |

Non-goals (must not be built): single-wallet self-netting as the product, dark
pool / order matching, RWA custody, securities exchange, Robinhood clone, TEE=MPC
theater, invented traction/TAM.

**The one core flow that must be flawless:** two wallets → seal own books →
confidential net margin → verifiable commitment → on-chain settlement.

---

## 2. Architecture as built (actual)

Flat Next.js App Router app (not the `apps/*` + `packages/*` monorepo sketched in
`docs/AGENT.md`):

```
app/                     Next.js pages + route handlers (app/api/v1/*)
components/              React UI
lib/                     margin math, confidential backends, adapters,
                         escrow-onchain, session store, http, env, x402
programs/obligor-escrow/ Anchor program (REAL, but not built in CI)
mxe/                     Arcium MXE crate (DOES NOT COMPILE) + circuit draft
enclave/obligor-enclave/ Rust TEE microservice (builds; attestation is a SHA-256 stub)
contracts/ObligorEscrow.sol  EVM vault (event-only ledger; no fund movement)
scripts/                 escrow verify, security probe, demo agents, load sweep
tests/                   10 node:test suites (pure unit / lib-level)
.github/workflows/       ci.yml (verify + native), deploy.yml (publish only)
```

Config surface: `lib/env.ts` (zod-validated, fail-fast, 40+ flags). Persistence:
`file` (default) / `memory` / `sqlite` via `SESSION_STORE_MODE`.

---

## 3. Gap table — promised vs actual

Legend: **R** real · **P** partial (real core, gated/stubbed edges) · **S** simulated/stub · **X** missing.

| # | Capability (Prompt.md / AGENT.md) | Actual | Evidence |
| --- | --- | --- | --- |
| 1 | Margin formula, N-party, bucket haircuts | **R** | `lib/margin.ts:65,69,87,146`; `tests/margin.test.ts` |
| 2 | Commitment hash + `/verify` | **P** | `lib/commitment.ts:17,45`; `app/api/v1/net-margin/verify/route.ts:36`; registry **not durable** unless sqlite (`lib/computation-registry.ts:44`) |
| 3 | Live Drift read-only leg (J1) | **P** | `lib/adapters/drift.ts:59,125`; requires `DRIFT_AUTHORITY`, else "desk-declared, unverified" (`lib/positions.ts:281`) |
| 4 | Live **Kamino** adapter | **X** | `lib/adapters/venues.ts:19` — label only, no reader |
| 5 | Live **Monad venue** adapter | **X** | `lib/adapters/venues.ts:24`; Monad books are fixtures/priced from Pyth |
| 6 | N=3 netting (J3) | **P** | math `lib/margin.ts:87`; `.../multi/route.ts` hardcodes `backendKind:"simulated"` (`:127,133,163`) |
| 7 | Agent x402 settle (J4) | **P** | real Ed25519 `lib/x402.ts:114,126,183`; **no on-chain settlement**, facilitator never called (`:13-18,60,72`) |
| 8 | Real x402 "exact" scheme | **X** | self-issued Obligor envelope; `demoPayment` bypass (`lib/x402.ts:249`); legacy format escape hatch (`:275`) |
| 9 | Arcium MPC backend | **S/X** | `lib/confidential.ts:161-185` throws when `CONFIDENTIAL_REAL_TRANSPORTS=true`; no `@arcium-hq/client` |
| 10 | Arcium MXE program builds | **X** | `mxe/Cargo.toml:1-12` no deps; `mxe/src/lib.rs:4` invalid base58 `declare_id`; circuit unwired |
| 11 | TEE hardware attestation | **S** | `enclave/.../main.rs:197-206` SHA-256 stub, `provider:"none"`; no `/dev/nsm`; `:312` advertises `false` |
| 12 | TEE trust label never claims TEE | **R** | downgraded to `simulated_plaintext_compute` when unattested (`lib/confidential.ts:293-306`) |
| 13 | On-chain deposit from UI | **X** | `escrow/deposit/route.ts:24-71` records intent only, no lock/tx |
| 14 | On-chain settle/release | **P** | real only if `ESCROW_REAL_SETTLE=true` (`lib/escrow-onchain.ts:56`); else `transactionSignature:null` |
| 15 | Anchor program correctness | **R** | `programs/obligor-escrow/src/lib.rs:93,225,254` (real PDA + SPL CPI) |
| 16 | Anchor program compiled in CI | **X** | `ci.yml` has no `anchor build` / root `cargo build` |
| 17 | Solidity vault moves funds | **X** | `contracts/ObligorEscrow.sol:41-66` ignores `msg.value`; `:68-87` no transfer |
| 18 | Monad parallel grid ≥3 pairs | **P** | `.../parallel/route.ts:88-119` in-process `Promise.all`; no Monad RPC; enclave sim unless wired |
| 19 | Real wallet signing (Ed25519/EIP-712) | **P** | `lib/deal-session.ts` server-side; UI has no real `signMessage` seal yet |
| 20 | Multi-chain wallet connect | **P** | `components/wallet-connect.tsx` Solana-only (Phantom/Solflare) |
| 21 | Institutional risk analytics | **P** | bucket IM/haircuts only (`lib/margin.ts:115-128`); no VaR/scenario/sensitivity |
| 22 | Production trust hub `/security` | **P** | page exists (`app/security/page.tsx`); verify current content vs Prompt §4.2 |
| 23 | No fixture imports in app paths | **R** | grep: no `lib/fixtures` imports in `app/`/`components/`; only `/demo/*` routes |
| 24 | No debug telemetry in UI | **R** | grep for `Env:`/`Production: no`/`Failing: 0` → none |
| 25 | README honesty tables | **X** | `README.md` asserts "Sealed MPC"/"Hardware-Attested TEE" (`:55`), no real-vs-mocked, no TEE≠MPC, no business-model honesty |
| 26 | Durable sessions + registry | **P** | `file` default; registry memory-only (`lib/computation-registry.ts:38-45`) |
| 27 | Distributed rate limit / idempotency | **P** | in-memory per instance (`lib/http.ts:98`); `markOnce` TOCTOU (`lib/idempotency.ts:182-201`) |
| 28 | Docker + CI + deploy/rollback | **P** | `Dockerfile` real; `deploy.yml` publishes to GHCR only, no deploy/rollback, not gated on `ci.yml` |
| 29 | DB migrations | **X** | lazy table creation; no migration tool/versioning (`lib/sqlite.ts:74`) |
| 30 | Secret management | **P** | all `process.env`; no Vault/KMS; `.env` on disk (gitignored) |
| 31 | Structured logging, no leg leakage | **R** | `lib/logger.ts` redaction; structured-only at API layer |

---

## 4. Critical blockers (must fix before "production-ready")

1. **Arcium MXE does not compile** — no dependencies, invalid program id, circuit
   unwired. No Solana confidential boundary exists.
2. **No hardware attestation anywhere** — enclave emits a SHA-256 stub; no Nitro
   NSM quote, no PCR verification.
3. **x402 is not the Coinbase exact scheme** — no facilitator verification, no
   on-chain transfer; `demoPayment` bypass exists.
4. **On-chain escrow is record-only by default** — deposits never lock funds; UI
   has no client-signed Anchor tx.
5. **No live Kamino / Monad adapters** — the "cross-venue" story leans on labels
   and Pyth-only pricing.
6. **Solidity vault cannot custody/move funds** — event-only ledger.
7. **README omits mandatory honesty** — real-vs-mocked, TEE≠MPC, business-model,
   production-still-needs.
8. **CI does not build the on-chain program** — `anchor build`/`cargo build` for
   `programs/obligor-escrow` absent; no `cargo test`; no `forge test`.

## 5. Important (fix before real launch)

- Durable computation registry so `/verify` survives restarts (`SESSION_STORE_MODE=sqlite`).
- Distributed rate limiting + idempotency (or documented single-instance constraint).
- DB migrations + schema versioning.
- Multi-chain wallet connect (Solana + EVM) and real client-side seal signing.
- Real parallel grid with batch CSV upload on `/monad`.
- Institutional risk analytics surface (VaR/scenario/sensitivity).
- Liveness vs readiness split; readiness checks store/RPC/oracle.
- Deploy workflow gated on CI with real target + rollback.

## 6. Nice-to-have (can wait)

- VaR/correlation/time-series analytics depth.
- Postgres backend, k8s manifests, IaC.
- Tokenized-equity (xStocks/Backed) adapter replacing mock `tAAPL`.

---

## 7. Remediation plan (commit series)

| # | Workstream | Primary files |
| --- | --- | --- |
| 1 | Version docs + audit | `.gitignore`, `docs/*` |
| 2 | Make MXE crate build + wire circuit | `mxe/Cargo.toml`, `mxe/src/lib.rs` |
| 3 | Align Anchor version + CI build gate | `Anchor.toml`, `.github/workflows/ci.yml` |
| 4 | Real Solidity custody/transfer + foundry + tests | `contracts/`, `foundry.toml` |
| 5 | Real Nitro NSM attestation + fail-closed | `enclave/**`, `lib/confidential.ts` |
| 6 | Wire real confidential transports; remove sim defaults in prod | `lib/confidential.ts`, `lib/env.ts` |
| 7 | Live Kamino + Monad adapters | `lib/adapters/*`, `lib/positions.ts` |
| 8 | CSV/JSON institutional importer + Pyth-priced book builder | `lib/scanner/*`, `app/api/v1/*` |
| 9 | Real on-chain deposit UX (client-signed Anchor) | `components/escrow-vault-card.tsx`, `lib/escrow-onchain.ts` |
| 10 | Multi-chain wallet connect + real seal signing | `components/wallet-connect.tsx`, `app/deal/**` |
| 11 | Monad parallel clearing grid + batch upload | `app/monad/page.tsx`, `.../parallel/route.ts` |
| 12 | Institutional risk analytics surface | `components/*`, `lib/margin.ts` |
| 13 | Production trust hub `/security` | `app/security/page.tsx`, `lib/security-audit.ts` |
| 14 | Hardening: env, logs, rate limit, registry durability | `lib/env.ts`, `lib/http.ts`, `lib/computation-registry.ts` |
| 15 | Tests: on-chain, attestation, fail-closed x402, no-leg-leak | `tests/**`, `programs/**/tests` |
| 16 | CI/CD + Docker + rollback + migrations | `.github/workflows/*`, `Dockerfile` |
| 17 | README honesty + ARCHITECTURE/API/RUNBOOK/DECISIONS | `README.md`, `docs/*` |
| 18 | LAUNCH_READINESS report | `docs/LAUNCH_READINESS.md` |

**Verification gates (must all pass):** `npm run typecheck && npm run lint &&
npm run test && npm run build && npm run verify:security`, plus new
`cargo build`/`cargo test` (escrow + enclave), `anchor build`, `forge build`/`forge
test`.
