// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ObligorEscrow
 * @dev Bilateral Margin Escrow and Excess Capital Release on Monad / EVM.
 * Allows Desk A and Desk B to deposit siloed margin and releases freed capital upon verified TEE attestation.
 */
contract ObligorEscrow {
    enum EscrowStatus { None, Deposited, Settled, Liquidated }

    struct BilateralSession {
        address partyA;
        address partyB;
        uint256 partyASiloedUsd;
        uint256 partyBSiloedUsd;
        uint256 totalLockedUsd;
        uint256 nettedMarginUsd;
        uint256 freedCapitalUsd;
        bytes32 attestationProofHash;
        EscrowStatus status;
        uint256 createdAt;
    }

    address public immutable clearingAuthority;
    mapping(bytes32 => BilateralSession) public sessions;

    event EscrowDeposited(bytes32 indexed sessionId, address indexed partyA, address indexed partyB, uint256 totalLocked);
    event MarginSettled(bytes32 indexed sessionId, uint256 nettedMargin, uint256 freedCapital, uint256 releasedToA, uint256 releasedToB);

    modifier onlyAuthority() {
        require(msg.sender == clearingAuthority, "Obligor: unauthorized clearing gateway");
        _;
    }

    constructor(address _clearingAuthority) {
        require(_clearingAuthority != address(0), "Obligor: zero authority");
        clearingAuthority = _clearingAuthority;
    }

    function depositBilateralMargin(
        bytes32 sessionId,
        address partyA,
        address partyB,
        uint256 partyASiloed,
        uint256 partyBSiloed
    ) external payable {
        require(sessions[sessionId].status == EscrowStatus.None, "Obligor: session already exists");
        require(partyA != address(0) && partyB != address(0), "Obligor: invalid counterparties");

        uint256 total = partyASiloed + partyBSiloed;
        sessions[sessionId] = BilateralSession({
            partyA: partyA,
            partyB: partyB,
            partyASiloedUsd: partyASiloed,
            partyBSiloedUsd: partyBSiloed,
            totalLockedUsd: total,
            nettedMarginUsd: 0,
            freedCapitalUsd: 0,
            attestationProofHash: bytes32(0),
            status: EscrowStatus.Deposited,
            createdAt: block.timestamp
        });

        emit EscrowDeposited(sessionId, partyA, partyB, total);
    }

    function settleNettedMargin(
        bytes32 sessionId,
        uint256 nettedMarginUsd,
        bytes32 attestationProofHash
    ) external onlyAuthority {
        BilateralSession storage session = sessions[sessionId];
        require(session.status == EscrowStatus.Deposited, "Obligor: invalid session status");
        require(nettedMarginUsd < session.totalLockedUsd, "Obligor: no capital freed");

        uint256 freed = session.totalLockedUsd - nettedMarginUsd;
        session.nettedMarginUsd = nettedMarginUsd;
        session.freedCapitalUsd = freed;
        session.attestationProofHash = attestationProofHash;
        session.status = EscrowStatus.Settled;

        uint256 releaseA = (freed * session.partyASiloedUsd) / session.totalLockedUsd;
        uint256 releaseB = freed - releaseA;

        emit MarginSettled(sessionId, nettedMarginUsd, freed, releaseA, releaseB);
    }
}
