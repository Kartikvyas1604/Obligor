//! Obligor MXE — confidential two-party portfolio netting.
//!
//! This crate is the integer mirror of `lib/margin.ts` used inside the Arcium
//! MXE. [`circuit`] is the Arcis confidential instruction source: plain Rust
//! with fixed-point integer math (no floats, no secret-dependent branching) so
//! it can be unit-tested natively and lowered into an Arcis circuit by
//! `arcium build`.
//!
//! The `anchor` feature adds the Anchor program skeleton (accounts/state in
//! [`state`] and the `#[program]` entrypoint below). A production MXE
//! deployment runs `arcium init`, which replaces `#[program]` with
//! `#[arcium_program]` and wires the MXE queue/callback CPI instructions.

#[path = "../encrypted-ixs/two_party_portfolio_net.rs"]
pub mod circuit;

pub use circuit::{two_party_portfolio_net_core, EncryptedLeg, MAX_LEGS, NUM_BUCKETS};

/// Fixed-point USD scale (1e6) shared with `lib/margin.ts` and the Rust enclave.
pub const USD_SCALE: i64 = 1_000_000;

/// Bucket ids, mirrored from `lib/adapters/venues.ts` (`BUCKET_ORACLE_SYMBOL`).
pub const BUCKET_SOL: u8 = 0;
pub const BUCKET_BTC: u8 = 1;
pub const BUCKET_ETH: u8 = 2;
pub const BUCKET_AAPL: u8 = 3;
pub const BUCKET_MON: u8 = 4;
pub const BUCKET_USD: u8 = 5;

/// Program id reserved for the Obligor MXE deployment (`arcium init` target).
///
/// The previous placeholder (`Arc1umObL1gor…`) was not a valid base58 32-byte
/// key and could never deploy.
pub const MXE_PROGRAM_ID: &str = "7usv9BF5uuFaYuWv4fZfZHsUBKmhgsKqDjEbYXRUMFux";

#[cfg(feature = "anchor")]
pub mod state;

#[cfg(feature = "anchor")]
pub use state::*;

#[cfg(feature = "anchor")]
#[allow(unused_imports)]
use anchor_lang::prelude::*;

#[cfg(feature = "anchor")]
declare_id!("7usv9BF5uuFaYuWv4fZfZHsUBKmhgsKqDjEbYXRUMFux");

#[cfg(feature = "anchor")]
#[program]
pub mod obligor_mxe {
    use super::state::*;
    use super::*;
    use anchor_lang::prelude::*;

    pub fn initialize_clearing_session(
        ctx: Context<InitializeSession>,
        party_a: Pubkey,
        party_b: Pubkey,
    ) -> Result<()> {
        let session = &mut ctx.accounts.session;
        session.party_a = party_a;
        session.party_b = party_b;
        session.status = SessionStatus::Initialized;
        session.created_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn queue_confidential_net(
        ctx: Context<QueueComputation>,
        comp_def_offset: u32,
    ) -> Result<()> {
        let session = &mut ctx.accounts.session;
        require!(
            session.status == SessionStatus::Initialized,
            MxeError::InvalidState
        );
        session.status = SessionStatus::Computing;

        emit!(ComputationQueuedEvent {
            session_id: session.key(),
            party_a: session.party_a,
            party_b: session.party_b,
            comp_def_offset,
        });
        Ok(())
    }

    pub fn callback_confidential_result(
        ctx: Context<CallbackResult>,
        siloed_a_scaled: u64,
        siloed_b_scaled: u64,
        netted_combined_scaled: u64,
    ) -> Result<()> {
        let session = &mut ctx.accounts.session;
        require!(
            session.status == SessionStatus::Computing,
            MxeError::InvalidState
        );
        session.siloed_a_usd = siloed_a_scaled;
        session.siloed_b_usd = siloed_b_scaled;
        session.netted_combined_usd = netted_combined_scaled;
        session.status = SessionStatus::Completed;

        let siloed_combined = siloed_a_scaled.saturating_add(siloed_b_scaled);
        emit!(MarginResolvedEvent {
            session_id: session.key(),
            siloed_combined_usd: siloed_combined,
            netted_combined_usd: netted_combined_scaled,
            freed_capital_usd: siloed_combined.saturating_sub(netted_combined_scaled),
        });
        Ok(())
    }
}

#[cfg(test)]
mod golden_tests {
    use super::*;

    fn leg(bucket_id: u8, usd: i64, haircut_bps: u16) -> EncryptedLeg {
        EncryptedLeg {
            bucket_id,
            signed_exposure_scaled: usd * USD_SCALE,
            haircut_bps,
        }
    }

    #[test]
    fn same_bucket_offset_nets_to_zero() {
        let mut a = [EncryptedLeg::default(); MAX_LEGS];
        let mut b = [EncryptedLeg::default(); MAX_LEGS];
        a[0] = leg(BUCKET_SOL, 100, 1000); // long 100 USD @ 10%
        b[0] = leg(BUCKET_SOL, -100, 1500); // short 100 USD @ 15%
        let (siloed_a, siloed_b, netted) = two_party_portfolio_net_core(a, b);
        assert_eq!(siloed_a, (10 * USD_SCALE) as u64);
        assert_eq!(siloed_b, (15 * USD_SCALE) as u64);
        assert_eq!(netted, 0);
    }

    #[test]
    fn cross_bucket_does_not_offset_and_uses_max_haircut() {
        let mut a = [EncryptedLeg::default(); MAX_LEGS];
        let mut b = [EncryptedLeg::default(); MAX_LEGS];
        a[0] = leg(BUCKET_SOL, 100, 1000);
        b[0] = leg(BUCKET_BTC, -100, 1500);
        let (_, _, netted) = two_party_portfolio_net_core(a, b);
        assert_eq!(netted, (25 * USD_SCALE) as u64);
    }

    #[test]
    fn partial_offset_uses_max_haircut_of_bucket() {
        let mut a = [EncryptedLeg::default(); MAX_LEGS];
        let mut b = [EncryptedLeg::default(); MAX_LEGS];
        a[0] = leg(BUCKET_ETH, 150, 1000);
        b[0] = leg(BUCKET_ETH, -50, 1500);
        let (_, _, netted) = two_party_portfolio_net_core(a, b);
        // residual +100 @ max(1000,1500)bps = 15 USD
        assert_eq!(netted, (15 * USD_SCALE) as u64);
    }
}
