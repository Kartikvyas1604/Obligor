# Decisions (Architecture Decision Records)

This document captures key decisions made while hardening Obligor into a production-ready, "zero-demo / zero-simulation by default" codebase. Decisions favor verifiability, honesty, and provable invariants over convenience.

## Format
Each entry follows: Date, Status, Context, Decision, Consequences.

## ADR-001: Honor AGENT.md over other documents
- Date: 2026-10-14
- Status: Accepted
- Context: Multiple docs drifted over time (Prototype, MVP, Prompt.md). AGENT.md codified the non-negotiable honesty contract (load-bearing).
- Decision: AGENT.md takes precedence. Any implementation must obey: no fabricated attestation/MPC; confidential compute must be either real or honestly labeled simulated_plaintext_compute; /verify never reveals counterparty book; live venue legs degrade loudly; per-workstream commits.
- Consequences: Security audit logic enforces fail-closed behavior and explicitly labels simulation. Documentation removed or corrected references to "fake" when already replaced with honest labels.

## ADR-002: Real wallet signatures for deal seals
- Date: 2026-10-14
- Status: Accepted
- Context: Early prototype allowed placeholder seals. Institutional desks must cryptographically bind a book to a wallet+chain.
- Decision: Seals require a signature over a canonical message. Server verifies ed25519 (Solana) via `ed25519.verify` and EIP-191 personal_sign recovered address for EVM/Monad. Rejection reason `SEAL_SIGNATURE_INVALID` on mismatch.
- Consequences: Cannot seal without a connected wallet. base58 codec fixed to match bs58 for all edge cases ([0]→"1", etc.). Tests cover 9 vectors.

## ADR-003: Deterministic base58 in-repo
- Date: 2026-10-14
- Status: Accepted
- Context: `bs58` has no types. We needed a tiny, audit-friendly, client-safe implementation.
- Decision: Implement `lib/base58.ts` matching bs58 semantics (zero-preserving encoder: pop trailing zero digits; decoder start empty). Re-exported from seal-verify.
- Consequences: No extra typed-dependency. Portable to browser (client-safe). Round-trips verified.

## ADR-004: Price verification uses marksOverride on re-submit (no oracle move)
- Date: 2026-10-14
- Status: Accepted
- Context: /verify re-prices caller legs. If we re-fetched Pyth, a mark move between compute and verify could create a false negative, breaking the prover.
- Decision: At compute time record `marksByBucket` (oracle marks applied). At verify, pass `marksOverride = record.marksByBucket` so pricing is deterministic and matches the commitment.
- Consequences: Verifier is stable. If no override exists, falls back to oracle (not expected). Tests cover both paths conceptually.

## ADR-005: Strict imports, no partial success
- Date: 2026-10-14
- Status: Accepted
- Context: Batch uploads tempting to "import N of M" and return warnings.
- Decision: CSV/JSON and Monad batch pair imports validate every row. On any row error, return 422 IMPORT_INVALID with per-row errors. Do not persist partial state.
- Consequences: Fail closed. UX shows actionable row errors. Pairs include wallet constraints (both desks present) and format detection.

## ADR-006: Institutional risk analytics surface
- Date: 2026-10-14
- Status: Accepted
- Context: Production workflows need desk-book + combined portfolio risk view.
- Decision: `lib/risk.ts` computes deterministic metrics (gross/net, concentration HHI, bucket/venue exposures, stress tests: risk_off, severe, margin_spiral). Components wired into deal room and clear page.
- Consequences: Deterministic (no VaR claims). Test coverage for basic cases.

## ADR-007: Fail-closed by default for confidential compute
- Date: 2026-10-14
- Status: Accepted
- Context: Production must not silently simulate MPC/TEE.
- Decision: `CONFIDENTIAL_REAL_TRANSPORTS` required in prod to attempt real backends. If transport missing and `CONFIDENTIAL_ALLOW_SIMULATION` false → fail closed. If simulation allowed → labeled `simulated_plaintext_compute`. TEE quotes require verified NSM; bare `verified:true` is ignored.
- Consequences: Honest disclosure. Security audit reflects this. x402/attestation similarly fail closed.

## ADR-008: SQLite-backed durability for registry/ stores (opt-in scale-out)
- Date: 2026-10-14
- Status: Accepted
- Context: Multi-process/restart robustness. Registry must preserve computation records (hashes only) for /verify.
- Decision: Support `sqlite` mode. Computations persisted with created_at, index added, retention-based prune (`REGISTRY_RETENTION_MS`, default 30d). Per-instance Map still authoritative; DB best-effort. idempotency/store share interface.
- Consequences: Bounded storage. Migrations script. `node:sqlite` used via getBuiltinModule (Node 24). PRAGMA journal_mode=WAL.

## ADR-009: Bounded rate limiter
- Date: 2026-10-14
- Status: Accepted
- Context: Unbounded per-key Map grows under distinct key spam.
- Decision: Cap `MAX_BUCKETS=20000`, sweep full idle buckets first, else drop oldest. On 429 include `Retry-After` and `RateLimit-*`.
- Consequences: OOM/DoS surface reduced. Headers useful for clients/proxies.

## ADR-010: No-leg-leak invariant enforced
- Date: 2026-10-14
- Status: Accepted
- Context: Privacy is the product.
- Decision: /verify response never includes counterparty legs, per-party arrays, or counterparty hashes. Only caller's `siloedContributionUsd`, public aggregate scalar, prefixes of caller's hash, verification flags.
- Consequences: Explicit test covering true/mismatch cases, asserting no counterparty material appears.

## ADR-011: On-chain escrow math tested (pure function)
- Date: 2026-10-14
- Status: Accepted
- Context: Release split must be exact (sum preserved), proportional, and bounded.
- Decision: Extract `compute_release_split` into pure Rust function in the program; add 8 unit tests covering max u64, floor, remainder-to-b, rejection cases. Runs without validator.
- Consequences: Deterministic split mirrors TS logic. CI runs `cargo test -p obligor-escrow`.

## ADR-012: Honest "no demo fixtures" in prod
- Date: 2026-10-14
- Status: Accepted
- Context: Fixture endpoints enabled in dev for exploration; dangerous in prod.
- Decision: `/security` flag `demo_fixtures` fails in prod if `DEMO_ALLOW_FIXTURES` true. All fixture routes gated. Monad page no longer depends on fixtures.
- Consequences: Fail loud. Clear audit trail.

## ADR-013: Containerization + rollback + migrations (ws16)
- Date: 2026-10-14
- Status: Accepted
- Context: Deploys need deterministic image, explicit migrations, rollback.
- Decision: Next standalone output, multi-stage Dockerfile (non-root), docker-compose with sqlite volume, `migrate` script (idempotent), rollback workflow to re-tag `latest`, CI docker build+healthcheck + cargo test + migrate smoke.
- Consequences: Production path reproducible. Healthcheck against /api/v1/health.
