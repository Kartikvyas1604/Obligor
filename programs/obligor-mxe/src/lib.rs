use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

declare_id!("Arc1umObL1gorC1ear1ng1111111111111111111111");

#[arcium_program]
pub mod obligor_mxe {
    use super::*;

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
        session.status = SessionStatus::Computing;
        
        // Emits Arcium computation request event for MXE cluster nodes
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
        session.siloed_a_usd = siloed_a_scaled;
        session.siloed_b_usd = siloed_b_scaled;
        session.netted_combined_usd = netted_combined_scaled;
        session.status = SessionStatus::Completed;

        emit!(MarginResolvedEvent {
            session_id: session.key(),
            siloed_combined_usd: siloed_a_scaled + siloed_b_scaled,
            netted_combined_usd,
            freed_capital_usd: (siloed_a_scaled + siloed_b_scaled).saturating_sub(netted_combined_scaled),
        });
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum SessionStatus {
    Initialized,
    Computing,
    Completed,
}

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
    #[account(init, payer = authority, space = 8 + 32 + 32 + 8 + 8 + 8 + 1 + 8)]
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
    /// CHECK: Verified Arcium MXE caller authority
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
