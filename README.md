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

| Chain | Backend Implementation | Trust Model | Role |
| :--- | :--- | :--- | :--- |
| **Solana** (Primary) | `ArciumBackend` (Arcis MXE) | **Cryptographic MPC** — no single TEE operator, inputs encrypted with X25519 & RescueCipher | Primary Colosseum Build |
| **Monad** (Expansion) | `EnclaveBackend` (AWS Nitro / Marlin Oyster) | **Hardware-Attested TEE** — isolated hardware enclave with signed PCR0 measurement quote | Parallel Multi-Pair Clearing |
| **Local / Test** | `SimulatedBackend` | **In-Process Compute** — local execution labeled `SIMULATED` | Instant Client Exploration |

### The Honesty Rule: $\text{TEE} \neq \text{MPC}$
Both approaches deliver real confidentiality with distinct trust trade-offs:
- **Cryptographic MPC (Arcium):** Distributes trust across multi-party execution nodes using threshold cryptography. No single entity, cloud provider, or hardware manufacturer can observe decrypted books.
- **Hardware-Attested TEE (AWS Nitro / Marlin Oyster):** Relies on isolated CPU secure enclaves and cryptographic PCR0 attestation quotes. Delivers high execution throughput suitable for Monad's parallel architecture.
- **Obligor's Rule:** Obligor labels every backend on screen and in API responses. We never conflate TEE with MPC.

---

## The Four Interactive Demo Surfaces
Explore all four surfaces directly in your browser:

### 1. Two-Party Clearing Session (`/clear`)
- **Interactive Portfolio Setup:** Pair Party A (Desk Alpha) and Party B (Counterparty Desk) via Solana wallet connect or pre-loaded fixtures.
- **Live Netting Calculator:** Real-time dual slider and typed numerical inputs showing instant siloed vs netted margins.
- **Mock Equity Injection:** Dynamically attach or detach tokenized equity positions (`tAAPL` Long/Short) to evaluate cross-asset clearing.
- **Pluggable Backend Toggle:** Switch seamlessly between `Arcium MPC` (Solana), `TEE Attested` (Monad), and `Simulated Local`.
- **Live API Routing:** Option to route clearing computations through the live Next.js API gateway (`/api/v1/net-margin`).

### 2. Adversarial Counterfactual (`/adversarial`)
- **The Contrast Screen:** Demonstrates why centralized single-operator clearing is broken.
- **Confirmation Gate:** Requires deliberate user acknowledgment: *"I understand this leaks both books"*.
- **Plaintext Threat Vector View:** Displays **both books side-by-side** with annotations detailing operator front-running, strategy extraction, and copy-trading vulnerabilities.
- **Auto-Return Timer:** Safely returns user to the confidential session after review.

### 3. Monad Parallel Multi-Pair Clearing (`/monad`)
- **Monad High-Throughput Differentiator:** Simultaneously nets **$\ge 3$ desk pairs** in one epoch.
- **Real-Time Concurrency Telemetry:** Live epoch execution timer, concurrency counter, and per-pair capital savings cards.
- **Hardware Attestation Inspector:** Real-time PCR0 measurement and SHA256 enclave quote verification.

### 4. Machine-Payable Agents (`/agents`)
- **x402 V2 Terminal Runners:** Autonomous agents querying the gated clearing API.
- **HTTP 402 Protocol Flow:** Demonstrates `402 PAYMENT-REQUIRED` challenge handling, automated $0.01 USDC payment signing, and instant `200 OK` aggregate margin response.
- **Privacy Audit Inspector:** Expandable raw JSON viewer proving zero individual leg leakage.

---

## Honest Real vs. Mocked Matrix
Obligor explicitly labels what is real code, what is fixture, and what is out of MVP scope:

| Component | Status | Description |
| :--- | :--- | :--- |
| **Two-Party Netting Formula** | **Real** | Pure TypeScript source of truth (`lib/margin.ts`), replicated in Arcis circuit and Rust enclave |
| **Position Books (Solana Demo)** | **Partial** | Party A Kamino SOL lend marked live read-only; other legs labeled fixture |
| **Mock Equity `tAAPL`** | **Mock** | Config-driven fixture price; adapter-ready for xStocks/Backed (Solana RO); never custody |
| **Arcium MPC Circuit** | **Real Code** | Full Arcis circuit in `programs/obligor-mxe/encrypted-ixs/` & Anchor program in `src/lib.rs` |
| **Monad TEE Enclave** | **Real Code** | Full Rust enclave code in `enclave/obligor-enclave/` with SHA256 PCR0 quote generator |
| **Parallel Multi-Pair Clearing** | **Real** | Concurrent multi-pair netting endpoint (`/api/v1/net-margin/parallel`) |
| **x402 V2 Machine Payments** | **Real** | Standards-compliant x402 HTTP challenge, payment verification, and automated client scripts |
| **Capital Movement / Liquidation** | **Not Built** | Margin analytics only; Obligor does not custody or withdraw venue funds |

---

## API Reference

Base URL: `http://localhost:3000` (or `http://localhost:4021`)

### `GET /api/v1/health`
Health check and backend capability discovery.
```json
{
  "ok": true,
  "name": "obligor-clearing-engine",
  "version": "0.1.0",
  "twoParty": true,
  "chains": {
    "solana": { "cluster": "devnet", "backend": "arcium", "x402": true },
    "monad": { "cluster": "testnet", "backend": "enclave", "parallelPairs": true }
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
    "trustModel": "cryptographic_mpc",
    "computationId": "arc_mxe_m2k19_8fa21"
  },
  "disclaimer": "Two-party confidential clearing demo. Other party's legs omitted by design."
}
```

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
│   ├── fixtures.ts              # Golden judge & multi-pair fixtures
│   ├── margin.ts                # Pure mathematical netting engine
│   └── positions.ts             # Position leg constructors & mock equity
├── programs/
│   └── obligor-mxe/             # Arcium MXE confidential Arcis circuit & Anchor program
│       ├── encrypted-ixs/       # Arcis two_party_portfolio_net confidential circuit
│       └── src/lib.rs           # Anchor clearing session queue & callback handlers
├── enclave/
│   └── obligor-enclave/         # Rust AWS Nitro / Marlin Oyster TEE enclave
│       ├── Cargo.toml           # Enclave dependencies (sha2, hex, serde)
│       └── src/main.rs          # Fixed-point two-party netting & PCR0 attestation generator
├── scripts/
│   ├── demo-agent-a.ts          # Party A x402 client script
│   ├── demo-agent-b.ts          # Party B x402 client script
│   ├── demo-agent-monad.ts      # Monad parallel epoch client script
│   ├── test-margin.ts           # Mathematical engine test suite
│   └── verify-x402-networks.ts  # x402 facilitator probe
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
# 1. Run mathematical margin engine test suite (pure TS unit tests)
npm run test:margin

# 2. Verify x402 facilitator networks on Solana devnet and Monad testnet
npm run verify:x402

# 3. Run autonomous Party A x402 payment client agent
npm run demo:agent-a

# 4. Run autonomous Party B independent payment client agent
npm run demo:agent-b

# 5. Run autonomous Monad parallel multi-pair epoch clearing agent
npm run demo:agent-monad

# 6. Run production build & ESLint validation
npm run build
npm run lint
```

---

## Scope & Non-Goals

Obligor is **confidential clearing compute and margin analytics**.
- It is **NOT** a custody protocol, lending venue, or perp DEX.
- It does **NOT** execute fund transfers or venue liquidations.
- The $\$0.01$ per-call fee is a developer wedge for agent payments, not venture math.
- Production deployment will additionally require legal netting master agreements, venue-specific margin models, default fund capitalization, and hardened attestation verification.

---

## License

[MIT](LICENSE) — © 2026 Kartik Vyas.
