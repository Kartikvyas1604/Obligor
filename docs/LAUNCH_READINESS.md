# Launch Readiness (Obligor Prime)

## Invariants (must hold in production)
- Security self-audit: verdict `pass`, 14/14 checks pass (nitro attestation host-side verified, confidential fail-closed, seal signatures required+verified, escrow on-chain, imports strict, demo fixtures off)
- Tests: app 131/131, on-chain lib 9/9, forge tests pass (CI), mxe tests pass (CI)
- Privacy: registryStoresLegs() false; /verify never leaks counterparty data
- Fail-closed: x402, confidential transports, escrow settle gated, imports 422 on any row error, seals reject bad sigs
- Crypto: real wallet signing (ed25519/EIP-191), base58 matches bs58
- Risk: deterministic, no VaR claims
- Rate limit + logs redacted + bounded memory

## Deployment checklist
- [ ] `NODE_ENV=production`
- [ ] SQLite durable (SESSION_STORE_MODE=sqlite + SQLITE_PATH writable)
- [ ] `REGISTRY_RETENTION_MS` set (bounded)
- [ ] Demo flags OFF (`DEMO_ALLOW_FIXTURES`, `DEMO_ALLOW_UNPAID` false)
- [ ] x402 configured (`SOLANA_PAY_TO` or Monad gated)
- [ ] Escrow not arm-settling by accident unless `ESCROW_REAL_SETTLE=true` and funded authority
- [ ] Run `npm run migrate` before starting server (or rely on lazy create)
- [ ] Docker image built (standalone), health `/api/v1/health` returns ok:true
- [ ] CI green (lint, tsc, tests, docker, native, anchor build+assert artifacts)
- [ ] Rollback path: previous GHCR tag available

## Known honest gaps (documented)
- No Arcium CLI/crates offline → no real MPC encryption lifecycle wired (honestly labeled)
- No genuine NSM producer inside enclave in this build; host verifies NSM shape when provided, else enclave reports `provider:none`
- Kamino/Monad live calls may use labeled fallback in restricted networks; adapter shapes grounded
- x402 on-chain settlement via @x402 SDK is follow-up (receipts verified now)

## Commands (quick)
```bash
npm ci && npm run lint && npx tsc --noEmit && npm test && cargo test -p obligor-escrow && npm run build
npm run migrate
npm start
curl -fsS http://localhost:3000/api/v1/health
curl -fsS http://localhost:3000/api/v1/security/self-audit | jq '.verdict,.checks|length'
```

## Commit state
- ws1–12: committed (e.g. 9ab205c ws9, 22d1127 ws12)
- ws13: 84cb320 (security trust hub)
- ws14: 50ae8a0 (hardening)
- ws15: 6269469 (tests)
- ws16: 9cc9697 (docker+ci+migrations+rollback)
