# Runbook

## Local dev
- Node 24.x, npm ci, cargo (for on-chain)
- Run app: `npm run dev` (http://localhost:3000)
- Tests: `npm test` (131), `npx tsc --noEmit`, `npm run lint`
- Migrate sqlite: `SESSION_STORE_MODE=sqlite SQLITE_PATH=/tmp/dev.db npm run migrate`
- Programs tests: `cargo test -p obligor-escrow` (9)

## Production env (required/notes)
- `NODE_ENV=production` for hard gates
- `DATA_DIR` / `SQLITE_PATH` for durable storage
- `SOLANA_RPC_URL` etc; escrow settles off unless `ESCROW_REAL_SETTLE=true`
- x402: `SOLANA_PAY_TO` (or MONAD_PAY_TO + MONAD_ENABLED). 
- Confidential: set `CONFIDENTIAL_REAL_TRANSPORTS=true` + endpoints when wiring real backends; otherwise explicitly allow labeled simulation with care.

## Container
- `docker build -t obligor:local .`
- `docker compose up` (sqlite volume at /data/obligor.db). Health: GET /api/v1/health

## CI
- verify: lint, tsc, tests, migrate smoke, build (production), security contract check
- docker: build + healthcheck
- native: build enclave/mxe/anchor host types + forge build/test + cargo test -p obligor-escrow
- anchor: `anchor build` + assert .so/idl exist

## Rollback
- Deploy publishes `ghcr.io/<repo>:<short-sha>` and `latest`. To rollback, run the `Rollback (container)` workflow dispatch with the last-good `tag` (short SHA). This re-tags that image as `latest`.

## Key endpoints
- Health: `GET /api/v1/health`
- Sessions: `POST/GET /api/v1/sessions/:id` (seals require wallet signature)
- Positions: `POST /api/v1/positions/import` (CSV/JSON), `POST /api/v1/positions/import-pairs` (batch pairs)
- Net margin: `POST /api/v1/net-margin` (sealed compute), `POST /api/v1/net-margin/multi`, `POST /api/v1/net-margin/verify` (caller-only legs; hashes only)
- Escrow: `POST /api/v1/escrow/config`, `POST /api/v1/escrow/verify` (on-chain read), `POST /api/v1/escrow/deposit`, `POST /api/v1/escrow/settle`
- Venues: `GET /api/v1/venues/kamino?pubkey=...`, `POST /api/v1/venues/monad/parallel` (parallel epoch)
- Security: `GET /api/v1/security/self-audit`

## Privacy checks
- `registryStoresLegs()` must remain false
- /verify never returns counterparty hashes/legs
- Logs redact `token`, `key`, `password`, `signature`, `authorization`, nested objects/arrays; strings truncated 300

## Common failures
- base58 mismatch → compare against bs58 fixtures (lib/base58 fixed)
- 422 IMPORT_INVALID → bad row (per-row errors)
- SEAL_SIGNATURE_INVALID → signature or wallet mismatch
- RATE_LIMITED → includes Retry-After
- x402: verify requires real ed25519 signature; fail-closed when misconfigured
