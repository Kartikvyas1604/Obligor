//! Anchor accounts, state machine, and events for the Obligor MXE skeleton.
//!
//! Used only with `--features anchor`. A production MXE deployment runs
//! `arcium init`, which converts the `#[program]` in `lib.rs` to
//! `#[arcium_program]` and fills in the MXE queue/callback CPI accounts.

use anchor_lang::prelude::*;

#[error_code]
pub enum MxeError {
    #[msg("session is not in the required state for this instruction")]
    InvalidState,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum SessionStatus {
    Initialized,
    Computing,
    Completed,
}

/// 8 (discriminator) + 32 + 32 + 8 + 8 + 8 + 1 + 8
pub const CLEARING_SESSION_SPACE: usize = 8 + 32 + 32 + 8 + 8 + 8 + 1 + 8;

#[account]
pub struct ClearingSessionAccount {
    pub party_a: Pubkey,
    pub party_b: Pubkey,
    pub siloed_a_usd: u64,
    pub siloed_b_usd: u64,
    pub netted_combined_usd: u64,
    pub status: SessionStatus,
    pub created_at: i64,
}

#[derive(Accounts)]
pub struct InitializeSession<'info> {
    #[account(init, payer = authority, space = CLEARING_SESSION_SPACE)]
    pub session: Account<'info, ClearingSessionAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct QueueComputation<'info> {
    #[account(mut)]
    pub session: Account<'info, ClearingSessionAccount>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CallbackResult<'info> {
    #[account(mut)]
    pub session: Account<'info, ClearingSessionAccount>,
    /// CHECK: verified Arcium MXE caller authority (`arcium init` supplies the
    /// real MXE authority PDA constraint; this skeleton trusts a signer).
    pub mxe_authority: Signer<'info>,
}

#[event]
pub struct ComputationQueuedEvent {
    pub session_id: Pubkey,
    pub party_a: Pubkey,
    pub party_b: Pubkey,
    pub comp_def_offset: u32,
}

#[event]
pub struct MarginResolvedEvent {
    pub session_id: Pubkey,
    pub siloed_combined_usd: u64,
    pub netted_combined_usd: u64,
    pub freed_capital_usd: u64,
}
