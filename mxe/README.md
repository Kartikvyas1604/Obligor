# obligor-mxe — Arcis confidential circuit + Anchor skeleton

This crate is the **integer mirror** of `lib/margin.ts` used inside the Arcium
MXE. It is deliberately *not* a member of the root cargo workspace and lives
outside `programs/` so `anchor build` never picks it up.

## What is real here

- `encrypted-ixs/two_party_portfolio_net.rs` is the **Arcis circuit source**:
  fixed-point integer math (1e6 USD scale), per-party siloed IM, and combined
  netting by risk bucket using the **max haircut** of each bucket. No floats, no
  secret-dependent branching (bucket selection is branchless masking), so it is
  timing-safe under MPC.
- `src/lib.rs` re-exports the circuit (`two_party_portfolio_net_core`) and pins
  the bucket ids + USD scale shared with TypeScript and the Rust enclave.
- `cargo test` runs the circuit against golden fixtures that match
  `tests/margin.test.ts`.
- `src/program.rs` (behind `--features anchor`) is a real Anchor program: the
  `ClearingSessionAccount` state machine, `initialize` → `queue` → `callback`
  instructions with state guards, and `ComputationQueued` / `MarginResolved`
  events.

## What is NOT yet wired (honest boundary)

A live on-chain MXE requires the **Arcium toolchain** (`arcium` CLI + a running
MXE cluster). `arcium init` generates the `#[arcium_program]` entrypoint and the
MXE queue/callback CPI plumbing (encrypted-input accounts, computation
definition offsets, MXE authority PDA). That toolchain is **not available in
this build environment**, so:

```
cargo build --manifest-path mxe/Cargo.toml              # builds (zero deps)
cargo test  --manifest-path mxe/Cargo.toml              # circuit golden tests
cargo build --manifest-path mxe/Cargo.toml --features anchor   # Anchor skeleton
```

The runtime `ArciumBackend` in `lib/confidential.ts` therefore reports
`trustModel: "simulated_plaintext_compute"` unless a real MXE transport is
configured, and never claims cryptographic MPC. See `docs/AGENT.md` §7 and
`docs/PRODUCTION_AUDIT.md`.

## Program id

`MXE_PROGRAM_ID = 7usv9BF5uuFaYuWv4fZfZHsUBKmhgsKqDjEbYXRUMFux` (a valid
base58 32-byte key; the previous placeholder was un-deployable).
