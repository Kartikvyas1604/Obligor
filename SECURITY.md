# Security Policy

Obligor computes a confidential two-party net margin. The load-bearing security
property is **confidentiality of each desk's book**: neither counterparty — and
not the operator — should be able to reconstruct the other side's positions or
signed exposures from the API. Reports about data leakage are the highest
priority.

## Reporting a vulnerability

Do **not** open a public issue. Email **vkartik013@gmail.com** with:

- a description of the issue and its impact,
- a minimal reproduction (request/response, or a failing test),
- the affected route(s) or file(s), and
- whether you believe it is exploitable without authentication.

You will get an acknowledgement within **72 hours**. We aim to ship a fix or a
mitigation for confirmed, exploitable issues within **14 days**, and we will
credit you in the fix's commit message unless you ask us not to.

## In scope

- The HTTP API under `app/api/**` — auth, validation, rate limiting, privacy
  invariants (aggregate-only responses, redacted books).
- The margin/netting math in `lib/margin.ts` and any backend that mirrors it.
- The capability-token model for deal rooms (`lib/deal-session.ts`).
- Idempotency and replay handling on write intents (`lib/idempotency.ts`).
- The Solidity escrow contract (`contracts/`) and the Rust enclave
  (`enclave/obligor-enclave/`).

## Known and documented limitations (not vulnerabilities)

These are disclosed by design, not bugs. They are labeled in the API responses
and in the README, and they are the reasons this build is **not** yet
mainnet-ready:

- **x402 receipts are not cryptographically verified by default.** The verifier
  is a format check that runs only under the explicit
  `X402_ACCEPT_UNVERIFIED_SIGNATURES=true` escape hatch. In production this
  fails closed — a well-formed header can never clear payment on its own.
- **Confidential backends run in sealed-execution simulation by default.**
  `trustModel` reports `simulated_plaintext_compute` unless
  `CONFIDENTIAL_REAL_TRANSPORTS=true`. It never claims `cryptographic_mpc` or
  `hardware_attested_tee` for a path that did not actually run that way.
- **Escrow settlement returns a computed envelope, not an on-chain
  transaction.** No fabricated transaction hashes are ever returned. The real
  lock/transfer executes in the escrow contract repo.
- **Rate limiting and idempotency stores are in-memory, per instance.** Put a
  shared edge limiter / store in front before running more than one instance.

If a report shows one of these guards can be bypassed (for example, that the
escape hatches are honored in production, or that a redacted book can be
reconstructed), that **is** in scope.

## Supported versions

Obligor is pre-1.0 and ships from `main` only. Security fixes land on `main`;
there are no maintained back-branches yet.
