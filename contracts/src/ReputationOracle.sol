// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ReputationOracle — On-chain trust scoring for advertisers and users
/// @notice Tracks behavior metrics to enable fraud prevention and priority scheduling.
///         Proxy servers submit signals; scores are queryable by any contract or frontend.
contract ReputationOracle is Ownable {
    // ──────────────────────────────────────────────
    //  Types
    // ──────────────────────────────────────────────

    struct AdvertiserReputation {
        uint256 totalDeposited; // Lifetime USDC deposited
        uint256 totalImpressions; // Lifetime impressions purchased
        uint256 campaignsRun; // Number of campaigns
        uint256 fraudFlags; // Fraud signals received
        uint256 firstSeenAt; // First interaction timestamp
        uint256 lastActiveAt; // Last activity timestamp
    }

    struct UserReputation {
        uint256 totalClaims; // Total impressions claimed
        uint256 totalPayments; // Total x402 payments made
        uint256 fraudFlags; // Fraud signals received
        uint256 firstSeenAt;
        uint256 lastActiveAt;
        bool throttled; // Rate-limited status
    }

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    mapping(address => AdvertiserReputation) public advertiserRep;
    mapping(address => UserReputation) public userRep;

    /// Addresses authorized to submit signals (proxy servers)
    mapping(address => bool) public authorizedReporters;

    /// Fraud flag threshold for auto-throttling
    uint256 public throttleThreshold = 5;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event AdvertiserSignal(address indexed advertiser, string signalType, uint256 value, uint256 timestamp);
    event UserSignal(address indexed user, string signalType, uint256 value, uint256 timestamp);
    event UserThrottled(address indexed user, uint256 timestamp);
    event UserUnthrottled(address indexed user, uint256 timestamp);
    event ReporterUpdated(address indexed reporter, bool authorized);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error NotAuthorizedReporter();

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor(address initialReporter) Ownable(msg.sender) {
        authorizedReporters[initialReporter] = true;
        emit ReporterUpdated(initialReporter, true);
    }

    // ──────────────────────────────────────────────
    //  Reporter Functions (Proxy Servers)
    // ──────────────────────────────────────────────

    modifier onlyReporter() {
        if (!authorizedReporters[msg.sender]) revert NotAuthorizedReporter();
        _;
    }

    /// @notice Record an advertiser deposit
    function recordDeposit(address advertiser, uint256 amount) external onlyReporter {
        AdvertiserReputation storage rep = advertiserRep[advertiser];
        rep.totalDeposited += amount;
        if (rep.firstSeenAt == 0) rep.firstSeenAt = block.timestamp;
        rep.lastActiveAt = block.timestamp;
        emit AdvertiserSignal(advertiser, "deposit", amount, block.timestamp);
    }

    /// @notice Record an advertiser campaign start
    function recordCampaign(address advertiser) external onlyReporter {
        AdvertiserReputation storage rep = advertiserRep[advertiser];
        rep.campaignsRun += 1;
        rep.lastActiveAt = block.timestamp;
        emit AdvertiserSignal(advertiser, "campaign", 1, block.timestamp);
    }

    /// @notice Record a user impression claim
    function recordClaim(address user) external onlyReporter {
        UserReputation storage rep = userRep[user];
        rep.totalClaims += 1;
        if (rep.firstSeenAt == 0) rep.firstSeenAt = block.timestamp;
        rep.lastActiveAt = block.timestamp;
        emit UserSignal(user, "claim", 1, block.timestamp);
    }

    /// @notice Record a user x402 payment
    function recordPayment(address user) external onlyReporter {
        UserReputation storage rep = userRep[user];
        rep.totalPayments += 1;
        rep.lastActiveAt = block.timestamp;
        emit UserSignal(user, "payment", 1, block.timestamp);
    }

    /// @notice Submit a fraud flag against a user
    function flagUser(address user) external onlyReporter {
        UserReputation storage rep = userRep[user];
        rep.fraudFlags += 1;

        if (rep.fraudFlags >= throttleThreshold && !rep.throttled) {
            rep.throttled = true;
            emit UserThrottled(user, block.timestamp);
        }

        emit UserSignal(user, "fraud_flag", rep.fraudFlags, block.timestamp);
    }

    /// @notice Submit a fraud flag against an advertiser
    function flagAdvertiser(address advertiser) external onlyReporter {
        AdvertiserReputation storage rep = advertiserRep[advertiser];
        rep.fraudFlags += 1;
        emit AdvertiserSignal(advertiser, "fraud_flag", rep.fraudFlags, block.timestamp);
    }

    // ──────────────────────────────────────────────
    //  View Functions (Queryable by Anyone)
    // ──────────────────────────────────────────────

    /// @notice Get advertiser reputation score (0-100)
    function advertiserScore(address advertiser) external view returns (uint256) {
        AdvertiserReputation storage rep = advertiserRep[advertiser];
        if (rep.firstSeenAt == 0) return 0;

        uint256 score = 50; // Base score

        // Bonus for deposits (up to +20)
        if (rep.totalDeposited > 100e6)
            score += 20; // > 100 USDC
        else if (rep.totalDeposited > 10e6)
            score += 10; // > 10 USDC
        else if (rep.totalDeposited > 1e6) score += 5; // > 1 USDC

        // Bonus for impressions (up to +15)
        if (rep.totalImpressions > 10000) score += 15;
        else if (rep.totalImpressions > 1000) score += 10;
        else if (rep.totalImpressions > 100) score += 5;

        // Bonus for campaigns (up to +10)
        if (rep.campaignsRun > 5) score += 10;
        else if (rep.campaignsRun > 1) score += 5;

        // Penalty for fraud flags (up to -50)
        if (rep.fraudFlags > 0) {
            uint256 penalty = rep.fraudFlags * 10;
            score = penalty >= score ? 0 : score - penalty;
        }

        // Longevity bonus (up to +5)
        if (block.timestamp - rep.firstSeenAt > 30 days) score += 5;

        return score > 100 ? 100 : score;
    }

    /// @notice Get user reputation score (0-100)
    function userScore(address user) external view returns (uint256) {
        UserReputation storage rep = userRep[user];
        if (rep.firstSeenAt == 0) return 50; // New users get benefit of the doubt

        uint256 score = 50;

        // Claim-to-payment ratio check
        if (rep.totalClaims > 5) {
            if (rep.totalPayments == 0) {
                score = 10; // Claims but no payments = suspicious
            } else {
                uint256 ratio = (rep.totalPayments * 100) / rep.totalClaims;
                if (ratio >= 80)
                    score += 30; // Good: pays for most claims
                else if (ratio >= 50)
                    score += 15; // Okay
                else score = score > 20 ? score - 20 : 0; // Bad ratio
            }
        }

        // Penalty for fraud flags
        if (rep.fraudFlags > 0) {
            uint256 penalty = rep.fraudFlags * 15;
            score = penalty >= score ? 0 : score - penalty;
        }

        // Volume bonus
        if (rep.totalPayments > 100) score += 10;

        return score > 100 ? 100 : score;
    }

    /// @notice Check if a user is throttled
    function isThrottled(address user) external view returns (bool) {
        return userRep[user].throttled;
    }

    // ──────────────────────────────────────────────
    //  Admin
    // ──────────────────────────────────────────────

    function setReporter(address reporter, bool authorized) external onlyOwner {
        authorizedReporters[reporter] = authorized;
        emit ReporterUpdated(reporter, authorized);
    }

    function setThrottleThreshold(uint256 threshold) external onlyOwner {
        throttleThreshold = threshold;
    }

    /// @notice Manually unthrottle a user (for appeals)
    function unthrottleUser(address user) external onlyOwner {
        userRep[user].throttled = false;
        userRep[user].fraudFlags = 0; // Reset flags on appeal
        emit UserUnthrottled(user, block.timestamp);
    }
}
