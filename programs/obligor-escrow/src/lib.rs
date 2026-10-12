use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("94YmMnGjq2U8zpsLMSuk9fMwnfcHqrft3CtmwuZidMkZ");

#[program]
pub mod obligor_escrow {
    use super::*;

    /// Initializes a bilateral margin escrow between Party A and Party B.
    ///
    /// Collateral is moved into a vault **owned by the escrow PDA**, so only
    /// this program can ever sign funds out of it. The escrow account address
    /// is deterministic: `[b"escrow", party_a, party_b]`.
    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        clearing_authority: Pubkey,
        party_a_amount: u64,
        party_b_amount: u64,
    ) -> Result<()> {
        require!(
            party_a_amount > 0 || party_b_amount > 0,
            EscrowError::ZeroCollateral
        );
        require!(
            clearing_authority != Pubkey::default(),
            EscrowError::InvalidClearingAuthority
        );

        let escrow = &mut ctx.accounts.escrow_account;
        escrow.party_a = ctx.accounts.party_a.key();
        escrow.party_b = ctx.accounts.party_b.key();
        escrow.clearing_authority = clearing_authority;
        escrow.mint = ctx.accounts.mint.key();
        escrow.vault = ctx.accounts.vault.key();
        escrow.escrow_bump = ctx.bumps.escrow_account;
        escrow.party_a_siloed_im = party_a_amount;
        escrow.party_b_siloed_im = party_b_amount;
        escrow.total_locked_usd = party_a_amount
            .checked_add(party_b_amount)
            .ok_or(EscrowError::MathOverflow)?;
        escrow.freed_capital_usd = 0;
        escrow.proof_hash = [0u8; 32];
        escrow.status = EscrowStatus::Deposited;
        escrow.created_at = Clock::get()?.unix_timestamp;

        // Party A collateral → vault (Party A signs).
        if party_a_amount > 0 {
            let cpi_accounts = Transfer {
                from: ctx.accounts.party_a_token.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.party_a.to_account_info(),
            };
            token::transfer(
                CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
                party_a_amount,
            )?;
        }

        // Party B collateral → vault (Party B signs).
        if party_b_amount > 0 {
            let cpi_accounts = Transfer {
                from: ctx.accounts.party_b_token.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.party_b.to_account_info(),
            };
            token::transfer(
                CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
                party_b_amount,
            )?;
        }

        emit!(EscrowInitializedEvent {
            escrow: escrow.key(),
            party_a: escrow.party_a,
            party_b: escrow.party_b,
            clearing_authority: escrow.clearing_authority,
            total_locked_usd: escrow.total_locked_usd,
        });

        Ok(())
    }

    /// Settles net margin from a verified Obligor confidential computation and
    /// releases the *excess* collateral back to both desks proportionally.
    ///
    /// Security invariants enforced by the account constraints:
    /// - only the escrow's `clearing_authority` may call this (`has_one`),
    /// - the escrow PDA address is re-derived from its stored parties,
    /// - the vault and both party token accounts are bound to the escrow's
    ///   signer PDA and mint, so funds cannot be redirected.
    pub fn settle_and_release_excess(
        ctx: Context<SettleEscrow>,
        netted_margin_usd: u64,
        computation_proof_hash: [u8; 32],
    ) -> Result<()> {
        let (party_a_key, party_b_key, bump, release_a, release_b, freed_capital_usd, escrow_key) = {
            let escrow = &mut ctx.accounts.escrow_account;
            require!(
                escrow.status == EscrowStatus::Deposited,
                EscrowError::InvalidStatus
            );
            require!(escrow.total_locked_usd > 0, EscrowError::ZeroCollateral);
            require!(
                netted_margin_usd <= escrow.total_locked_usd,
                EscrowError::InvalidNettedMargin
            );

            let total = escrow.total_locked_usd;
            let siloed_a = escrow.party_a_siloed_im;
            let freed_capital_usd = total - netted_margin_usd;

            // Proportional release in u128 to avoid u64 overflow, then bounded back.
            let release_a_u128 =
                (freed_capital_usd as u128) * (siloed_a as u128) / (total as u128);
            let release_a =
                u64::try_from(release_a_u128).map_err(|_| EscrowError::MathOverflow)?;
            let release_b = freed_capital_usd
                .checked_sub(release_a)
                .ok_or(EscrowError::MathOverflow)?;

            escrow.freed_capital_usd = freed_capital_usd;
            escrow.status = EscrowStatus::Settled;
            escrow.proof_hash = computation_proof_hash;

            (
                escrow.party_a,
                escrow.party_b,
                escrow.escrow_bump,
                release_a,
                release_b,
                freed_capital_usd,
                escrow.key(),
            )
        };

        // Escrow PDA signs the vault payout.
        let seeds: &[&[u8]] = &[
            b"escrow",
            party_a_key.as_ref(),
            party_b_key.as_ref(),
            &[bump],
        ];
        let signer_seeds: &[&[&[u8]]] = &[seeds];

        if release_a > 0 {
            let cpi_accounts = Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.party_a_token.to_account_info(),
                authority: ctx.accounts.escrow_account.to_account_info(),
            };
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    cpi_accounts,
                    signer_seeds,
                ),
                release_a,
            )?;
        }

        if release_b > 0 {
            let cpi_accounts = Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.party_b_token.to_account_info(),
                authority: ctx.accounts.escrow_account.to_account_info(),
            };
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    cpi_accounts,
                    signer_seeds,
                ),
                release_b,
            )?;
        }

        emit!(MarginSettledAndReleasedEvent {
            escrow: escrow_key,
            netted_margin_usd,
            freed_capital_usd,
            released_to_a: release_a,
            released_to_b: release_b,
        });

        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
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
    pub clearing_authority: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub escrow_bump: u8,
    pub party_a_siloed_im: u64,
    pub party_b_siloed_im: u64,
    pub total_locked_usd: u64,
    pub freed_capital_usd: u64,
    pub proof_hash: [u8; 32],
    pub status: EscrowStatus,
    pub created_at: i64,
}

// 8 (discriminator) + 32*5 + 1 + 8*4 + 32 + 1 + 8 = 242
pub const ESCROW_ACCOUNT_SPACE: usize = 242;

#[derive(Accounts)]
pub struct InitializeEscrow<'info> {
    #[account(
        init,
        payer = party_a,
        space = ESCROW_ACCOUNT_SPACE,
        seeds = [b"escrow", party_a.key().as_ref(), party_b.key().as_ref()],
        bump,
    )]
    pub escrow_account: Box<Account<'info, EscrowAccount>>,
    #[account(mut)]
    pub party_a: Signer<'info>,
    #[account(mut)]
    pub party_b: Signer<'info>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = mint, token::authority = party_a)]
    pub party_a_token: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = party_b)]
    pub party_b_token: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = party_a,
        associated_token::mint = mint,
        associated_token::authority = escrow_account,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleEscrow<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow_account.party_a.as_ref(), escrow_account.party_b.as_ref()],
        bump = escrow_account.escrow_bump,
        has_one = clearing_authority,
        has_one = mint,
    )]
    pub escrow_account: Box<Account<'info, EscrowAccount>>,
    pub clearing_authority: Signer<'info>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow_account,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = escrow_account.party_a)]
    pub party_a_token: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = escrow_account.party_b)]
    pub party_b_token: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[event]
pub struct EscrowInitializedEvent {
    pub escrow: Pubkey,
    pub party_a: Pubkey,
    pub party_b: Pubkey,
    pub clearing_authority: Pubkey,
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
    #[msg("Netted margin must not exceed total locked siloed margin.")]
    InvalidNettedMargin,
    #[msg("Escrow requires at least one non-zero collateral deposit.")]
    ZeroCollateral,
    #[msg("Arithmetic overflow while computing the release split.")]
    MathOverflow,
    #[msg("Clearing authority must be a non-default pubkey.")]
    InvalidClearingAuthority,
}
