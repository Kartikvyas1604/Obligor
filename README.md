<div align="center">

# <img src="public/logo-lockup.svg" alt="Obligor logo — confidential two-party portfolio clearing" width="280" />

### Confidential Two-Party Portfolio Clearing & Bilateral Risk Infrastructure

*Bilateral cross-venue portfolio netting for institutional trading desks and autonomous financial agents.*  
*Neither party, nor the clearing operator, ever sees the counterparty's book.*

[![License: MIT](https://img.shields.io/badge/License-MIT-E5B84B.svg)](LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16.4.0-0A0B0D.svg)](https://nextjs.org/)
[![Solana](https://img.shields.io/badge/Solana-Bilateral_Escrow-9945FF.svg)](https://solana.com)
[![Monad](https://img.shields.io/badge/Monad-Parallel_Clearing-836EF9.svg)](https://monad.xyz)
[![x402 V2](https://img.shields.io/badge/x402-V2_Machine_Payments-22C55E.svg)](https://docs.x402.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x_Strict-3178C6.svg)](https://www.typescriptlang.org/)

</div>

---

## 1. Executive Summary

**Obligor** is a decentralized confidential portfolio clearing protocol engineered for quantitative trading desks, market makers, and autonomous AI trading agents.

In traditional finance, centralized clearing houses (CCPs) net offsetting positions across counterparties to eliminate excess collateral requirements. In decentralized finance, trading desks that maintain offsetting positions across different venues (e.g., Desk A long SOL lending collateral on Kamino; Desk B short SOL perpetual futures on Drift) must post **100% full, isolated initial margin** on both venues. Over \$46,000 in capital is locked up when the net directional risk across both counterparties is only \$15,000.

Existing alternatives fail:
* **Centralized Prime Brokers** create catastrophic counterparty and front-running liability: whoever operates the clearing node sees both books in plaintext, enabling copy-trading, front-running, and strategy extraction.
* **Single-Wallet Self-Netting** is trivial client-side math (a spreadsheet), not an institutional clearing product.

**Obligor solves bilateral multi-venue clearing under mutual distrust:**
1. Desk A and Desk B privately draft and seal multi-venue positions using cryptographically isolated capability tokens.
2. The portfolio netting engine runs inside a sealed confidential compute boundary.
3. The engine outputs a single verified scalar: the **Combined Netted Initial Margin**.
4. **Neither party ever sees the counterparty's legs, notionals, marks, or execution venues.**
5. Bilateral escrow releases excess capital on-chain upon cryptographic consensus.

---

## 2. Core Protocol Architecture

```
  Party A (Desk Alpha)                              Party B (Counterparty Desk)
[Kamino SOL lend + tAAPL Long]                         [Drift SOL-PERP Short]
          │                                                       │
          │ 32-byte capability token                              │ 32-byte capability token
          │ SHA-256 isolated session                              │ SHA-256 isolated session
          ▼                                                       ▼
   Position Book A                                         Position Book B
(Never revealed to B)                                   (Never revealed to A)
          │                                                       │
          └───────────────────────────┬───────────────────────────┘
                                      ▼
                        CONFIDENTIAL COMPUTATION BOUNDARY
                     (Sealed MPC / Hardware-Attested TEE)
                                      │
                                      ▼
                   Deterministic Bucket Aggregation Engine
                 • Net signed directional exposure per bucket
                 • Conservative max-haircut assignment
                 • Verifiable SHA-256 commitment digest
                                      │
                                      ▼
                           Aggregate Public Envelope
                    ┌───────────────────────────────────┐
                    │ Siloed Combined Margin : $46,500  │
                    │ Netted Combined Margin : $24,500  │
                    │ Capital Freed (Savings): $22,000  │
                    │ Zero per-leg plaintext exposed    │
                    └───────────────────────────────────┘
                                      │
                                      ▼
                         Bilateral Escrow Settlement
              (On-chain settlement event + excess capital release)
```

---

## 3. Mathematical Portfolio Netting Engine

The netting engine is completely deterministic, open-source, and implemented in [`lib/margin.ts`](lib/margin.ts).

### Isolated Initial Margin ($\text{IM}_{\text{siloed}}$)
For each independent trading desk $P \in \{A, B\}$ holding positions $i$:

$$\text{IM}_{\text{siloed}}(P) = \sum_{i \in P} h_i \cdot |\text{notional}_i|$$

$$\text{IM}_{\text{siloed, combined}} = \text{IM}_{\text{siloed}}(A) + \text{IM}_{\text{siloed}}(B)$$

Where $h_i$ represents the asset haircut and $|\text{notional}_i|$ is the absolute mark-to-market USD notional value.

### Cross-Party Netted Formula ($\text{IM}_{\text{netted}}$)
1. **Confidential Position Ingestion:** Ingest position legs inside the sealed computation boundary without persisting or leaking counterparty legs to the API or disk.
2. **Risk Factor Bucketing:** Group all positions by underlying risk factor bucket ($b \in \{\text{SOL}, \text{BTC}, \text{ETH}, \text{AAPL}, \text{MON}, \text{USD}\}$). A short perpetual contract on Drift and a lending supply position on Kamino both map to risk bucket `SOL`.
3. **Net Signed Exposure:** Sum directional exposure across counterparties within each risk bucket:
   $$E_b = \sum_{i \in b} \text{signedExposureUsd}_i$$
4. **Conservative Max-Haircut Selection:** To guarantee safety, assign the highest (most conservative) haircut among all instruments active in that bucket:
   $$\text{IM}_b = \max_{i \in b}(h_i) \cdot |E_b|$$
5. **Combined Portfolio Net Margin & Freed Capital:**
   $$\text{IM}_{\text{netted, combined}} = \sum_b \text{IM}_b$$
   $$\text{Savings} = \max(0, \text{IM}_{\text{siloed, combined}} - \text{IM}_{\text{netted, combined}})$$

### Default Haircut Schedule ($h_i$)
| Instrument Class | Default Haircut | Execution Venues / Source |
| :--- | :---: | :--- |
| **Spot & Lending Collateral** (SOL, USDC, MON) | **10%** | Kamino Finance, MarginFi, On-chain Spot |
| **Perpetual Futures** (SOL-PERP, BTC-PERP, ETH-PERP) | **15%** | Drift Protocol |
| **Tokenized Equity** (`tAAPL`) | **25%** | Pre-IPO & Tokenized Asset Feeds (Pyth Hermes) |

---

## 4. Worked Numerical Clearing Example

### Party A Portfolio (Desk Alpha)
* **Kamino SOL Lend:** \$90,000 long exposure ($h = 10\%$) $\rightarrow \mathbf{\$9,000}$ initial margin
* **Kamino USDC Deposit:** \$40,000 cash deposit ($h = 10\%$) $\rightarrow \mathbf{\$4,000}$ initial margin
* **Tokenized `tAAPL` Long:** \$55,000 equity long ($h = 25\%$) $\rightarrow \mathbf{\$13,750}$ initial margin
* **Party A Isolated Margin:** **\$26,750**

### Party B Portfolio (Counterparty Desk)
* **Drift SOL-PERP Short:** \$95,000 short perp ($h = 15\%$) $\rightarrow \mathbf{\$14,250}$ initial margin
* **Drift BTC-PERP Long:** \$30,000 long perp ($h = 15\%$) $\rightarrow \mathbf{\$4,500}$ initial margin
* **Kamino SOL Borrow:** \$10,000 borrow position ($h = 10\%$) $\rightarrow \mathbf{\$1,000}$ initial margin
* **Party B Isolated Margin:** **\$19,750**

### Bilateral Netting Computation
$$\text{Total Isolated Collateral Required} = \$26,750 + \$19,750 = \mathbf{\$46,500}$$

| Risk Bucket ($b$) | Net Exposure Calculation ($E_b$) | Net Exposure | Applied Haircut ($\max h$) | Bucket Margin ($\text{IM}_b$) |
| :--- | :--- | :---: | :---: | :---: |
| **SOL** | $+\$90,000 - \$95,000 - \$10,000$ | $-\$15,000$ | $15\%$ (Drift perp max) | **\$2,250** |
| **USD** | $+\$40,000$ | $+\$40,000$ | $10\%$ (Kamino deposit) | **\$4,000** |
| **AAPL** | $+\$55,000$ | $+\$55,000$ | $25\%$ (Tokenized equity) | **\$13,750** |
| **BTC** | $+\$30,000$ | $+\$30,000$ | $15\%$ (Drift perp) | **\$4,500** |
| **Total Combined Netted Margin** | | | | **\$24,500** |

$$\mathbf{\text{Capital Freed (Savings)}} = \$46,500 - \$24,500 = \mathbf{\$22,000} \quad (\mathbf{47.3\% \text{ Collateral Reduction}})$$

---

## 5. Product Surfaces & Workflows

Obligor provides 5 core enterprise product interfaces:

### 1. Bilateral Clearing Terminal (`/clear`)
The primary trading terminal for interactive bilateral position clearing:
* **Interactive Book Builder:** Input positions or load reference portfolios with real-time Pyth Hermes price feeds.
* **Dual Margin Hero:** Live visual comparison of isolated vs netted margin, delta percentages, and bucket breakdowns.
* **Verifiable Commitment Chip:** Instant verification against stored cryptographic hashes without data disclosure.
* **Settlement Trigger:** Direct interaction with bilateral collateral escrow vaults.

### 2. Bilateral Deal Rooms (`/deal` & `/deal/[sessionId]`)
Production-grade confidential clearing rooms for two independent trading counterparties:
* **Cryptographic Capability Tokens:** 32-byte tokens issued per desk; server stores only SHA-256 hashes.
* **Zero Counterparty Leakage:** Desk A's client receives `legs: []` and `legsWithheld: true` for Desk B's book until bilateral sealing.
* **Multi-Party Consent State Machine:** `drafting` $\rightarrow$ `sealed` $\rightarrow$ `cleared` $\rightarrow$ `settled`.

### 3. High-Throughput Parallel Engine (`/monad`)
Engineered for institutional market makers netting multiple counterparty desks simultaneously:
* **Concurrent Epoch Processing:** Process $\ge 3$ desk pairs in parallel per epoch block.
* **Real-Time Telemetry:** Epoch execution latencies, concurrency tracking, and aggregate capital efficiency metrics.

### 4. Autonomous Agent Commerce & x402 Rails (`/agents`)
Native HTTP 402 machine payment terminal for autonomous trading agents:
* **Programmatic Clearing Ingestion:** Machine-payable API requiring \$0.01 per clearing computation.
* **Cryptographic ed25519 Signed Receipts:** Fail-closed signature verification over structured challenge parameters.
* **Zero Position Leakage Invariant:** Agents receive only verified mathematical aggregates; legs are never exposed in response envelopes.

### 5. Security & Invariant Verification (`/security`)
Live automated architectural audit surface verifying protocol guarantees:
* Dynamic evaluation of fail-closed payment rails, capability token hashing, response payload sanitization, and credential hygiene.
* Copy-pasteable `curl` probe commands for external security auditor verification.

---

## 6. REST API Reference

All endpoints are available at `/api/v1/*` and mapped via rewrites to `/v1/*`.

### Health & Capabilities
```http
GET /api/v1/health
```
Returns system status, active chains, haircut configurations, oracle status, and payment configuration.

### Two-Party Net Margin Computation *(x402 Gated)*
```http
POST /api/v1/net-margin
Content-Type: application/json
x-payment-signature: <ed25519_signed_receipt>
```
**Request:**
```json
{
  "chain": "solana",
  "backend": "simulated",
  "partyA": {
    "wallet": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "legs": [
      {
        "instrument": "SOL",
        "bucket": "SOL",
        "venue": "kamino",
        "side": "lend",
        "qty": 500,
        "markUsd": 180,
        "haircut": 0.1
      }
    ]
  },
  "partyB": {
    "wallet": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    "legs": [
      {
        "instrument": "SOL-PERP",
        "bucket": "SOL",
        "venue": "drift",
        "side": "short",
        "qty": 500,
        "markUsd": 180,
        "haircut": 0.15
      }
    ]
  }
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "computationId": "comp_9a2f7c1e",
  "commitmentHash": "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
  "margin": {
    "siloedAUsd": 9000,
    "siloedBUsd": 13500,
    "siloedCombinedUsd": 22500,
    "nettedCombinedUsd": 0,
    "savingsUsd": 22500
  },
  "backend": "simulated",
  "trustModel": "simulated_plaintext_compute"
}
```

### Deterministic Re-Verification (J2)
```http
POST /api/v1/net-margin/verify
Content-Type: application/json
```
Allows Desk A or Desk B to submit its own legs and verify that the committed net margin and commitment hash match without seeing the counterparty's book.

### Bilateral Deal Room Management
* `POST /api/v1/sessions`: Create a new bilateral deal room and receive an exclusive 32-byte capability token.
* `GET /api/v1/sessions/:sessionId`: Retrieve room state (counterparty legs withheld without valid token).
* `POST /api/v1/sessions/:sessionId`: Execute actions (`join`, `update_legs`, `seal`, `clear`, `settle`).

---

## 7. Smart Contracts & Security

### Bilateral Escrow Program (`programs/obligor-escrow`)
* **Solana Program ID:** `94YmMnGjq2U8zpsLMSuk9fMwnfcHqrft3CtmwuZidMkZ`
* **Instructions:**
  * `initialize_escrow`: Desks deposit initial collateral into a program-derived vault account.
  * `settle_and_release_excess`: Authenticated settlement releasing excess collateral back to trading desks based on verified net margin computations.

### Security Invariants
1. **Zero Data Leakage:** API response envelopes and public deal-room endpoints strictly strip all position legs, notionals, and marks belonging to counterparties.
2. **Capability Token Isolation:** Capability tokens are 32-byte cryptographically secure random values; servers store only SHA-256 hashes and verify via `crypto.timingSafeEqual`.
3. **Fail-Closed Machine Payments:** Unpaid API requests strictly return `402 PAYMENT-REQUIRED` with replay-protected nonces.
4. **Denial of Service Protection:** In-memory token bucket rate limiting across compute, demo, and default routes; 256KB request body size enforcement.

---

## 8. Quickstart & Developer Guide

### Prerequisites
* **Node.js:** `v20.x` or `v22.x+`
* **npm:** `v10.x+`
* **Rust:** `v1.75+` (for enclave & Anchor programs)
* **Solana CLI:** `v1.18+` (optional, for local validator testing)

### Installation & Local Run
```bash
# 1. Clone repository
git clone https://github.com/Kartikvyas1604/Luthren.git obligor
cd obligor

# 2. Install dependencies
npm ci

# 3. Environment configuration
cp .env.example .env.local

# 4. Run development server
npm run dev
# Terminal accessible at http://localhost:3000
```

### Running Verification & Test Suites
```bash
# Run TypeScript static type check
npm run typecheck

# Run ESLint validation
npm run lint

# Run full test suite (Node test runner)
npm test

# Run security contract integration test
npm run verify:security
```

### Production Docker Deployment
```bash
# Build multi-stage optimized production image
docker build -t obligor-protocol:latest .

# Run container with persistent data volume
docker run -d \
  -p 3000:3000 \
  -v obligor_data:/data \
  --name obligor \
  obligor-protocol:latest

# Healthcheck verification
curl http://localhost:3000/api/v1/health
```

---

## 9. Repository Structure

```
.
├── app/                        # Next.js App Router
│   ├── page.tsx                # Institutional landing page
│   ├── clear/                  # Two-party clearing terminal
│   ├── deal/                   # Bilateral deal room workflows
│   ├── monad/                  # High-throughput parallel clearing engine
│   ├── agents/                 # Machine-payable agent commerce terminal
│   ├── security/               # Architectural self-audit & security probes
│   └── api/v1/                 # Production API route handlers
├── components/                 # Production UI components & design system
│   ├── book-column.tsx         # Position book display & risk metrics
│   ├── margin-hero.tsx         # Margin hero & bucket collapse visualizer
│   ├── netting-calculator.tsx  # Interactive portfolio risk calculator
│   ├── site-header.tsx         # Global navigation & chain switcher
│   └── site-footer.tsx         # System footer & protocol links
├── lib/                        # Core protocol libraries & business logic
│   ├── margin.ts               # Core mathematical netting formula
│   ├── confidential.ts         # Pluggable confidential backends (MPC/TEE/Sim)
│   ├── deal-session.ts         # Cryptographic capability tokens & deal rooms
│   ├── x402.ts                 # x402 machine payment verification
│   ├── escrow-onchain.ts       # Solana on-chain escrow interaction
│   └── oracle.ts               # Pyth Hermes live price feed integration
├── programs/                   # On-chain smart contracts
│   └── obligor-escrow/         # Anchor bilateral collateral escrow program
├── enclave/                    # Trusted Execution Environment (TEE)
│   └── obligor-enclave/        # Rust microservice for Nitro/Oyster enclaves
├── scripts/                    # Autonomous agent scripts & network probes
│   ├── demo-agent-a.ts         # Autonomous Agent A x402 client
│   ├── demo-agent-b.ts         # Autonomous Agent B x402 client
│   └── verify-security.ts      # Live API security invariant test
└── tests/                      # Comprehensive test suite
    ├── margin.test.ts          # Mathematical formula & bucket netting tests
    ├── session-auth.test.ts    # Capability token isolation & privacy tests
    ├── x402-verify.test.ts     # ed25519 payment verification tests
    └── rate-limit.test.ts      # Rate limiter & token bucket tests
```

---

## 10. License & Security

* **License:** Distributed under the [MIT License](LICENSE).
* **Security Policy:** Please review [SECURITY.md](SECURITY.md) for vulnerability disclosure procedures.
* **Disclaimer:** Obligor provides portfolio risk analytics and bilateral clearing computation. It does not operate as an exchange, broker, or custodian of venue funds.
