// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AdPool — Trustless escrow and impression payout engine for AdShell
/// @notice Holds advertiser USDC deposits and pays out users per verified ad impression.
///         Only an authorized claimer (the proxy hot wallet) can trigger payouts.
contract AdPool is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    IERC20 public immutable usdc;

    /// Cost per verified impression in USDC (6 decimals)
    uint256 public impressionCost;

    /// Minimum deposit to prevent dust spam
    uint256 public minimumDeposit;

    /// Address authorized to call claimImpression (proxy hot-wallet)
    mapping(address => bool) public authorizedClaimers;

    /// Per-advertiser balances
    mapping(address => uint256) public balances;

    /// Per-advertiser daily budget cap (0 = unlimited)
    mapping(address => uint256) public dailyBudgetCap;

    /// Per-advertiser daily spend tracking
    mapping(address => uint256) public dailySpent;
    mapping(address => uint256) public dailySpentResetDay;

    /// Per-advertiser lifetime impressions
    mapping(address => uint256) public lifetimeImpressions;

    /// Global lifetime impressions
    uint256 public totalImpressions;

    /// Active advertiser queue
    address[] public activeQueue;
    mapping(address => uint256) private queueIndex; // 1-indexed (0 = not in queue)
    uint256 public currentQueuePointer;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event Deposited(address indexed advertiser, uint256 amount, uint256 newBalance, uint256 timestamp);
    event Withdrawn(address indexed advertiser, uint256 amount, uint256 newBalance, uint256 timestamp);
    event ImpressionClaimed(
        address indexed user,
        address indexed advertiser,
        uint256 amount,
        uint256 timestamp,
        uint256 advertiserBalance
    );
    event AdvertiserDepleted(address indexed advertiser, uint256 timestamp);
    event AdvertiserActivated(address indexed advertiser, uint256 timestamp);
    event ClaimerUpdated(address indexed claimer, bool authorized);
    event ImpressionCostUpdated(uint256 oldCost, uint256 newCost);
    event MinimumDepositUpdated(uint256 oldMin, uint256 newMin);
    event DailyBudgetCapSet(address indexed advertiser, uint256 cap);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error NotAuthorizedClaimer();
    error BelowMinimumDeposit();
    error InsufficientBalance();
    error NoActiveAdvertiser();
    error DailyBudgetExceeded();
    error ZeroAddress();
    error ZeroAmount();

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor(
        address _usdc,
        uint256 _impressionCost,
        uint256 _minimumDeposit,
        address _initialClaimer
    ) Ownable(msg.sender) {
        if (_usdc == address(0) || _initialClaimer == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
        impressionCost = _impressionCost;
        minimumDeposit = _minimumDeposit;
        authorizedClaimers[_initialClaimer] = true;
        emit ClaimerUpdated(_initialClaimer, true);
    }

    // ──────────────────────────────────────────────
    //  Advertiser Functions
    // ──────────────────────────────────────────────

    /// @notice Deposit USDC into the AdPool. Requires prior USDC approval.
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        if (amount < minimumDeposit) revert BelowMinimumDeposit();

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender] += amount;

        // Auto-add to queue if balance is now sufficient and not already queued
        if (queueIndex[msg.sender] == 0 && balances[msg.sender] >= impressionCost) {
            _addToQueue(msg.sender);
        }

        emit Deposited(msg.sender, amount, balances[msg.sender], block.timestamp);
    }

    /// @notice Withdraw USDC from unused balance
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (balances[msg.sender] < amount) revert InsufficientBalance();

        balances[msg.sender] -= amount;

        // Remove from queue if balance drops below impression cost
        if (queueIndex[msg.sender] != 0 && balances[msg.sender] < impressionCost) {
            _removeFromQueue(msg.sender);
        }

        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount, balances[msg.sender], block.timestamp);
    }

    /// @notice Set your daily budget cap (0 = unlimited)
    function setDailyBudget(uint256 cap) external {
        dailyBudgetCap[msg.sender] = cap;
        emit DailyBudgetCapSet(msg.sender, cap);
    }

    // ──────────────────────────────────────────────
    //  Impression Claiming (Proxy Only)
    // ──────────────────────────────────────────────

    /// @notice Called by authorized claimer to pay a user for a verified impression
    /// @param user The user's embedded wallet to receive the USDC reward
    function claimImpression(address user) external nonReentrant whenNotPaused {
        if (!authorizedClaimers[msg.sender]) revert NotAuthorizedClaimer();
        if (user == address(0)) revert ZeroAddress();
        if (activeQueue.length == 0) revert NoActiveAdvertiser();

        // Round-robin to find an active advertiser
        address advertiser = _nextActiveAdvertiser();
        if (advertiser == address(0)) revert NoActiveAdvertiser();

        // Reset daily spend if new day
        uint256 today = block.timestamp / 1 days;
        if (dailySpentResetDay[advertiser] != today) {
            dailySpent[advertiser] = 0;
            dailySpentResetDay[advertiser] = today;
        }

        // Check daily budget
        if (dailyBudgetCap[advertiser] != 0 && dailySpent[advertiser] + impressionCost > dailyBudgetCap[advertiser]) {
            revert DailyBudgetExceeded();
        }

        // Deduct from advertiser and pay user
        balances[advertiser] -= impressionCost;
        dailySpent[advertiser] += impressionCost;
        lifetimeImpressions[advertiser] += 1;
        totalImpressions += 1;

        usdc.safeTransfer(user, impressionCost);

        emit ImpressionClaimed(user, advertiser, impressionCost, block.timestamp, balances[advertiser]);

        // Remove depleted advertiser from queue
        if (balances[advertiser] < impressionCost) {
            _removeFromQueue(advertiser);
            emit AdvertiserDepleted(advertiser, block.timestamp);
        }
    }

    /// @notice Get the current number of active advertisers
    function activeAdvertiserCount() external view returns (uint256) {
        return activeQueue.length;
    }

    /// @notice Get the current active advertiser (next in queue) without modifying state
    function currentAdvertiser() external view returns (address) {
        if (activeQueue.length == 0) return address(0);
        return activeQueue[currentQueuePointer % activeQueue.length];
    }

    // ──────────────────────────────────────────────
    //  Admin Functions
    // ──────────────────────────────────────────────

    function setAuthorizedClaimer(address claimer, bool authorized) external onlyOwner {
        if (claimer == address(0)) revert ZeroAddress();
        authorizedClaimers[claimer] = authorized;
        emit ClaimerUpdated(claimer, authorized);
    }

    function setImpressionCost(uint256 newCost) external onlyOwner {
        emit ImpressionCostUpdated(impressionCost, newCost);
        impressionCost = newCost;
    }

    function setMinimumDeposit(uint256 newMin) external onlyOwner {
        emit MinimumDepositUpdated(minimumDeposit, newMin);
        minimumDeposit = newMin;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Recover accidentally sent ERC20 tokens (not USDC)
    function recoverERC20(address token, uint256 amount) external onlyOwner {
        // Do not allow recovering the pool's USDC — that belongs to advertisers
        require(token != address(usdc), "Cannot recover pool USDC");
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    // ──────────────────────────────────────────────
    //  Internal Queue Management
    // ──────────────────────────────────────────────

    function _addToQueue(address advertiser) internal {
        activeQueue.push(advertiser);
        queueIndex[advertiser] = activeQueue.length; // 1-indexed
        emit AdvertiserActivated(advertiser, block.timestamp);
    }

    function _removeFromQueue(address advertiser) internal {
        uint256 idx = queueIndex[advertiser];
        if (idx == 0) return;

        uint256 lastIdx = activeQueue.length;
        if (idx != lastIdx) {
            address lastAdvertiser = activeQueue[lastIdx - 1];
            activeQueue[idx - 1] = lastAdvertiser;
            queueIndex[lastAdvertiser] = idx;
        }
        activeQueue.pop();
        queueIndex[advertiser] = 0;

        // Adjust pointer if needed
        if (activeQueue.length > 0 && currentQueuePointer >= activeQueue.length) {
            currentQueuePointer = 0;
        }
    }

    function _nextActiveAdvertiser() internal returns (address) {
        uint256 len = activeQueue.length;
        if (len == 0) return address(0);

        // Try up to len times to find an advertiser with sufficient balance
        for (uint256 i = 0; i < len; i++) {
            uint256 ptr = (currentQueuePointer + i) % len;
            address candidate = activeQueue[ptr];
            if (balances[candidate] >= impressionCost) {
                currentQueuePointer = (ptr + 1) % len;
                return candidate;
            }
        }
        return address(0);
    }
}
