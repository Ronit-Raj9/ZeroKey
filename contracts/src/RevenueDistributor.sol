// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title RevenueDistributor — Splits incoming x402 USDC payments between protocol stakeholders
/// @notice Deployed as the `ADSHELL_PAY_TO` address. All x402 payments land here and get split.
///         Default: 50% Treasury, 30% Advertiser Rebate, 15% Node Operators, 5% Community.
contract RevenueDistributor is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    IERC20 public immutable usdc;

    struct Split {
        address recipient;
        uint256 basisPoints; // Out of 10000
        string label;
    }

    Split[] public splits;

    /// Total USDC ever distributed
    uint256 public totalDistributed;

    /// Per-recipient total distributed
    mapping(address => uint256) public recipientTotal;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event RevenueDistributed(uint256 totalAmount, uint256 timestamp);
    event SplitPayment(address indexed recipient, uint256 amount, string label, uint256 timestamp);
    event SplitsUpdated(uint256 timestamp);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error InvalidSplitTotal();
    error NoSplitsConfigured();
    error ZeroAmount();

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor(
        address _usdc,
        address treasury,
        address advertiserRebate,
        address nodeOperators,
        address community
    ) Ownable(msg.sender) {
        usdc = IERC20(_usdc);

        // Default production split
        splits.push(Split(treasury, 5000, "Treasury")); // 50%
        splits.push(Split(advertiserRebate, 3000, "AdvertiserRebate")); // 30%
        splits.push(Split(nodeOperators, 1500, "NodeOperators")); // 15%
        splits.push(Split(community, 500, "Community")); // 5%
    }

    // ──────────────────────────────────────────────
    //  Distribution
    // ──────────────────────────────────────────────

    /// @notice Distribute a specific amount of USDC held by this contract
    /// @dev Call this after USDC is transferred to this contract via x402
    function distribute(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (splits.length == 0) revert NoSplitsConfigured();

        uint256 remaining = amount;

        for (uint256 i = 0; i < splits.length; i++) {
            uint256 share;
            if (i == splits.length - 1) {
                // Last recipient gets remainder to avoid rounding dust
                share = remaining;
            } else {
                share = (amount * splits[i].basisPoints) / 10000;
                remaining -= share;
            }

            if (share > 0) {
                usdc.safeTransfer(splits[i].recipient, share);
                recipientTotal[splits[i].recipient] += share;
                emit SplitPayment(splits[i].recipient, share, splits[i].label, block.timestamp);
            }
        }

        totalDistributed += amount;
        emit RevenueDistributed(amount, block.timestamp);
    }

    /// @notice Distribute ALL USDC currently held by this contract
    function distributeAll() external nonReentrant {
        uint256 balance = usdc.balanceOf(address(this));
        if (balance == 0) revert ZeroAmount();
        if (splits.length == 0) revert NoSplitsConfigured();

        uint256 remaining = balance;

        for (uint256 i = 0; i < splits.length; i++) {
            uint256 share;
            if (i == splits.length - 1) {
                share = remaining;
            } else {
                share = (balance * splits[i].basisPoints) / 10000;
                remaining -= share;
            }

            if (share > 0) {
                usdc.safeTransfer(splits[i].recipient, share);
                recipientTotal[splits[i].recipient] += share;
                emit SplitPayment(splits[i].recipient, share, splits[i].label, block.timestamp);
            }
        }

        totalDistributed += balance;
        emit RevenueDistributed(balance, block.timestamp);
    }

    // ──────────────────────────────────────────────
    //  Admin
    // ──────────────────────────────────────────────

    /// @notice Update the split configuration. Basis points must sum to 10000.
    function updateSplits(
        address[] calldata recipients,
        uint256[] calldata basisPoints,
        string[] calldata labels
    ) external onlyOwner {
        require(recipients.length == basisPoints.length && recipients.length == labels.length, "Array length mismatch");

        uint256 total = 0;
        for (uint256 i = 0; i < basisPoints.length; i++) {
            total += basisPoints[i];
        }
        if (total != 10000) revert InvalidSplitTotal();

        // Clear existing splits
        delete splits;

        for (uint256 i = 0; i < recipients.length; i++) {
            splits.push(Split(recipients[i], basisPoints[i], labels[i]));
        }

        emit SplitsUpdated(block.timestamp);
    }

    /// @notice Get all current splits
    function getSplits() external view returns (Split[] memory) {
        return splits;
    }

    /// @notice Get number of splits
    function splitCount() external view returns (uint256) {
        return splits.length;
    }
}
