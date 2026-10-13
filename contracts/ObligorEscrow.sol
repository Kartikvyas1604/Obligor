// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ObligorEscrow
 * @notice Bilateral margin escrow and excess-capital release on Monad / EVM.
 *
 * Real custody, not a ledger:
 *  - the clearing authority opens a session, fixing each desk's siloed margin;
 *  - each desk deposits its own siloed margin as an ERC20 (stablecoin) transfer
 *    into this contract — the contract is the custodian;
 *  - once both desks are funded, the authority settles against a verified netting
 *    attestation, and the contract moves the *freed* excess back to each desk
 *    pro-rata to their siloed contribution while retaining the netted margin.
 *
 * The contract never trusts caller-supplied arithmetic: the release split is
 * derived from the amounts it actually holds. Settlement fails closed if the
 * freed amount is not positive.
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract ObligorEscrow {
    enum EscrowStatus {
        None,
        Created,
        Deposited,
        Settled,
        Liquidated
    }

    struct BilateralSession {
        address partyA;
        address partyB;
        uint256 partyASiloedUsd; // expected deposit, in token base units
        uint256 partyBSiloedUsd;
        uint256 totalLockedUsd; // partyASiloedUsd + partyBSiloedUsd
        uint256 partyAFunded; // actually deposited (0 until funded)
        uint256 partyBFunded;
        uint256 nettedMarginUsd; // retained after settlement
        uint256 freedCapitalUsd; // released to the desks
        bytes32 attestationProofHash;
        EscrowStatus status;
        uint256 createdAt;
    }

    IERC20 public immutable asset;
    address public immutable clearingAuthority;
    mapping(bytes32 => BilateralSession) public sessions;
    uint256 private _reentrancyStatus;

    event SessionCreated(
        bytes32 indexed sessionId,
        address indexed partyA,
        address indexed partyB,
        uint256 partyASiloed,
        uint256 partyBSiloed
    );
    event PartyDeposited(bytes32 indexed sessionId, address indexed party, uint256 amount);
    event MarginSettled(
        bytes32 indexed sessionId,
        uint256 nettedMargin,
        uint256 freedCapital,
        uint256 releasedToA,
        uint256 releasedToB
    );

    error Unauthorized();
    error NotAParty();
    error InvalidState();
    error SessionExists();
    error ZeroMargin();
    error AlreadyFunded();
    error NoCapitalFreed();
    error TransferFailed();
    error Reentrant();

    modifier onlyAuthority() {
        if (msg.sender != clearingAuthority) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (_reentrancyStatus == 2) revert Reentrant();
        _reentrancyStatus = 2;
        _;
        _reentrancyStatus = 1;
    }

    constructor(address asset_, address authority_) {
        require(asset_ != address(0), "Obligor: zero asset");
        require(authority_ != address(0), "Obligor: zero authority");
        asset = IERC20(asset_);
        clearingAuthority = authority_;
        _reentrancyStatus = 1;
    }

    /// @notice Open a bilateral clearing session and fix each desk's siloed margin.
    function createSession(
        bytes32 sessionId,
        address partyA,
        address partyB,
        uint256 partyASiloed,
        uint256 partyBSiloed
    ) external onlyAuthority {
        if (sessions[sessionId].status != EscrowStatus.None) revert SessionExists();
        require(partyA != address(0) && partyB != address(0), "Obligor: invalid counterparties");
        require(partyA != partyB, "Obligor: identical counterparties");
        require(partyASiloed > 0 && partyBSiloed > 0, "Obligor: zero margin");

        sessions[sessionId] = BilateralSession({
            partyA: partyA,
            partyB: partyB,
            partyASiloedUsd: partyASiloed,
            partyBSiloedUsd: partyBSiloed,
            totalLockedUsd: partyASiloed + partyBSiloed,
            partyAFunded: 0,
            partyBFunded: 0,
            nettedMarginUsd: 0,
            freedCapitalUsd: 0,
            attestationProofHash: bytes32(0),
            status: EscrowStatus.Created,
            createdAt: block.timestamp
        });

        emit SessionCreated(sessionId, partyA, partyB, partyASiloed, partyBSiloed);
    }

    /// @notice A desk funds its own siloed margin. Both desks must fund; then the
    /// session becomes Deposited and settlement can proceed.
    function deposit(bytes32 sessionId) external nonReentrant {
        BilateralSession storage session = sessions[sessionId];
        if (session.status != EscrowStatus.Created) revert InvalidState();

        uint256 amount;
        if (msg.sender == session.partyA) {
            if (session.partyAFunded != 0) revert AlreadyFunded();
            amount = session.partyASiloedUsd;
            session.partyAFunded = amount;
        } else if (msg.sender == session.partyB) {
            if (session.partyBFunded != 0) revert AlreadyFunded();
            amount = session.partyBSiloedUsd;
            session.partyBFunded = amount;
        } else {
            revert NotAParty();
        }
        if (amount == 0) revert ZeroMargin();

        _safeTransferFrom(msg.sender, address(this), amount);

        if (session.partyAFunded != 0 && session.partyBFunded != 0) {
            session.status = EscrowStatus.Deposited;
        }
        emit PartyDeposited(sessionId, msg.sender, amount);
    }

    /// @notice Release the freed excess to both desks pro-rata; retain the netted
    /// margin. Fails closed when nothing is freed.
    function settleNettedMargin(
        bytes32 sessionId,
        uint256 nettedMarginUsd,
        bytes32 attestationProofHash
    ) external onlyAuthority nonReentrant {
        BilateralSession storage session = sessions[sessionId];
        if (session.status != EscrowStatus.Deposited) revert InvalidState();
        if (nettedMarginUsd >= session.totalLockedUsd) revert NoCapitalFreed();

        uint256 freed = session.totalLockedUsd - nettedMarginUsd;
        session.nettedMarginUsd = nettedMarginUsd;
        session.freedCapitalUsd = freed;
        session.attestationProofHash = attestationProofHash;
        session.status = EscrowStatus.Settled;

        uint256 releaseA = (freed * session.partyASiloedUsd) / session.totalLockedUsd;
        uint256 releaseB = freed - releaseA;

        if (releaseA > 0) _safeTransfer(session.partyA, releaseA);
        if (releaseB > 0) _safeTransfer(session.partyB, releaseB);

        emit MarginSettled(sessionId, nettedMarginUsd, freed, releaseA, releaseB);
    }

    /// @notice Current lifecycle status of a session.
    function statusOf(bytes32 sessionId) external view returns (EscrowStatus) {
        return sessions[sessionId].status;
    }

    /// @notice Net margin currently held for a session (custody accounting).
    function heldMargin(bytes32 sessionId) external view returns (uint256) {
        BilateralSession storage session = sessions[sessionId];
        if (session.status == EscrowStatus.Deposited) return session.totalLockedUsd;
        if (session.status == EscrowStatus.Settled || session.status == EscrowStatus.Liquidated) {
            return session.nettedMarginUsd;
        }
        return 0;
    }

    function _safeTransfer(address to, uint256 amount) private {
        _callOptionalReturn(
            address(asset),
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
    }

    function _safeTransferFrom(address from, address to, uint256 amount) private {
        _callOptionalReturn(
            address(asset),
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount)
        );
    }

    /// @dev Tolerates non-standard ERC20s that return no data; rejects `false`.
    function _callOptionalReturn(address token, bytes memory data) private {
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok) revert TransferFailed();
        if (ret.length != 0 && !abi.decode(ret, (bool))) revert TransferFailed();
        if (token.code.length == 0) revert TransferFailed();
    }
}
