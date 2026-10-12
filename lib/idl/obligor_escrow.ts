/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/obligor_escrow.json`.
 */
export type ObligorEscrow = {
  "address": "94YmMnGjq2U8zpsLMSuk9fMwnfcHqrft3CtmwuZidMkZ",
  "metadata": {
    "name": "obligorEscrow",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Obligor bilateral margin escrow — locks desk collateral and releases excess on a verified netting result"
  },
  "instructions": [
    {
      "name": "initializeEscrow",
      "docs": [
        "Initializes a bilateral margin escrow between Party A and Party B.",
        "",
        "Collateral is moved into a vault **owned by the escrow PDA**, so only",
        "this program can ever sign funds out of it. The escrow account address",
        "is deterministic: `[b\"escrow\", party_a, party_b]`."
      ],
      "discriminator": [
        243,
        160,
        77,
        153,
        11,
        92,
        48,
        209
      ],
      "accounts": [
        {
          "name": "escrowAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "partyA"
              },
              {
                "kind": "account",
                "path": "partyB"
              }
            ]
          }
        },
        {
          "name": "partyA",
          "writable": true,
          "signer": true
        },
        {
          "name": "partyB",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "partyAToken",
          "writable": true
        },
        {
          "name": "partyBToken",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "escrowAccount"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "clearingAuthority",
          "type": "pubkey"
        },
        {
          "name": "partyAAmount",
          "type": "u64"
        },
        {
          "name": "partyBAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "settleAndReleaseExcess",
      "docs": [
        "Settles net margin from a verified Obligor confidential computation and",
        "releases the *excess* collateral back to both desks proportionally.",
        "",
        "Security invariants enforced by the account constraints:",
        "- only the escrow's `clearing_authority` may call this (`has_one`),",
        "- the escrow PDA address is re-derived from its stored parties,",
        "- the vault and both party token accounts are bound to the escrow's",
        "signer PDA and mint, so funds cannot be redirected."
      ],
      "discriminator": [
        87,
        255,
        87,
        208,
        7,
        134,
        185,
        9
      ],
      "accounts": [
        {
          "name": "escrowAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrowAccount.partyA",
                "account": "escrowAccount"
              },
              {
                "kind": "account",
                "path": "escrowAccount.partyB",
                "account": "escrowAccount"
              }
            ]
          }
        },
        {
          "name": "clearingAuthority",
          "signer": true,
          "relations": [
            "escrowAccount"
          ]
        },
        {
          "name": "mint",
          "relations": [
            "escrowAccount"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "escrowAccount"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "partyAToken",
          "writable": true
        },
        {
          "name": "partyBToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "nettedMarginUsd",
          "type": "u64"
        },
        {
          "name": "computationProofHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "escrowAccount",
      "discriminator": [
        36,
        69,
        48,
        18,
        128,
        225,
        125,
        135
      ]
    }
  ],
  "events": [
    {
      "name": "escrowInitializedEvent",
      "discriminator": [
        17,
        220,
        22,
        132,
        33,
        81,
        105,
        59
      ]
    },
    {
      "name": "marginSettledAndReleasedEvent",
      "discriminator": [
        168,
        113,
        227,
        55,
        19,
        177,
        190,
        174
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidStatus",
      "msg": "Invalid escrow status for this operation."
    },
    {
      "code": 6001,
      "name": "invalidNettedMargin",
      "msg": "Netted margin must not exceed total locked siloed margin."
    },
    {
      "code": 6002,
      "name": "zeroCollateral",
      "msg": "Escrow requires at least one non-zero collateral deposit."
    },
    {
      "code": 6003,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow while computing the release split."
    },
    {
      "code": 6004,
      "name": "invalidClearingAuthority",
      "msg": "Clearing authority must be a non-default pubkey."
    }
  ],
  "types": [
    {
      "name": "escrowAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "partyA",
            "type": "pubkey"
          },
          {
            "name": "partyB",
            "type": "pubkey"
          },
          {
            "name": "clearingAuthority",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "escrowBump",
            "type": "u8"
          },
          {
            "name": "partyASiloedIm",
            "type": "u64"
          },
          {
            "name": "partyBSiloedIm",
            "type": "u64"
          },
          {
            "name": "totalLockedUsd",
            "type": "u64"
          },
          {
            "name": "freedCapitalUsd",
            "type": "u64"
          },
          {
            "name": "proofHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "escrowStatus"
              }
            }
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "escrowInitializedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrow",
            "type": "pubkey"
          },
          {
            "name": "partyA",
            "type": "pubkey"
          },
          {
            "name": "partyB",
            "type": "pubkey"
          },
          {
            "name": "clearingAuthority",
            "type": "pubkey"
          },
          {
            "name": "totalLockedUsd",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "escrowStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "initialized"
          },
          {
            "name": "deposited"
          },
          {
            "name": "settled"
          },
          {
            "name": "liquidated"
          }
        ]
      }
    },
    {
      "name": "marginSettledAndReleasedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrow",
            "type": "pubkey"
          },
          {
            "name": "nettedMarginUsd",
            "type": "u64"
          },
          {
            "name": "freedCapitalUsd",
            "type": "u64"
          },
          {
            "name": "releasedToA",
            "type": "u64"
          },
          {
            "name": "releasedToB",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
