//! Arcis Confidential Circuit: Two-Party Portfolio Netting
//! Computes portfolio margin for two mutually distrusting desks without revealing plaintext leg notionals.
//!
//! Inputs: Encrypted signed exposures and haircuts for Party A and Party B.
//! Output: Scaled siloed IM for Party A, siloed IM for Party B, and combined netted margin.

use arcis_circuit_sdk::prelude::*;

const MAX_LEGS: usize = 8;
const FIXED_SCALE: i64 = 1_000_000; // 1e6 USD precision

#[derive(Clone, Copy)]
pub struct EncryptedLeg {
    pub bucket_id: u8,
    pub signed_exposure_scaled: i64,
    pub haircut_bps: u16, // basis points, e.g., 1000 = 10%, 1500 = 15%
}

#[encrypted_instruction]
pub fn two_party_portfolio_net(
    party_a_legs: [Enc<Shared, EncryptedLeg>; MAX_LEGS],
    party_b_legs: [Enc<Shared, EncryptedLeg>; MAX_LEGS],
) -> Enc<Shared, (u64, u64, u64)> {
    // Step 1: Compute Party A Siloed Initial Margin
    let mut siloed_a: i64 = 0;
    for i in 0..MAX_LEGS {
        let leg = party_a_legs[i];
        let notional = leg.signed_exposure_scaled.abs();
        let leg_im = (notional * leg.haircut_bps as i64) / 10_000;
        siloed_a += leg_im;
    }

    // Step 2: Compute Party B Siloed Initial Margin
    let mut siloed_b: i64 = 0;
    for i in 0..MAX_LEGS {
        let leg = party_b_legs[i];
        let notional = leg.signed_exposure_scaled.abs();
        let leg_im = (notional * leg.haircut_bps as i64) / 10_000;
        siloed_b += leg_im;
    }

    // Step 3: Compute Cross-Party Combined Netted Margin by Bucket
    // Buckets: 0 = SOL, 1 = BTC, 2 = ETH, 3 = AAPL, 4 = MON, 5 = USD
    let mut bucket_exposures: [i64; 6] = [0; 6];
    let mut bucket_max_haircuts: [u16; 6] = [0; 6];

    for i in 0..MAX_LEGS {
        let leg_a = party_a_legs[i];
        if (leg_a.bucket_id as usize) < 6 {
            let idx = leg_a.bucket_id as usize;
            bucket_exposures[idx] += leg_a.signed_exposure_scaled;
            if leg_a.haircut_bps > bucket_max_haircuts[idx] {
                bucket_max_haircuts[idx] = leg_a.haircut_bps;
            }
        }

        let leg_b = party_b_legs[i];
        if (leg_b.bucket_id as usize) < 6 {
            let idx = leg_b.bucket_id as usize;
            bucket_exposures[idx] += leg_b.signed_exposure_scaled;
            if leg_b.haircut_bps > bucket_max_haircuts[idx] {
                bucket_max_haircuts[idx] = leg_b.haircut_bps;
            }
        }
    }

    let mut netted_combined: i64 = 0;
    for b in 0..6 {
        let net_exposure_abs = bucket_exposures[b].abs();
        let bucket_im = (net_exposure_abs * bucket_max_haircuts[b] as i64) / 10_000;
        netted_combined += bucket_im;
    }

    // Return aggregate scalars only (1e6 USD precision)
    (siloed_a as u64, siloed_b as u64, netted_combined as u64)
}
