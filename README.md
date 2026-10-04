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
1. Union all position legs from Party A and Party B.
2. Group legs by **underlying risk factor bucket** ($b \in \{\text{SOL}, \text{BTC}, \text{ETH}, \text{AAPL}, \text{MON}, \text{USD}\}$).
3. Compute the **net signed exposure** across counterparties in each bucket:
   $$E_b = \sum_{i \in b} \text{signedExposureUsd}_i$$
4. Compute bucket margin under the **conservative max-haircut** in that bucket:
   $$\text{IM}_b = \max_{i \in b}(h_i) \cdot |E_b|$$
5. Compute total portfolio netted initial margin and capital freed:
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
- **SOL Bucket:** $+90,000 - 95,000 - 10,000 = -15,000$ net exposure. $\max(0.10, 0.15) = 15\% \times \$15,000 = \mathbf{\$2,250}$
- **USD Bucket:** $+40,000 \times 10\% = \mathbf{\$4,000}$
- **BTC Bucket:** $+30,000 \times 15\% = \mathbf{\$4,500}$
- **AAPL Bucket:** $+55,000 \times 25\% = \mathbf{\$13,750}$
- **Combined Netted Margin: $24,500**
- **Capital Freed:** $\mathbf{\$22,000}$ (**47.3% margin reduction**), with zero leakage of private book notionals.

---

## Pluggable Confidential Backends & Trust Models

Obligor implements a pluggable `ConfidentialBackend` interface. The mathematical engine is identical everywhere; what changes per network is the trust transport:

| Chain | Backend Implementation | Trust Model | Role |
| :--- | :--- | :--- | :--- |
| **Solana** (Primary) | `ArciumBackend` (Arcis MXE) | **Cryptographic MPC** — no single TEE operator, inputs encrypted with X25519 & RescueCipher | Primary Colosseum Build |
| **Monad** (Expansion) | `EnclaveBackend` (AWS Nitro / Marlin Oyster) | **Hardware-Attested TEE** — isolated hardware enclave with signed PCR0 measurement quote | Parallel Multi-Pair Clearing |
| **Local / Test** | `SimulatedBackend` | **In-Process Compute** — local execution labeled `SIMULATED` | Instant Client Exploration |

### The Honesty Rule: $\text{TEE} \neq \text{MPC}$
Both approaches deliver real confidentiality with distinct trust trade-offs. MPC distributes trust cryptographically across multi-party execution nodes without hardware assumptions. TEE relies on hardware security guarantees and cryptographic attestation quotes. Obligor labels every backend on screen and never conflates TEE with MPC.

---

## The Four Interactive Demo Surfaces

### 1. Two-Party Clearing Session (`/clear`)
- Real-time interactive session pairing Party A (Desk Alpha) and Party B.
- Live netting calculator with simultaneous slider and typed input.
- Toggleable mock equity attachment (`tAAPL`).
- Pluggable backend selector (`Arcium MPC`, `TEE Attested`, `Simulated Local`).
- Dual routing: Local execution or Live API Gateway (`/api/v1/net-margin`).
- Solana wallet connect integration via standard adapter.

### 2. Adversarial Counterfactual (`/adversarial`)
- The deliberate contrast screen. Requires explicit user confirmation: *"I understand this leaks both books"*.
- Reveals **both books in plaintext** with an explicit annotation of the attack vectors a centralized operator could exploit: front-running, copy-trading, and strategy extraction.
- Auto-returns user to the safe confidential session.

### 3. Monad Parallel Multi-Pair Clearing (`/monad`)
- Monad-native differentiator: Nets **$\ge 3$ desk pairs concurrently** in one epoch.
- Displays live epoch duration, concurrency counters, and signed Nitro TEE attestation measurements (PCR0).

### 4. Machine-Payable Agents (`/agents`)
- Live interactive agent terminals executing x402 V2 machine payments against the clearing gateway.
- Demonstrates initial `402 PAYMENT-REQUIRED` challenge, automated micropayment signing ($0.01 USDC), and retrieval of aggregate-only clearing responses.

---

## Honest Real vs. Mocked Matrix

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
Computes two-party confidential net margin. Unpaid calls receive `402 PAYMENT-REQUIRED`.

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
*Note: Response strictly omits all per-leg arrays for privacy preservation.*

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
├── enclave/
│   └── obligor-enclave/         # Rust AWS Nitro / Marlin Oyster TEE enclave
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
# Run mathematical margin engine test suite
npm run test:margin

# Verify x402 facilitator networks
npm run verify:x402

# Run autonomous agent payment scripts
npm run demo:agent-a
npm run demo:agent-b
npm run demo:agent-monad

# Production build and lint
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
