<div align="center">

# <img src="public/logo-lockup.svg" alt="Obligor logo — two offset pill bars, a gold exposure bar netting into a steel counterparty bar, with the Obligor wordmark" width="260" />

**Confidential Two-Party Portfolio Clearing**

*Two mutually distrusting trading desks · One aggregate net margin · Neither party sees the other's book*

[![License: MIT](https://img.shields.io/badge/License-MIT-E5B84B.svg)](LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16.3.6-0A0B0D.svg)](https://nextjs.org/)
[![Solana Devnet](https://img.shields.io/badge/Solana-Arcium_MPC-9945FF.svg)](https://solana.com)
[![Monad Testnet](https://img.shields.io/badge/Monad-Attested_TEE-836EF9.svg)](https://monad.xyz)
[![x402 V2](https://img.shields.io/badge/x402-V2_Machine_Payments-22C55E.svg)](https://docs.x402.org)

</div>

---

## Executive Summary

**Obligor** is confidential two-party clearing for trading desks and autonomous agents. Two distinct wallets — an agent desk (Party A) and a counterparty desk (Party B) — submit their multi-venue DeFi positions into a confidential computation. The computation outputs a single scalar: the **combined net initial margin**. Neither party ever sees the other side's book, and neither does the operator.

```
Party A (Desk Alpha)                     Party B (Counterparty)
  [Kamino SOL lend + tAAPL]                [Drift SOL-PERP short]
          │                                         │
          │  seal/encrypt own legs                  │  seal/encrypt own legs
          ▼                                         ▼
   Position Book A                           Position Book B
(never revealed to B)                     (never revealed to A)
          │                                         │
          └───────────────────┬─────────────────────┘
                              ▼
                 ConfidentialBackend.netTwoParty
                              │
     ┌────────────────────────┼────────────────────────┐
     ▼                        ▼                        ▼
ArciumBackend          EnclaveBackend           SimulatedBackend
(Solana Arcis MPC)     (Monad Nitro TEE)        (Local In-Process)
     │                        │                        │
     └────────────────────────┴────────────────────────┘
                              ▼
                   Combined NetMarginResult
             • Siloed Combined Margin : $46,500
             • Netted Combined Margin : $24,500
             • Capital Freed (Savings): $22,000 (47.3%)
             • Zero per-leg plaintext exposed
```

---

## The Problem & The Load-Bearing Insight

### The DeFi Problem
Siloed DeFi protocols demand full collateral even when positions economically offset **across counterparties**. If Desk A is long SOL exposure via Kamino lending collateral ($90,000) and Desk B is short SOL-PERP on Drift ($95,000), both desks post separate, full initial margin. Over $46,000 in collateral is locked up despite the net system exposure being only $15,000.

### Why Centralized Clearing Fails
TradFi solves cross-counterparty offset via central counterparty (CCP) clearing houses. A centralized DeFi "prime" that sees **both** books creates a catastrophic front-running and strategy-leak liability: whoever operates the clearing node can copy-trade, front-run, or trade against either desk's private strategies.

### The Two Core Principles
1. **Single-wallet self-netting is NOT the product.** A single user netting their own positions across venues already holds all the data and can compute it in a browser for free. Building confidential compute for single-wallet self-netting is privacy theater.
2. **Mutually distrusting desks ARE the product.** Two independent trading desks who will only share encrypted (or enclave-sealed) inputs into a joint computation need a real confidential clearing engine.

---

## Mathematical Portfolio Netting Engine

The margin engine is completely transparent, deterministic, and identical across all backends:

$$\text{IM}_{\text{siloed}}(P) = \sum_{i \in P} h_i \cdot |\text{notional}_i|$$

$$\text{IM}_{\text{siloed, combined}} = \text{IM}_{\text{siloed}}(A) + \text{IM}_{\text{siloed}}(B)$$

### Cross-Party Netted Formula
1. **Union Legs:** Merge all position legs from Party A and Party B into a joint evaluation set without revealing individual leg owners outside the computation boundary.
2. **Bucket Aggregation:** Group all legs by underlying risk factor bucket ($b \in \{\text{SOL}, \text{BTC}, \text{ETH}, \text{AAPL}, \text{MON}, \text{USD}\}$). A short perpetual contract on Drift and a lending supply position on Kamino both resolve to the same underlying `SOL` bucket.
3. **Net Signed Exposure:** Compute the signed directional exposure across counterparties in each bucket:
   $$E_b = \sum_{i \in b} \text{signedExposureUsd}_i$$
4. **Conservative Max-Haircut Selection:** Assign bucket initial margin using the highest (most conservative) haircut among all instruments present in that bucket:
   $$\text{IM}_b = \max_{i \in b}(h_i) \cdot |E_b|$$
5. **Portfolio Margin & Savings:** Compute total portfolio netted initial margin and capital freed:
   $$\text{IM}_{\text{netted, combined}} = \sum_b \text{IM}_b$$
   $$\text{Savings} = \max(0, \text{IM}_{\text{siloed, combined}} - \text{IM}_{\text{netted, combined}})$$

### Default Haircuts ($h_i$)
| Instrument Class | Default Haircut | Notes |
| :--- | :--- | :--- |
| Spot & Lending Collateral (SOL, USDC, MON) | **10%** | Kamino Lend, MarginFi deposits |
| Perpetual Futures (SOL-PERP, BTC-PERP, ETH-PERP) | **15%** | Drift Protocol perps |
| Mock Equity (`tAAPL`) | **25%** | Adapter-ready tokenized equities (xStocks/Backed) |

---

## Worked Numerical Example

**Party A (Desk Alpha):**
- $90,000 Kamino SOL Lend (haircut 10%) $\rightarrow \$9,000$ IM
- $40,000 Kamino USDC Deposit (haircut 10%) $\rightarrow \$4,000$ IM
- $55,000 Mock `tAAPL` Long (haircut 25%) $\rightarrow \$13,750$ IM
- **Party A Siloed IM: $26,750**

**Party B (Counterparty):**
- $95,000 Drift SOL-PERP Short (haircut 15%) $\rightarrow \$14,250$ IM
- $30,000 Drift BTC-PERP Long (haircut 15%) $\rightarrow \$4,500$ IM
- $10,000 Kamino SOL Borrow (haircut 10%) $\rightarrow \$1,000$ IM
- **Party B Siloed IM: $19,750**

**Siloed Combined Margin (No Clearing):** $\$26,750 + \$19,750 = \mathbf{\$46,500}$

**Obligor Two-Party Netted Margin:**
- **SOL Bucket:** $+90,000 - 95,000 - 10,000 = -15,000$ net directional exposure. $\max(0.10, 0.15) = 15\% \times \$15,000 = \mathbf{\$2,250}$ (saves $\$13,000$ vs isolated IM)
- **USD Bucket:** $+40,000 \times 10\% = \mathbf{\$4,000}$
- **BTC Bucket:** $+30,000 \times 15\% = \mathbf{\$4,500}$
- **AAPL Bucket:** $+55,000 \times 25\% = \mathbf{\$13,750}$
- **Combined Netted Margin:** $\mathbf{\$24,500}$
- **Capital Freed (Savings):** $\mathbf{\$22,000}$ (**47.3% margin reduction**), with zero leakage of private book notionals.

---

## Pluggable Confidential Backends & Trust Models

Obligor implements a pluggable `ConfidentialBackend` interface. The mathematical engine is identical everywhere; what changes per network is the trust transport:

| Chain | Backend Implementation | Trust Model | Status |
| :--- | :--- | :--- | :--- |
| **Solana** | `ArciumBackend` (Arcis MXE) | **Cryptographic MPC** target — no single operator can observe decrypted books once the MXE lifecycle is wired | Not wired: runs the exact formula as labeled `simulated_plaintext_compute` |
| **Monad** | `EnclaveBackend` (AWS Nitro / Marlin Oyster) | **Hardware-Attested TEE** target — enclave sealed by a measured PCR0 quote | Enclave wire real but un-attested; TEE claimed only on a host-verified measurement match |
| **Local / Test** | `SimulatedBackend` | **In-Process Compute** — local execution labeled `SIMULATED` | Available |

### The Honesty Rule: $\text{TEE} \neq \text{MPC}$
The two transports deliver confidentiality with distinct trust trade-offs. Neither is claimed until it is verifiably wired:
- **Cryptographic MPC (Arcium) — target:** Distributes trust across multi-party execution nodes using threshold cryptography so no single entity observes decrypted books. The `@arcium-hq/client` MXE lifecycle is the tracked follow-up; until then `ArciumBackend` labels every run `simulated_plaintext_compute` and never POSTs plaintext while claiming MPC.
- **Hardware-Attested TEE (AWS Nitro / Marlin Oyster) — target:** Relies on isolated CPU secure enclaves and cryptographic PCR0 attestation quotes. The Rust enclave in `enclave/obligor-enclave/` is a real wire, but it is UNTRUSTED: the host claims `hardware_attested_tee` only after independently matching the returned measurement (and PCR0) against `ENCLAVE_EXPECTED_MEASUREMENT` / `ENCLAVE_EXPECTED_PCR0`. A bare `verified:true` from the enclave is not sufficient.
- **Obligor's Rule:** Obligor labels every backend on screen and in API responses — and never upgrades a label it cannot verify. We never conflate TEE with MPC.

---

## The Four Interactive Demo Surfaces
Explore all four surfaces directly in your browser:

### 1. Two-Party Clearing Session (`/clear`)
- **Interactive Portfolio Setup:** Pair Party A (Desk Alpha) and Party B (Counterparty Desk) via Solana wallet connect or pre-loaded fixtures.
- **Live Netting Calculator:** Real-time dual slider and typed numerical inputs showing instant siloed vs netted margins.
- **Mock Equity Injection:** Dynamically attach or detach tokenized equity positions (`tAAPL` Long/Short) to evaluate cross-asset clearing.
- **Pluggable Backend Toggle:** Switch between the `MPC target` (Solana), `TEE target` (Monad), and `Simulated Local` backends — each labeled honestly with the trust model that actually ran.
- **Live API Routing:** Option to route clearing computations through the live Next.js API gateway (`/api/v1/net-margin`).

### 2. Adversarial Counterfactual (`/adversarial`)
- **The Contrast Screen:** Demonstrates why centralized single-operator clearing is broken.
- **Confirmation Gate:** Requires deliberate user acknowledgment: *"I understand this leaks both books"*.
- **Plaintext Threat Vector View:** Displays **both books side-by-side** with annotations detailing operator front-running, strategy extraction, and copy-trading vulnerabilities.
- **Auto-Return Timer:** Safely returns user to the confidential session after review.

### 3. Monad Parallel Multi-Pair Clearing (`/monad`)
- **Monad High-Throughput Differentiator:** Simultaneously nets **$\ge 3$ desk pairs** in one epoch.
- **Real-Time Concurrency Telemetry:** Live epoch execution timer, concurrency counter, and per-pair capital savings cards.
- **Attestation Inspector:** Surfaces enclave attestation metadata only when the enclave actually presents it — no TEE is claimed otherwise, and the trust model stays labeled.

### 4. Machine-Payable Agents (`/agents`)
- **x402 V2 Terminal Runners:** Autonomous agents querying the gated clearing API.
- **HTTP 402 Protocol Flow:** Demonstrates `402 PAYMENT-REQUIRED` challenge handling, the $0.01 USDC payment step (real ed25519 signing ships in `scripts/sign-x402-receipt.ts`; the browser demo labels its synthetic signature), and the `200 OK` aggregate margin response.
- **Privacy Audit Inspector:** Expandable raw JSON viewer showing only the aggregate is returned — no individual leg is included.

---

## Honest Real vs. Mocked Matrix
Obligor explicitly labels what is real code, what is fixture, and what is out of MVP scope:

| Component | Status | Description |
| :--- | :--- | :--- |
| **Two-Party Netting Formula** | **Real** | Pure TypeScript source of truth (`lib/margin.ts`) with golden tests; mirrored in the Arcis circuit and the Rust enclave |
| **Position ingestion** | **Real (oracle-priced)** | Books enter via desk input, deal rooms, or the API; every mark re-priced against live Pyth Hermes with deviation/stale/fallback provenance labels. Fabricated per-party quantities were removed — positions are never invented. |
| **Confidential execution (MPC / TEE)** | **Enclave wire real — un-attested** | The Rust enclave (`enclave/obligor-enclave/`) is a real, dep-free HTTP service (GET `/health`, POST `/net`) using integer-cents math and deterministic ordering; with `CONFIDENTIAL_REAL_TRANSPORTS=true` + `ENCLAVE_ENDPOINT`, Node **sends both books to it and consumes the enclave's output** (it does not recompute locally). Because no hardware attestation quote is issued outside a real Nitro/Oyster VM, trustModel stays `simulated_plaintext_compute` with an honest note. The Arcis circuit (`mxe/`) remains CI-compiled sealed-execution simulation until the `@arcium-hq/client` MXE lifecycle is wired. An unconnected transport **fails closed**, never silently simulates. |
| **Hardware attestation** | **Not claimed (host-verified only)** | The enclave is UNTRUSTED: `hardware_attested_tee` is returned **only** when the host independently matches the returned measurement (and, if set, PCR0) against `ENCLAVE_EXPECTED_MEASUREMENT` / `ENCLAVE_EXPECTED_PCR0`. A bare `attestation.verified === true` from the enclave is **not** sufficient. The current enclave returns `provider:"none", verified:false` plus a SHA256 proof-of-execution digest, so no TEE is ever claimed; with no allowlist configured, TEE is never claimed (conservative). |
| **Mock Equity `tAAPL`** | **Mock** | Priced from the live Pyth AAPL mark; adapter-ready for xStocks/Backed rails; never custody |
| **Parallel Multi-Pair Clearing** | **Real** | `/api/v1/net-margin/parallel` nets ≥3 desk pairs concurrently per epoch (server-enforced minimum); trust model labeled from execution |
| **x402 V2 Machine Payments** | **Real verification — honest** | 402 challenge built from env terms is real; the Monad facilitator (`x402-facilitator.molandak.org/supported`) is live-verified by `npm run verify:x402`. Obligor signed receipts are **cryptographically verified** (ed25519 over `network/asset/payTo/amount` + one-time nonce) with `node:crypto` via `lib/x402.ts`; a forged/tampered envelope is rejected outright (`X402_REQUIRE_VERIFIED_SIGNATURES` forces fail-closed). The legacy format-check escape hatch is dev-only. The envelope is Obligor's own wire format — Coinbase x402 "exact" on-chain settlement (`@x402` SDK) is the tracked interop follow-up. `SOLANA_PAY_TO`/`MONAD_PAY_TO` gates enablement per chain. |
| **Bilateral escrow** | **Real on-chain settle (gated)** | The `programs/obligor-escrow` Anchor program (builds to a real BPF `.so`, program id `94YmMnGjq2U8zpsLMSuk9fMwnfcHqrft3CtmwuZidMkZ`) locks bilateral SPL collateral and settles it. With `ESCROW_REAL_SETTLE=true`, `POST /v1/escrow/settle` emits a **real** `settle_and_release_excess` transaction (`lib/escrow-onchain.ts`, assembled from the committed IDL discriminator via `@solana/web3.js`) and returns the verifiable signature; any failure returns `502` and records nothing. Default (`false`) returns `transactionSignature:null` — never a fabricated hash. `npm run escrow:local` brings up a localnet end-to-end (`npm run verify:escrow`). |
| **Capital Movement / Liquidation** | **Not Built** | Margin analytics only; Obligor does not custody or withdraw venue funds |

---

## API Reference

Base URL: `http://localhost:3000` (or `http://localhost:4021`)

### `GET /api/v1/health`
Health check and backend capability discovery. Shape (abridged — see the route for the full `config` surface):
```json
{
  "ok": true,
  "version": "0.1.0",
  "twoParty": true,
  "formula": "two_party_netted_bucket_haircut",
  "config": {
    "demoFixturesEnabled": true,
    "payments": { "solana": true, "monad": false },
    "storeMode": "file",
    "sessionCount": 0,
    "maxLegsPerBook": 16,
    "x402": {
      "priceUsd": 0.01,
      "networks": {
        "solana": { "network": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", "asset": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", "enabled": true },
        "monad": { "network": "eip155:10143", "asset": "0x534b2f3A21130d7a60830c2Df862319e593943A3", "enabled": false, "gate": "X402_MONAD_ENABLED" }
      }
    }
  }
}
```

### `POST /api/v1/net-margin` *(x402-gated)*
Computes two-party confidential net margin. Unpaid calls receive `402 PAYMENT-REQUIRED` with standard `WWW-Authenticate` payment challenge headers.

**Payment Headers:**
- `x-payment-signature: <signature>` or `authorization: Bearer <sig>`

**Request Body:**
```json
{
  "chain": "solana",
  "backend": "arcium",
  "partyA": { "wallet": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" },
  "partyB": { "wallet": "4Nd1mBQtrMJVYVf1fPtrC8q1cx4PzmpKvx64h3FsYytW" }
}
```

**Response (`200 OK`):**
```json
{
  "sessionId": "session_1728045600",
  "chain": "solana",
  "partyAWallet": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "partyBWallet": "4Nd1mBQtrMJVYVf1fPtrC8q1cx4PzmpKvx64h3FsYytW",
  "bookSummary": {
    "legCountA": 3,
    "legCountB": 3,
    "venues": ["kamino", "drift", "mock_equity"],
    "grossNotionalUsd": 325000,
    "netExposureUsd": -15000
  },
  "margin": {
    "siloedAUsd": 26750,
    "siloedBUsd": 19750,
    "siloedCombinedUsd": 46500,
    "nettedCombinedUsd": 24500,
    "savingsUsd": 22000,
    "backend": "arcium",
    "trustModel": "simulated_plaintext_compute",
    "simulationNote": "MPC circuit is compiled in mxe — this run executed the exact formula as sealed-execution simulation (no real encryption). Trust model not claimed.",
    "computationId": "arc_mxe_m2k19_8fa21"
  },
  "commitmentHash": "sha256:…",
  "disclaimer": "Two-party confidential clearing demo. Other party's legs omitted by design."
}
```

> **Trust model honesty:** `trustModel` above is what an un-wired build actually returns — `simulated_plaintext_compute`. It only ever reports `cryptographic_mpc` / `hardware_attested_tee` when `CONFIDENTIAL_REAL_TRANSPORTS=true` and the real backend is connected (then it fails closed rather than simulating). The example correctly shows the default behavior, not the aspiration.

> **Strict Privacy Invariant:** The confidential endpoint response strictly omits all individual position legs (`legs` array). Only aggregate book counts, venue lists, and net margin scalars are returned. Full legs remain private to each party's local wallet.

### `POST /api/v1/net-margin/parallel`
Monad parallel multi-pair clearing endpoint netting $\ge 3$ pairs concurrently per epoch.

### `POST /api/v1/demo/adversarial-plaintext`
Adversarial endpoint requiring `iUnderstandThisLeaksBothBooks: true`. Deliberately outputs both books in plaintext for pitch contrast.

---

## Directory Structure

```
Obligor/
├── app/
│   ├── api/                     # Next.js Route Handlers (x402 net-margin, parallel, health)
│   │   ├── health/
│   │   └── v1/
│   │       ├── demo/            # Adversarial and fixture routes
│   │       ├── health/
│   │       ├── net-margin/      # x402-gated netting & parallel routes
│   │       └── positions/
│   ├── adversarial/             # Plaintext operator counterfactual screen
│   ├── agents/                  # x402 machine payments terminal runner
│   ├── clear/                   # Main two-party confidential clearing session
│   ├── monad/                   # Monad parallel multi-pair clearing screen
│   ├── trust/                   # Real-vs-mocked & trust model comparison
│   ├── globals.css              # Obsidian / Monochrome design tokens
│   ├── layout.tsx
│   └── page.tsx                 # Landing page & four-minute judge path
├── components/                  # Modular React UI components
│   ├── backend-badge.tsx
│   ├── book-column.tsx
│   ├── margin-hero.tsx
│   ├── netting-calculator.tsx
│   ├── netting-preview.tsx
│   └── wallet-connect.tsx
├── lib/
│   ├── confidential.ts          # Pluggable backend implementations (Arcium, Enclave, Simulated)
│   ├── escrow-onchain.ts        # Real settle_and_release_excess emitter (gated, fail-closed)
│   ├── idl/
│   │   └── obligor_escrow.json  # Committed program IDL (settle discriminator source of truth)
│   ├── fixtures.ts              # Golden judge & multi-pair fixtures
│   ├── margin.ts                # Pure mathematical netting engine
│   └── positions.ts             # Position leg constructors & mock equity
├── programs/
│   ├── obligor-escrow/          # Bilateral margin escrow Anchor program (real BPF build)
│   │   ├── obligor_escrow-keypair.json  # Committed program keypair (fixed program id)
│   │   └── src/lib.rs           # initialize_escrow + settle_and_release_excess
│   └── obligor-mxe/             # Arcium MXE confidential Arcis circuit & Anchor program
│       ├── encrypted-ixs/       # Arcis two_party_portfolio_net confidential circuit
│       └── src/lib.rs           # Anchor clearing session queue & callback handlers
├── enclave/
│   └── obligor-enclave/         # Rust AWS Nitro / Marlin Oyster TEE enclave
│       ├── Cargo.toml           # Enclave dependencies (sha2, hex, serde)
│       └── src/main.rs          # Integer-cents two-party netting & honest un-attested default
├── scripts/
│   ├── demo-agent-a.ts          # Party A x402 client script
│   ├── demo-agent-b.ts          # Party B x402 client script
│   ├── demo-agent-monad.ts      # Monad parallel epoch client script
│   ├── escrow-local.sh          # Localnet bring-up: validator + build + deploy + .escrow-local.env
│   ├── verify-escrow.ts         # Opt-in end-to-end escrow test against a live validator
│   └── verify-x402-networks.ts  # x402 facilitator probe
├── tests/
│   ├── margin.test.ts           # Mathematical engine test suite
│   ├── rate-limit.test.ts
│   ├── session-auth.test.ts
│   └── session-store.test.ts
├── brand.md                     # Design system guidelines
├── CONTRIBUTING.md              # Architectural rules & contribution guide
├── package.json
└── README.md
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- npm or pnpm

### Installation
```bash
npm install
```

### Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

### Verification & Testing
```bash
# 1. Run the full unit test suite (margin engine, rate limiter, session store, escrow math, deal auth)
npm test

# 2. Verify x402 facilitator networks on Solana devnet and Monad testnet
npm run verify:x402

# 3. Run autonomous Party A x402 payment client agent
npm run demo:agent-a

# 4. Run autonomous Party B independent payment client agent
npm run demo:agent-b

# 5. Run autonomous Monad parallel multi-pair epoch clearing agent
npm run demo:agent-monad

# 6. Per-endpoint auth + validation contract check (run against a built server)
npm run build && npx next start -p 3000 &
npm run verify:security

# 7. Load sweep against the paid clearing path (latency percentiles + throughput)
npm run verify:load

# 8. On-chain escrow end-to-end: localnet validator + program deploy + real settle
npm run escrow:local          # writes ./.escrow-local.env
set -a; . ./.escrow-local.env; set +a
npm run verify:escrow         # SKIPs cleanly if no RPC is reachable

# 9. Production build & ESLint validation
npm run build
npm run lint
```

---

## Scope & Non-Goals
Obligor is **pure clearing compute and margin risk analytics**.
- It is **NOT** a custody protocol, lending pool, or decentralized exchange.
- It does **NOT** execute collateral transfers, margin calls, or venue liquidations.
- The $\$0.01$ per-call fee is a developer wedge for autonomous agent settlement via x402, not venture math.
- Production deployment will additionally require legal netting master agreements, venue-specific margin models, default fund capitalization, and hardened attestation verification.

---

## Deploy & Operations (production runbook)

Obligor's backend is **Next.js App Router Route Handlers in TypeScript** (no separate
Express sidecar). Everything configurable lives in the environment with zod-validated,
typed access in `lib/env.ts` — see [`.env.example`](.env.example) for the full matrix.

### Environment tiers

| Tier | Session store | Demo fixtures | Unpaid clearing | Payments |
| --- | --- | --- | --- | --- |
| Local dev | `SESSION_STORE_MODE=memory` | `DEMO_ALLOW_FIXTURES=true` | `DEMO_ALLOW_UNPAID=true` | optional |
| Staging | `file` (or `sqlite` on shared volume) | off | off | devnet/testnet USDC |
| Production | `sqlite` (multi-process, shared volume) or `file` (single instance); swap the store impl for Postgres/Redis for multi-machine | **off (hard default)** | **off (hard default)** | real payTo wallets via `SOLANA_PAY_TO` / `MONAD_PAY_TO` |

**Confidential execution gate:** `CONFIDENTIAL_REAL_TRANSPORTS=true` requires `ARCIUM_MXE_ENDPOINT` / `ENCLAVE_ENDPOINT` and makes unconnected transports **fail closed** (`CONFIDENTIAL_UNAVAILABLE`) instead of silently simulating. The enclave wire is live today — run `OBLIGOR_ENCLAVE_ADDR=127.0.0.1:5099 cargo run` in `enclave/obligor-enclave` and point `ENCLAVE_ENDPOINT` at it; Node then consumes the enclave's computed output. The Arcium MXE path still needs the `@arcium-hq/client` lifecycle. Leave the flag `false` only where labeled simulation is the intent (demos, CI); the run's trust model is always whatever actually executed.

Enabling demo gates in production boots with a config warning every request path abides
by them — the 402/x402 challenge is built from `X402_*` env terms and returns an honest
`503 PAYMENTS_NOT_CONFIGURED` for any chain with no destination wallet configured.

### Deploy

1. `npm ci && npm run build` (CI runs lint, typecheck, `npm test`, and the build on every push).
2. Single instance (Vercel/Fly/VM): set env vars, ensure `DATA_DIR` is on a persistent
   volume when `SESSION_STORE_MODE=file`.
3. Multi-instance: implement the `SessionStore` interface against Redis/Postgres; the
   in-memory rate limiter is per-instance in the meantime, so put a shared-edge limiter
   (or gateway) in front until then.
4. Rollback: deploy the previous build tag; sessions written in the newer schema are
   rejected on load and quarantined (`sessions.json.corrupt-*`) rather than crashing.

**Container deploy.** `Dockerfile` builds a production image: multi-stage
`deps → build → runner`, non-root user, a `/data` volume for the file session store
(`DATA_DIR=/data`), and a `HEALTHCHECK` that polls `GET /api/v1/health`. Secrets are
supplied at `docker run` time, never baked in — `.dockerignore` excludes `.env*`.
`.github/workflows/deploy.yml` builds the image, **boots it and asserts `/health` returns
`ok:true`**, then pushes to GHCR. Run locally:

```bash
docker build -t obligor .
docker run -p 3000:3000 -v obligor-data:/data \
  -e SOLANA_PAY_TO=<wallet> obligor
```

### Backup & restore (file session store)

With `SESSION_STORE_MODE=file`, all state is one atomically-written JSON file at
`$DATA_DIR/sessions.json` (default `.data/sessions.json`). Writes go to a temp file and
`rename()` into place, so a reader never sees a half-written store.

```bash
# Backup — a copy is always consistent (atomic rename means no torn writes)
cp "$DATA_DIR/sessions.json" "backup/sessions-$(date +%Y%m%dT%H%M%S).json"

# Restore — stop the instance, replace the file, start again
cp backup/sessions-20260101T000000.json "$DATA_DIR/sessions.json"

# Verify a restore before trusting it (tolerates TTL-expired and quarantined entries)
node -e 'const s=require("./.data/sessions.json");console.log(Object.keys(s).length, "sessions")'
```

On load the store **TTL-evicts** entries older than `SESSION_TTL_MS` and quarantines a
corrupt file (`sessions.json.corrupt-<ts>`) instead of crashing — so a restore from an
older or newer schema degrades gracefully. Back up the file on the same cadence as your
`SESSION_TTL_MS`; a restore that is older than the TTL simply yields fewer live rooms.
Idempotency records and rate-limit buckets are in-memory only and are **not** part of the
backup (see the multi-instance note above).

### Load & performance (measured, not aspirational)

`npm run verify:load` sweeps `POST /api/v1/net-margin` (paid path) and reports latency
percentiles, throughput, and the privacy invariant across every 200. Measured on a single
Node process (Apple silicon, local), one instance, live Pyth Hermes pricing per request:

| Concurrency | Requests | p50 | p95 | p99 | Throughput |
| --- | --- | --- | --- | --- | --- |
| 10 | 60 | 63 ms | 164 ms | 184 ms | ~123 req/s |
| 25 | 300 | 73 ms | 1043 ms | 1086 ms | ~67 req/s |

Honest read: latency is **oracle-bound**, not math-bound — the margin formula itself is
sub-millisecond; the bulk of p50 is the live Pyth fetch + venue pricing. Past ~10
concurrent in-flight requests on a single process the tail climbs to ~1 s and throughput
falls, because the event loop serializes oracle fetches. To scale: raise concurrency only
after adding a shared oracle price cache and swapping the in-memory rate limiter /
idempotency store for a shared one (Redis/Postgres), then run multiple instances.

### Operational guarantees in this build

- Health: `GET /api/v1/health` — config surface (demo gates, payment enablement per
  chain, store mode, session count, haircuts, oracle policy) for uptime checks.
- Logs: structured JSON (`ts, level, component, message, request_id, meta`), secrets
  redacted by key pattern (`lib/logger.ts`), request IDs surfaced in every error
  envelope + `X-Request-Id` response header.
- Rate limits: per-IP token buckets (`RATE_LIMIT_*`), separate tighter policies on
  compute and demo surfaces; hard 256KB request-body cap on all POST routes.
- Validation: every input surface is zod-validated (`lib/contracts.ts` shared schemas);
  desk-supplied marks are re-priced via live Pyth Hermes with deviation warnings, and
  fallback/stale marks are labeled `fallback`/`stale` by provenance — never silently
  presented as live.
- Honesty invariants preserved: no fabricated positions, no default payloads, no
  invented transaction hashes or attestation quotes; demo endpoints gated and
  rate-limited; adverse releases computed but never executed on-chain from the API.

### Known production limits (honest ceilings, not overclaims)

- **TEE execution is wired; hardware attestation is not.** `EnclaveBackend` now talks to
  the real Rust enclave over HTTP (`ENCLAVE_ENDPOINT`) and consumes its computed output,
  but the hosted runtime does not run inside a Nitro/Oyster VM, so no hardware quote is
  issued and `hardware_attested_tee` is never claimed — the run labels itself
  `simulated_plaintext_compute` with a note. `ArciumBackend` still executes the identical
  formula in sealed-execution simulation until the `@arcium-hq/client` MXE lifecycle is
  wired. Trust-model labels stay honest on every screen.
- **Per-protocol on-chain position decoding** (Kamino/Drift obligation parsing) is
  adapter-ready but not included; books enter via desk input, the deal-room flow, or
  the API, and get priced by live oracle marks.
- **x402 receipt verification is real but uses Obligor's own envelope.** Signed
  receipts are ed25519-verified (`node:crypto`) over the challenge terms with a
  one-time nonce, and fail closed. It is *not* the Coinbase x402 "exact" on-chain
  payload (a base64 partially-signed transaction requiring the `@x402` SDK); wiring
  that for byte-for-byte facilitator interop is the tracked follow-up.
- **Escrow settlement is real but the program transfers state, not tokens (yet).** The
  Anchor program locks SPL collateral on `initialize_escrow` and, on
  `settle_and_release_excess`, records the freed capital + proof hash and emits the
  `MarginSettledAndReleasedEvent` (auditable on-chain) — the proportional vault→desk
  CPI payout is the next program revision. The API never claims funds moved when they
  did not: iff `ESCROW_REAL_SETTLE=true` it returns the real program transaction
  signature, otherwise `transactionSignature:null`.
- The file session store is single-instance; `SESSION_STORE_MODE=sqlite` (node:sqlite,
  no external service) lets several app processes share one volume, but a true
  multi-machine deployment still needs the Postgres/Redis implementation of the same
  `SessionStore` interface. Rate limiting remains per-instance until then.

---

## Contributing & License
- Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for architectural invariants and code conventions.
- Licensed under [MIT](LICENSE) — © 2026 Kartik Vyas. Use it, fork it, ship it.
