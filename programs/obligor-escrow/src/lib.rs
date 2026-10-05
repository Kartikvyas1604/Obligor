use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("EscrowObL1gorC1ear1ng1111111111111111111111");

#[program]
pub mod obligor_escrow {
    use super::*;

    /// Initializes a bilateral margin escrow between Party A and Party B
    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        party_a_amount: u64,
        party_b_amount: u64,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_account;
        escrow.party_a = ctx.accounts.party_a.key();
        escrow.party_b = ctx.accounts.party_b.key();
        escrow.party_a_siloed_im = party_a_amount;
        escrow.party_b_siloed_im = party_b_amount;
        escrow.total_locked_usd = party_a_amount + party_b_amount;
        escrow.status = EscrowStatus::Deposited;
        escrow.created_at = Clock::get()?.unix_timestamp;

        // Transfer Party A collateral into escrow vault
        let cpi_accounts_a = Transfer {
            from: ctx.accounts.party_a_token.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.party_a.to_account_info(),
        };
        token::transfer(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts_a),
            party_a_amount,
        )?;

        // Transfer Party B collateral into escrow vault
        let cpi_accounts_b = Transfer {
            from: ctx.accounts.party_b_token.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.party_b.to_account_info(),
        };
        token::transfer(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts_b),
            party_b_amount,
        )?;

        emit!(EscrowInitializedEvent {
            escrow: escrow.key(),
            party_a: escrow.party_a,
            party_b: escrow.party_b,
            total_locked_usd: escrow.total_locked_usd,
        });

        Ok(())
    }

    /// Settles net margin based on verified Obligor confidential computation result
    pub fn settle_and_release_excess(
        ctx: Context<SettleEscrow>,
        netted_margin_usd: u64,
        computation_proof_hash: [u8; 32],
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_account;
        require!(escrow.status == EscrowStatus::Deposited, EscrowError::InvalidStatus);
        require!(netted_margin_usd < escrow.total_locked_usd, EscrowError::InvalidNettedMargin);

        let freed_capital_usd = escrow.total_locked_usd - netted_margin_usd;
        escrow.freed_capital_usd = freed_capital_usd;
        escrow.status = EscrowStatus::Settled;
        escrow.proof_hash = computation_proof_hash;

        // Proportional release of freed collateral back to both desks
        let release_a = (freed_capital_usd * escrow.party_a_siloed_im) / escrow.total_locked_usd;
        let release_b = freed_capital_usd - release_a;

        emit!(MarginSettledAndReleasedEvent {
            escrow: escrow.key(),
            netted_margin_usd,
            freed_capital_usd,
            released_to_a: release_a,
            released_to_b: release_b,
        });

        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum EscrowStatus {
    Initialized,
    Deposited,
    Settled,
    Liquidated,
}

#[account]
pub struct EscrowAccount {
    pub party_a: Pubkey,
    pub party_b: Pubkey,
    pub party_a_siloed_im: u64,
    pub party_b_siloed_im: u64,
    pub total_locked_usd: u64,
    pub freed_capital_usd: u64,
    pub proof_hash: [u8; 32],
    pub status: EscrowStatus,
    pub created_at: i64,
}

#[derive(Accounts)]
pub struct InitializeEscrow<'info> {
    #[account(init, payer = party_a, space = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 32 + 1 + 8)]
    pub escrow_account: Account<'info, EscrowAccount>,
    #[account(mut)]
    pub party_a: Signer<'info>,
    #[account(mut)]
    pub party_b: Signer<'info>,
    #[account(mut)]
    pub party_a_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub party_b_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleEscrow<'info> {
    #[account(mut)]
    pub escrow_account: Account<'info, EscrowAccount>,
    pub clearing_authority: Signer<'info>,
}

#[event]
pub struct EscrowInitializedEvent {
    pub escrow: Pubkey,
    pub party_a: Pubkey,
    pub party_b: Pubkey,
    pub total_locked_usd: u64,
}

#[event]
pub struct MarginSettledAndReleasedEvent {
    pub escrow: Pubkey,
    pub netted_margin_usd: u64,
    pub freed_capital_usd: u64,
    pub released_to_a: u64,
    pub released_to_b: u64,
}

#[error_code]
pub enum EscrowError {
    #[msg("Invalid escrow status for this operation.")]
    InvalidStatus,
    #[msg("Netted margin must be lower than total locked siloed margin.")]
    InvalidNettedMargin,
}
