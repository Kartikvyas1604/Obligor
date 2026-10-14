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
            let (release_a, release_b, freed_capital_usd) =
                compute_release_split(total, siloed_a, netted_margin_usd)?;

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

/// Proportional release of freed collateral back to the two desks.
///
/// `freed = total - netted`; Party A receives `floor(freed * siloed_a / total)`
/// and Party B receives the remainder, so `release_a + release_b == freed`
/// exactly (no dust). Computed in u128 to avoid u64 overflow, then bounded back
/// to u64. Pure and side-effect free so it can be unit-tested without a
/// validator.
pub fn compute_release_split(
    total: u64,
    siloed_a: u64,
    netted: u64,
) -> Result<(u64, u64, u64)> {
    require!(total > 0, EscrowError::ZeroCollateral);
    require!(netted <= total, EscrowError::InvalidNettedMargin);
    require!(siloed_a <= total, EscrowError::MathOverflow);

    let freed = total - netted;
    let release_a_u128 = (freed as u128) * (siloed_a as u128) / (total as u128);
    let release_a = u64::try_from(release_a_u128).map_err(|_| EscrowError::MathOverflow)?;
    let release_b = freed
        .checked_sub(release_a)
        .ok_or(EscrowError::MathOverflow)?;
    Ok((release_a, release_b, freed))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn releases_everything_when_netted_is_zero() {
        let (a, b, freed) = compute_release_split(1_000, 600, 0).unwrap();
        assert_eq!(freed, 1_000);
        assert_eq!(a + b, freed);
        assert_eq!(a, 600);
        assert_eq!(b, 400);
    }

    #[test]
    fn releases_nothing_when_netted_equals_locked() {
        let (a, b, freed) = compute_release_split(1_000, 600, 1_000).unwrap();
        assert_eq!(freed, 0);
        assert_eq!(a, 0);
        assert_eq!(b, 0);
    }

    #[test]
    fn split_is_proportional_to_siloed_margin() {
        // 40% of the freed collateral goes to A (who posted 40%).
        let (a, b, freed) = compute_release_split(10_000, 4_000, 5_000).unwrap();
        assert_eq!(freed, 5_000);
        assert_eq!(a, 2_000);
        assert_eq!(b, 3_000);
    }

    #[test]
    fn floors_to_a_and_gives_remainder_to_b_no_dust() {
        // total=3, siloed_a=1, netted=0 → freed=3, a=floor(3*1/3)=1, b=2.
        let (a, b, freed) = compute_release_split(3, 1, 0).unwrap();
        assert_eq!((a, b, freed), (1, 2, 3));
        // Indivisible case: total=7, siloed_a=1, freed=7 → a=1, b=6.
        assert_eq!(compute_release_split(7, 1, 0).unwrap(), (1, 6, 7));
    }

    #[test]
    fn handles_max_u64_without_overflow() {
        let total = u64::MAX;
        let siloed_a = total / 2;
        let (a, b, freed) = compute_release_split(total, siloed_a, 0).unwrap();
        assert_eq!(freed, total);
        assert_eq!(a.checked_add(b).unwrap(), freed);
    }

    #[test]
    fn rejects_netted_greater_than_locked() {
        assert!(compute_release_split(1_000, 500, 1_001).is_err());
    }

    #[test]
    fn rejects_zero_total() {
        assert!(compute_release_split(0, 0, 0).is_err());
    }

    #[test]
    fn rejects_siloed_a_greater_than_total() {
        assert!(compute_release_split(100, 200, 0).is_err());
    }
}
