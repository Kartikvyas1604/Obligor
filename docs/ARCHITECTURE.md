# Architecture

## Overview
Obligor is a bilateral confidential clearing system: two desks privately submit books; a sealed confidential boundary computes bucket-netted combined IM; escrow releases excess on-chain. All flows prioritize privacy (no counterparty book), determinism, and fail-closed behavior.

## Core surfaces
- Web app (Next.js App Router): `/deal`, `/clear`, `/monad`, `/agents`, `/security`, `/verify`-style flows
- API (REST): `/api/v1/sessions/*`, `/api/v1/positions/*`, `/api/v1/net-margin/*`, `/api/v1/escrow/*`, `/api/v1/venues/*`, `/api/v1/oracle/*`, `/api/v1/x402/*`, `/api/v1/security/*`
- On-chain: Anchor program `obligor-escrow` at `94YmMnGjq2U8zpsLMSuk9fMwnfcHqrft3CtmwuZidMkZ` (u64 amounts, proportional release, escrow PDA)
- Confidential backends: `ArciumBackend` (MPC), `EnclaveBackend` (TEE/Nitro) — honest labeling. Default dev path labeled; prod requires real transports when configured.
- External: Pyth Hermes (price marks), Kamino/Monad/Drift adapters (venue reads), x402 (machine payments), EVM/Solana wallets

## Data model
- `DealSession`: per room, tokens hashed, parties, legs, seals (chain + signature), readiness, escrow fields
- `PositionLeg`: venue/instrument/bucket/side/qty/notionalUsd/markUsd/haircut/signedExposureUsd/source
- `ComputationRecord`: computationId, chain, backendKind, commitmentHash, partyLegHashes (per party, SHA-256 of canonical legs), marksByBucket (applied marks), combinedNettedUsd, grossNotionalUsd, perPartySiloedUsd, createdAt — contains NO plaintext legs
- Escrow snapshot: on-chain read-only decode of EscrowAccount

## Privacy boundary
- Counterparty legs never leave the desk scope to the other desk's UI/API. `/net-margin` runs sealed; `/net-margin/verify` asks caller to re-submit only their own legs, compares `hashLegs` to registered `partyLegHashes[party]`, echoes only aggregate scalars and caller's contribution.
- Seal message: canonical `{sessionId,partyId,chain,book: legsCommitment(party.legs)}` where `legsCommitment` is canonical JSON → sha256:hex (sorted keys). Signed by wallet; verified server-side.
- Registry stores only hashes; `registryStoresLegs()` invariant checks.

## Crypto (client-server)
- Solana message signing: wallet `signMessage` (32-byte payload prefixed by program/solana convention not required; we sign the UTF-8 bytes of the canonical message). Verification via `@noble/curves/ed25519.verify`.
- EVM (Monad): EIP-191 `personal_sign` → recovered address compared to `0x...`. Uses `secp256k1.recoverPublicKey` (runtime) over keccak256 of message; recid-first recovered sig bytes. Address derived from recovered pubkey (no-checksum on compare is fine; we compare lowercase hex).
- Commitment: `sha256` (canonical JSON) for legs; `sha256:hex` prefix in commitments.

## Escrow (Solana)
- PDA: `[b"escrow", party_a, party_b]`, vault ATA owned by escrow PDA. Collateral moved into vault on init (parties sign). `settle_and_release_excess(netted_margin_usd, proof_hash)` requires `clearing_authority` (has_one), enforces status Deposited, `netted <= total_locked`, computes proportional release in u128, transfers back to party ATAs, emits event.
- IDL-matched layout; client builds tx via `@solana/web3.js` with IDL discriminator. JS `escrow-client` + Rust `compute_release_split` both implement proportional release (remainder to b).

## Import pipeline
- `lib/scanner/import.ts`: `normHeader`, `recordToLeg`, `HEADER_ALIASES` → validates, prices (oracle marks override allowed). Returns 422 with row errors.
- `lib/scanner/pairs.ts`: batch desk pairs (aWallet/bWallet required), priced to MON/monad context, `toParallelLegs` for parallel clearing grid.

## Risk
- `analyzeRisk`: exposures per bucket/venue, HHI concentration, gross/net. `stressTest/stressPortfolio`: deterministic scenarios (`risk_off`, `severe`, `margin_spiral`). Wired to deal+clear.

## Storage & durability
- In-mem default; sqlite when `SESSION_STORE_MODE=sqlite` or `IDEMPOTENCY_BACKEND=sqlite`. Tables: sessions, idempotency, computations. WAL, busy_timeout=5000, created_at index, retention-based prune for computations.
- Rate limit: in-mem token buckets, capped (MAX_BUCKETS 20000), idle sweep, Retry-After on 429.

## Security
- CSP: allows needed connect-src (hermes, fontshare, configured RPCs). X-Frame-Options SAMEORIGIN. HSTS in prod. No poweredBy. X-Content-Type-Options nosniff.
- Secrets never logged (redact nested). x402 receipts ed25519 verified fail-closed. Nitro host verifier checks COSE, pinned root, chain, PCR0, nonce; ignores bare boolean. Confidential fail-closed when transports unset. Demo fixtures disabled in prod.
- Capability tokens SHA-256 hashed; session auth isolated.
