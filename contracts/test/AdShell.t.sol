// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AdPool.sol";
import "../src/AdRegistry.sol";
import "../src/RevenueDistributor.sol";
import "../src/ReputationOracle.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Mock USDC for testing
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
    function decimals() public pure override returns (uint8) {
        return 6;
    }
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract AdShellTest is Test {
    MockUSDC usdc;
    AdPool pool;
    AdRegistry registry;
    RevenueDistributor revDist;
    ReputationOracle repOracle;

    address owner = address(this);
    address claimer = makeAddr("claimer");
    address advertiser = makeAddr("advertiser");
    address user = makeAddr("user");
    address treasury = makeAddr("treasury");
    address rebate = makeAddr("rebate");
    address nodeOps = makeAddr("nodeOps");
    address community = makeAddr("community");

    uint256 constant IMPRESSION_COST = 1000; // 0.001 USDC
    uint256 constant MIN_DEPOSIT = 10000; // 0.01 USDC

    function setUp() public {
        usdc = new MockUSDC();
        pool = new AdPool(address(usdc), IMPRESSION_COST, MIN_DEPOSIT, claimer);
        registry = new AdRegistry();
        revDist = new RevenueDistributor(address(usdc), treasury, rebate, nodeOps, community);
        repOracle = new ReputationOracle(claimer);
    }

    // ──────────────────────────────────────────────
    //  AdPool Tests
    // ──────────────────────────────────────────────

    function test_deposit() public {
        usdc.mint(advertiser, 100_000); // 0.1 USDC
        vm.startPrank(advertiser);
        usdc.approve(address(pool), 100_000);
        pool.deposit(100_000);
        vm.stopPrank();

        assertEq(pool.balances(advertiser), 100_000);
        assertEq(pool.activeAdvertiserCount(), 1);
    }

    function test_deposit_belowMinimum_reverts() public {
        usdc.mint(advertiser, 5000);
        vm.startPrank(advertiser);
        usdc.approve(address(pool), 5000);
        vm.expectRevert(AdPool.BelowMinimumDeposit.selector);
        pool.deposit(5000);
        vm.stopPrank();
    }

    function test_claimImpression() public {
        // Setup: deposit
        usdc.mint(advertiser, 100_000);
        vm.startPrank(advertiser);
        usdc.approve(address(pool), 100_000);
        pool.deposit(100_000);
        vm.stopPrank();

        // Claim
        vm.prank(claimer);
        pool.claimImpression(user);

        assertEq(usdc.balanceOf(user), IMPRESSION_COST);
        assertEq(pool.balances(advertiser), 100_000 - IMPRESSION_COST);
        assertEq(pool.totalImpressions(), 1);
        assertEq(pool.lifetimeImpressions(advertiser), 1);
    }

    function test_claimImpression_unauthorized_reverts() public {
        vm.expectRevert(AdPool.NotAuthorizedClaimer.selector);
        pool.claimImpression(user);
    }

    function test_claimImpression_depletes_advertiser() public {
        usdc.mint(advertiser, MIN_DEPOSIT);
        vm.startPrank(advertiser);
        usdc.approve(address(pool), MIN_DEPOSIT);
        pool.deposit(MIN_DEPOSIT);
        vm.stopPrank();

        assertEq(pool.activeAdvertiserCount(), 1);

        // Claim all 10 impressions (MIN_DEPOSIT / IMPRESSION_COST = 10)
        for (uint256 i = 0; i < 10; i++) {
            vm.prank(claimer);
            pool.claimImpression(user);
        }

        assertEq(pool.activeAdvertiserCount(), 0);
        assertEq(pool.balances(advertiser), 0);
    }

    function test_withdraw() public {
        usdc.mint(advertiser, 100_000);
        vm.startPrank(advertiser);
        usdc.approve(address(pool), 100_000);
        pool.deposit(100_000);
        pool.withdraw(50_000);
        vm.stopPrank();

        assertEq(pool.balances(advertiser), 50_000);
        assertEq(usdc.balanceOf(advertiser), 50_000);
    }

    function test_pause_blocks_claims() public {
        usdc.mint(advertiser, 100_000);
        vm.startPrank(advertiser);
        usdc.approve(address(pool), 100_000);
        pool.deposit(100_000);
        vm.stopPrank();

        pool.pause();

        vm.prank(claimer);
        vm.expectRevert();
        pool.claimImpression(user);
    }

    function test_dailyBudgetCap() public {
        usdc.mint(advertiser, 100_000);
        vm.startPrank(advertiser);
        usdc.approve(address(pool), 100_000);
        pool.deposit(100_000);
        pool.setDailyBudget(2000); // Cap at 0.002 USDC/day (2 impressions)
        vm.stopPrank();

        // First two claims succeed
        vm.prank(claimer);
        pool.claimImpression(user);
        vm.prank(claimer);
        pool.claimImpression(user);

        // Third claim exceeds budget
        vm.prank(claimer);
        vm.expectRevert(AdPool.DailyBudgetExceeded.selector);
        pool.claimImpression(user);
    }

    // ──────────────────────────────────────────────
    //  AdRegistry Tests
    // ──────────────────────────────────────────────

    function test_submitAndApproveCreative() public {
        string[] memory lines = new string[](2);
        lines[0] = "Line 1";
        lines[1] = "Line 2";

        vm.prank(advertiser);
        registry.submitCreative(lines, "Buy our stuff", "Acme Corp", "web3", "https://acme.com");

        assertEq(registry.pendingCount(), 1);
        assertFalse(registry.isActive(advertiser));

        registry.approveCreative(advertiser);
        assertTrue(registry.isActive(advertiser));
        assertEq(registry.pendingCount(), 0);
    }

    function test_rejectCreative() public {
        string[] memory lines = new string[](1);
        lines[0] = "Bad ad";

        vm.prank(advertiser);
        registry.submitCreative(lines, "tag", "sponsor", "web3", "url");

        registry.rejectCreative(advertiser, "Inappropriate content");
        assertFalse(registry.isActive(advertiser));
    }

    function test_getAsciiArt() public {
        string[] memory lines = new string[](3);
        lines[0] = "111";
        lines[1] = "222";
        lines[2] = "333";

        vm.prank(advertiser);
        registry.submitCreative(lines, "tag", "sponsor", "web3", "url");
        registry.approveCreative(advertiser);

        string[] memory art = registry.getAsciiArt(advertiser);
        assertEq(art.length, 3);
        assertEq(art[0], "111");
        assertEq(art[2], "333");
    }

    // ──────────────────────────────────────────────
    //  RevenueDistributor Tests
    // ──────────────────────────────────────────────

    function test_distribute() public {
        usdc.mint(address(revDist), 10_000); // 0.01 USDC

        revDist.distributeAll();

        assertEq(usdc.balanceOf(treasury), 5000); // 50%
        assertEq(usdc.balanceOf(rebate), 3000); // 30%
        assertEq(usdc.balanceOf(nodeOps), 1500); // 15%
        assertEq(usdc.balanceOf(community), 500); // 5%
        assertEq(revDist.totalDistributed(), 10_000);
    }

    // ──────────────────────────────────────────────
    //  ReputationOracle Tests
    // ──────────────────────────────────────────────

    function test_userScore_newUser() public view {
        assertEq(repOracle.userScore(user), 50);
    }

    function test_userThrottle() public {
        for (uint i = 0; i < 5; i++) {
            vm.prank(claimer);
            repOracle.flagUser(user);
        }
        assertTrue(repOracle.isThrottled(user));
    }

    function test_advertiserScore_builds() public {
        vm.startPrank(claimer);
        repOracle.recordDeposit(advertiser, 50e6); // 50 USDC
        repOracle.recordCampaign(advertiser);
        vm.stopPrank();

        uint256 score = repOracle.advertiserScore(advertiser);
        assertTrue(score > 50, "Score should increase with deposits");
    }

    // ──────────────────────────────────────────────
    //  Full Integration Test
    // ──────────────────────────────────────────────

    function test_fullLoop() public {
        // 1. Advertiser submits + gets approved
        string[] memory lines = new string[](1);
        lines[0] = "KURU DEX - Trade Fast";
        vm.prank(advertiser);
        registry.submitCreative(lines, "Fast DEX", "Kuru", "defi", "https://kuru.io");
        registry.approveCreative(advertiser);

        // 2. Advertiser deposits into pool
        usdc.mint(advertiser, 10_000); // 0.01 USDC = 10 impressions
        vm.startPrank(advertiser);
        usdc.approve(address(pool), 10_000);
        pool.deposit(10_000);
        vm.stopPrank();

        // 3. User watches ad → proxy claims impression
        vm.prank(claimer);
        pool.claimImpression(user);
        assertEq(usdc.balanceOf(user), 1000); // 0.001 USDC

        // 4. User makes AI call → x402 payment arrives at RevenueDistributor
        vm.prank(user);
        usdc.transfer(address(revDist), 1000);
        revDist.distributeAll();

        // 5. Revenue is split
        assertEq(usdc.balanceOf(treasury), 500); // 50%
        assertEq(usdc.balanceOf(rebate), 300); // 30%
        assertEq(usdc.balanceOf(nodeOps), 150); // 15%
        assertEq(usdc.balanceOf(community), 50); // 5%

        // 6. Reputation tracked
        vm.prank(claimer);
        repOracle.recordClaim(user);
        vm.prank(claimer);
        repOracle.recordPayment(user);

        assertEq(repOracle.userScore(user), 50); // New user, balanced ratio
    }
}
