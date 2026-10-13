// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ObligorEscrow } from "../ObligorEscrow.sol";
import { MockERC20 } from "./MockERC20.sol";

/// @dev Minimal cheatcode surface (no forge-std dependency).
interface Vm {
    function prank(address) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
}

contract ObligorEscrowTest {
    Vm internal constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockERC20 internal token;
    ObligorEscrow internal escrow;

    address internal constant AUTHORITY = address(0xA11CE);
    address internal constant DESK_A = address(0xAAA1);
    address internal constant DESK_B = address(0xBBB2);
    address internal constant STRANGER = address(0xDEAD);
    bytes32 internal constant SID = keccak256("session-1");

    uint256 internal constant A_AMT = 100_000e6;
    uint256 internal constant B_AMT = 200_000e6;

    function setUp() public {
        token = new MockERC20();
        escrow = new ObligorEscrow(address(token), AUTHORITY);
    }

    function _openSession() internal {
        vm.prank(AUTHORITY);
        escrow.createSession(SID, DESK_A, DESK_B, A_AMT, B_AMT);
    }

    function _fund(address desk, uint256 amount) internal {
        token.mint(desk, amount);
        vm.prank(desk);
        token.approve(address(escrow), amount);
    }

    function _depositBoth() internal {
        _fund(DESK_A, A_AMT);
        _fund(DESK_B, B_AMT);
        vm.prank(DESK_A);
        escrow.deposit(SID);
        vm.prank(DESK_B);
        escrow.deposit(SID);
    }

    function testDepositsMoveTokensIntoContract() public {
        _openSession();
        require(
            escrow.statusOf(SID) == ObligorEscrow.EscrowStatus.Created,
            "expected Created after open"
        );

        _fund(DESK_A, A_AMT);
        vm.prank(DESK_A);
        escrow.deposit(SID);
        require(
            escrow.statusOf(SID) == ObligorEscrow.EscrowStatus.Created,
            "one-sided deposit must not settle"
        );

        _fund(DESK_B, B_AMT);
        vm.prank(DESK_B);
        escrow.deposit(SID);

        require(
            escrow.statusOf(SID) == ObligorEscrow.EscrowStatus.Deposited,
            "expected Deposited after both"
        );
        require(
            token.balanceOf(address(escrow)) == A_AMT + B_AMT,
            "contract must custody both siloed margins"
        );
        require(escrow.heldMargin(SID) == A_AMT + B_AMT, "heldMargin mismatch");
    }

    function testSettleReleasesFreedProRataAndRetainsNetted() public {
        _openSession();
        _depositBoth();

        uint256 total = A_AMT + B_AMT; // 300_000
        uint256 netted = 150_000e6;
        // freed = total - netted = 150_000
        // releaseA = freed * A / total = 150_000 * 100_000 / 300_000 = 50_000
        // releaseB = 100_000

        vm.prank(AUTHORITY);
        escrow.settleNettedMargin(SID, netted, keccak256("attestation"));

        require(token.balanceOf(DESK_A) == 50_000e6, "desk A release wrong");
        require(token.balanceOf(DESK_B) == 100_000e6, "desk B release wrong");
        require(token.balanceOf(address(escrow)) == netted, "netted margin must remain");
        require(escrow.heldMargin(SID) == netted, "heldMargin after settle wrong");
        require(
            escrow.statusOf(SID) == ObligorEscrow.EscrowStatus.Settled,
            "expected Settled"
        );
    }

    function testSettleRejectsFullRelease() public {
        _openSession();
        _depositBoth();
        vm.prank(AUTHORITY);
        vm.expectRevert(ObligorEscrow.NoCapitalFreed.selector);
        escrow.settleNettedMargin(SID, A_AMT + B_AMT, bytes32(0));
    }

    function testNonAuthorityCannotOpenOrSettle() public {
        vm.prank(STRANGER);
        vm.expectRevert(ObligorEscrow.Unauthorized.selector);
        escrow.createSession(SID, DESK_A, DESK_B, A_AMT, B_AMT);

        _openSession();
        _depositBoth();
        vm.prank(STRANGER);
        vm.expectRevert(ObligorEscrow.Unauthorized.selector);
        escrow.settleNettedMargin(SID, 1, bytes32(0));
    }

    function testNonPartyCannotDepositAndNoDoubleDeposit() public {
        _openSession();
        _fund(STRANGER, A_AMT);
        vm.prank(STRANGER);
        vm.expectRevert(ObligorEscrow.NotAParty.selector);
        escrow.deposit(SID);

        _fund(DESK_A, A_AMT);
        vm.prank(DESK_A);
        escrow.deposit(SID);
        vm.prank(DESK_A);
        vm.expectRevert(ObligorEscrow.AlreadyFunded.selector);
        escrow.deposit(SID);
    }

    function testCannotSettleBeforeFullyFunded() public {
        _openSession();
        _fund(DESK_A, A_AMT);
        vm.prank(DESK_A);
        escrow.deposit(SID);
        vm.prank(AUTHORITY);
        vm.expectRevert(ObligorEscrow.InvalidState.selector);
        escrow.settleNettedMargin(SID, 1, bytes32(0));
    }
}
