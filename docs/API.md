# API

All endpoints under `/api/v1`. Errors: `{ok:false, error:code, message, requestId}`. Success: `{ok:true,...}`. Rate limit sets `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After` on 429.

## Health
GET `/api/v1/health` → config, store mode, counts.

## Sessions
- GET `/api/v1/sessions/[sessionId]` → public session view (no legs to counterparty)
- POST `/api/v1/sessions/[sessionId]` → join/reveal/ready/seal actions. `seal` requires `signature` (base58/min8) + `chain` (solana|monad), validates against wallet, returns SEAL_SIGNATURE_INVALID on mismatch.

## Positions
- POST `/api/v1/positions/import` → book import (CSV/JSON), returns 422 IMPORT_INVALID with row errors
- POST `/api/v1/positions/import-pairs` → batch desk pairs `{format,chain,data}` → priced pairs + parallelLegs

## Net margin
- POST `/api/v1/net-margin` → sealed compute; returns commitment + hashes only (no counterparty legs). Records marksByBucket + hashes in registry.
- POST `/api/v1/net-margin/multi` → multi-party extension (confidentialSafeWarnings applied)
- POST `/api/v1/net-margin/verify` → body `{computationId,commitmentHash,party,legs}` (caller-only). Returns: verified, hashMatch, commitmentValid, recomputedHash prefix, storedHashPrefix (caller), siloedContributionUsd, combinedNettedUsd, registeredAt, backendKind, note. NEVER includes counterparty legs/hashes.

## Escrow
- POST `/api/v1/escrow/config` → escrow params
- POST `/api/v1/escrow/verify` → `{escrowAccount}` → live on-chain snapshot (fail-closed on bad RPC/account)
- POST `/api/v1/escrow/deposit` → client-signed deposit tx
- POST `/api/v1/escrow/settle` → real settlement (requires authority/env; gated)

## Venues
- GET `/api/v1/venues/kamino?pubkey=...` → obligations/portfolio (public API)
- POST `/api/v1/venues/monad/parallel` → parallel epoch reading

## Oracle
- `GET/POST /api/v1/oracle/*` — live Pyth Hermes (fallback labeled when enabled)

## x402
- `/api/v1/x402/*` — machine payments; ed25519 receipt verification fail-closed

## Security
- GET `/api/v1/security/self-audit` → 14 invariant checks (prod pass)
