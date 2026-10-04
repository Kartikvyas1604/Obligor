import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    name: "obligor-clearing-engine",
    version: "0.1.0",
    twoParty: true,
    mode: "confidential_clearing",
    chains: {
      solana: {
        cluster: "devnet",
        backend: "arcium",
        trustModel: "cryptographic_mpc",
        x402: true,
        assetMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
        network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      },
      monad: {
        cluster: "testnet",
        backend: "enclave",
        trustModel: "hardware_attested_tee",
        x402: true,
        parallelPairs: true,
        network: "eip155:10143",
      },
    },
    formula: "two_party_netted_bucket_haircut",
    disclaimer:
      "Obligor is confidential two-party margin analytics. Not a custody protocol, not an exchange.",
  });
}
