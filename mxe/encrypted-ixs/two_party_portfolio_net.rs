//! Arcis Confidential Circuit: Two-Party Portfolio Netting
//! Computes portfolio margin for two mutually distrusting desks without revealing plaintext leg notionals.
//!
//! Inputs: Encrypted signed exposures and haircuts for Party A and Party B.
//! Output: Scaled siloed IM for Party A, siloed IM for Party B, and combined netted margin.

pub const MAX_LEGS: usize = 8;
pub const NUM_BUCKETS: usize = 6; // 0 = SOL, 1 = BTC, 2 = ETH, 3 = AAPL, 4 = MON, 5 = USD

#[derive(Clone, Copy, Default, Debug)]
pub struct EncryptedLeg {
    pub bucket_id: u8,
    pub signed_exposure_scaled: i64,
    pub haircut_bps: u16, // basis points: 1000 = 10%, 1500 = 15%, 2500 = 25%
}

/// Computes two-party portfolio margin deterministically without branching on secrets.
/// In Arcis / MPC circuits, conditional indexing and dynamic branching on secret variables
/// are evaluated via branchless multiplexing to prevent timing side channels.
pub fn two_party_portfolio_net_core(
    party_a_legs: [EncryptedLeg; MAX_LEGS],
    party_b_legs: [EncryptedLeg; MAX_LEGS],
) -> (u64, u64, u64) {
    // Step 1: Party A Siloed Initial Margin
    let mut siloed_a: i64 = 0;
    for leg in &party_a_legs {
        let notional = leg.signed_exposure_scaled.abs();
        let leg_im = (notional * leg.haircut_bps as i64) / 10_000;
        siloed_a += leg_im;
    }

    // Step 2: Party B Siloed Initial Margin
    let mut siloed_b: i64 = 0;
    for leg in &party_b_legs {
        let notional = leg.signed_exposure_scaled.abs();
        let leg_im = (notional * leg.haircut_bps as i64) / 10_000;
        siloed_b += leg_im;
    }

    // Step 3: Combined Netting via Branchless Bucket Multiplexing
    let mut bucket_exposures: [i64; NUM_BUCKETS] = [0; NUM_BUCKETS];
    let mut bucket_max_haircuts: [u16; NUM_BUCKETS] = [0; NUM_BUCKETS];

    // Accumulate Party A legs into buckets
    for leg in &party_a_legs {
        for b in 0..NUM_BUCKETS {
            let mask = if leg.bucket_id == (b as u8) { 1i64 } else { 0i64 };
            bucket_exposures[b] += mask * leg.signed_exposure_scaled;
            if mask == 1 && leg.haircut_bps > bucket_max_haircuts[b] {
                bucket_max_haircuts[b] = leg.haircut_bps;
            }
        }
    }

    // Accumulate Party B legs into buckets
    for leg in &party_b_legs {
        for b in 0..NUM_BUCKETS {
            let mask = if leg.bucket_id == (b as u8) { 1i64 } else { 0i64 };
            bucket_exposures[b] += mask * leg.signed_exposure_scaled;
            if mask == 1 && leg.haircut_bps > bucket_max_haircuts[b] {
                bucket_max_haircuts[b] = leg.haircut_bps;
            }
        }
    }

    // Step 4: Net Exposure IM calculation per bucket
    let mut netted_combined: i64 = 0;
    for b in 0..NUM_BUCKETS {
        let net_exposure_abs = bucket_exposures[b].abs();
        let bucket_im = (net_exposure_abs * bucket_max_haircuts[b] as i64) / 10_000;
        netted_combined += bucket_im;
    }

    (siloed_a as u64, siloed_b as u64, netted_combined as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_offsetting_portfolio_net() {
        let mut legs_a = [EncryptedLeg::default(); MAX_LEGS];
        let mut legs_b = [EncryptedLeg::default(); MAX_LEGS];

        // Desk A: Long 100k SOL with 10% haircut
        legs_a[0] = EncryptedLeg {
            bucket_id: 0,
            signed_exposure_scaled: 100_000_000_000,
            haircut_bps: 1000,
        };

        // Desk B: Short 100k SOL with 15% haircut
        legs_b[0] = EncryptedLeg {
            bucket_id: 0,
            signed_exposure_scaled: -100_000_000_000,
            haircut_bps: 1500,
        };

        let (siloed_a, siloed_b, netted) = two_party_portfolio_net_core(legs_a, legs_b);
        assert_eq!(siloed_a, 10_000_000_000);
        assert_eq!(siloed_b, 15_000_000_000);
        assert_eq!(netted, 0); // Perfect offset nets to zero
    }
}
