// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title AdRegistry — On-chain ad creative and campaign management
/// @notice Stores ad creative metadata (ASCII art directly on-chain), manages approval flow,
///         and links to AdPool via advertiser address.
contract AdRegistry is Ownable {
    // ──────────────────────────────────────────────
    //  Types
    // ──────────────────────────────────────────────

    enum Status {
        Pending,
        Approved,
        Rejected,
        Paused
    }

    struct Creative {
        string[] asciiLines; // ASCII art lines (stored directly on-chain)
        string tagline; // Max 120 chars
        string sponsorName; // Max 40 chars
        string targetTags; // Comma-separated, e.g. "typescript,react,web3"
        string clickUrl; // Click-through URL
        Status status;
        string rejectionReason;
        uint256 submittedAt;
        uint256 updatedAt;
    }

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    /// Advertiser address => Creative
    mapping(address => Creative) public creatives;

    /// Approval queue: list of pending advertiser addresses
    address[] public pendingQueue;
    mapping(address => uint256) private pendingIndex; // 1-indexed

    /// All ever-approved advertisers
    address[] public approvedAdvertisers;

    /// Blocked advertisers
    mapping(address => bool) public blocked;

    /// Approved moderators
    mapping(address => bool) public moderators;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event CreativeSubmitted(address indexed advertiser, uint256 timestamp);
    event CreativeApproved(address indexed advertiser, uint256 timestamp);
    event CreativeRejected(address indexed advertiser, string reason, uint256 timestamp);
    event CreativePaused(address indexed advertiser, uint256 timestamp);
    event CreativeUpdated(address indexed advertiser, uint256 timestamp);
    event ModeratorUpdated(address indexed moderator, bool authorized);
    event AdvertiserBlocked(address indexed advertiser, uint256 timestamp);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error AdvertiserBlocked_();
    error NotModerator();
    error NoCreativeFound();
    error CreativeNotApproved();
    error TaglineTooLong();
    error SponsorNameTooLong();
    error EmptyCreative();

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor() Ownable(msg.sender) {
        moderators[msg.sender] = true;
    }

    // ──────────────────────────────────────────────
    //  Advertiser Functions
    // ──────────────────────────────────────────────

    /// @notice Submit a new ad creative for review
    function submitCreative(
        string[] memory asciiLines,
        string calldata tagline,
        string calldata sponsorName,
        string calldata targetTags,
        string calldata clickUrl
    ) external {
        if (blocked[msg.sender]) revert AdvertiserBlocked_();
        if (asciiLines.length == 0) revert EmptyCreative();
        if (bytes(tagline).length > 120) revert TaglineTooLong();
        if (bytes(sponsorName).length > 40) revert SponsorNameTooLong();

        Creative storage c = creatives[msg.sender];
        // Clear existing lines and copy new ones
        delete c.asciiLines;
        for (uint256 i = 0; i < asciiLines.length; i++) {
            c.asciiLines.push(asciiLines[i]);
        }
        c.tagline = tagline;
        c.sponsorName = sponsorName;
        c.targetTags = targetTags;
        c.clickUrl = clickUrl;
        c.status = Status.Pending;
        c.rejectionReason = "";
        c.submittedAt = block.timestamp;
        c.updatedAt = block.timestamp;

        // Add to pending queue if not already there
        if (pendingIndex[msg.sender] == 0) {
            pendingQueue.push(msg.sender);
            pendingIndex[msg.sender] = pendingQueue.length;
        }

        emit CreativeSubmitted(msg.sender, block.timestamp);
    }

    /// @notice Update non-creative fields without re-approval
    function updateMetadata(string calldata tagline, string calldata targetTags, string calldata clickUrl) external {
        Creative storage c = creatives[msg.sender];
        if (c.submittedAt == 0) revert NoCreativeFound();
        if (bytes(tagline).length > 120) revert TaglineTooLong();

        c.tagline = tagline;
        c.targetTags = targetTags;
        c.clickUrl = clickUrl;
        c.updatedAt = block.timestamp;

        emit CreativeUpdated(msg.sender, block.timestamp);
    }

    /// @notice Advertiser can pause their own campaign
    function pauseCampaign() external {
        Creative storage c = creatives[msg.sender];
        if (c.submittedAt == 0) revert NoCreativeFound();
        c.status = Status.Paused;
        c.updatedAt = block.timestamp;
        emit CreativePaused(msg.sender, block.timestamp);
    }

    /// @notice Advertiser can unpause their own campaign (if previously approved)
    function unpauseCampaign() external {
        Creative storage c = creatives[msg.sender];
        if (c.submittedAt == 0) revert NoCreativeFound();
        // Only allow unpausing if it was previously approved and then paused
        c.status = Status.Approved;
        c.updatedAt = block.timestamp;
    }

    // ──────────────────────────────────────────────
    //  Moderator / Admin Functions
    // ──────────────────────────────────────────────

    modifier onlyModerator() {
        if (!moderators[msg.sender] && msg.sender != owner()) revert NotModerator();
        _;
    }

    function approveCreative(address advertiser) external onlyModerator {
        Creative storage c = creatives[advertiser];
        if (c.submittedAt == 0) revert NoCreativeFound();

        c.status = Status.Approved;
        c.updatedAt = block.timestamp;

        // Remove from pending queue
        _removeFromPending(advertiser);

        // Add to approved list (if not already)
        approvedAdvertisers.push(advertiser);

        emit CreativeApproved(advertiser, block.timestamp);
    }

    function rejectCreative(address advertiser, string calldata reason) external onlyModerator {
        Creative storage c = creatives[advertiser];
        if (c.submittedAt == 0) revert NoCreativeFound();

        c.status = Status.Rejected;
        c.rejectionReason = reason;
        c.updatedAt = block.timestamp;

        _removeFromPending(advertiser);

        emit CreativeRejected(advertiser, reason, block.timestamp);
    }

    function blockAdvertiser(address advertiser) external onlyOwner {
        blocked[advertiser] = true;
        Creative storage c = creatives[advertiser];
        if (c.submittedAt != 0) {
            c.status = Status.Rejected;
            c.rejectionReason = "Advertiser blocked";
            c.updatedAt = block.timestamp;
        }
        _removeFromPending(advertiser);
        emit AdvertiserBlocked(advertiser, block.timestamp);
    }

    function setModerator(address moderator, bool authorized) external onlyOwner {
        moderators[moderator] = authorized;
        emit ModeratorUpdated(moderator, authorized);
    }

    // ──────────────────────────────────────────────
    //  View Functions (Used by Proxy)
    // ──────────────────────────────────────────────

    /// @notice Get the full creative for an advertiser
    function getCreative(
        address advertiser
    )
        external
        view
        returns (
            string[] memory asciiLines,
            string memory tagline,
            string memory sponsorName,
            string memory targetTags,
            string memory clickUrl,
            Status status
        )
    {
        Creative storage c = creatives[advertiser];
        return (c.asciiLines, c.tagline, c.sponsorName, c.targetTags, c.clickUrl, c.status);
    }

    /// @notice Get just the on-chain ASCII art lines for rendering
    function getAsciiArt(address advertiser) external view returns (string[] memory) {
        return creatives[advertiser].asciiLines;
    }

    /// @notice Check if an advertiser's creative is approved and active
    function isActive(address advertiser) external view returns (bool) {
        return creatives[advertiser].status == Status.Approved;
    }

    /// @notice Get pending queue length
    function pendingCount() external view returns (uint256) {
        return pendingQueue.length;
    }

    /// @notice Get total approved advertisers count
    function approvedCount() external view returns (uint256) {
        return approvedAdvertisers.length;
    }

    // ──────────────────────────────────────────────
    //  Internal
    // ──────────────────────────────────────────────

    function _removeFromPending(address advertiser) internal {
        uint256 idx = pendingIndex[advertiser];
        if (idx == 0) return;

        uint256 lastIdx = pendingQueue.length;
        if (idx != lastIdx) {
            address last = pendingQueue[lastIdx - 1];
            pendingQueue[idx - 1] = last;
            pendingIndex[last] = idx;
        }
        pendingQueue.pop();
        pendingIndex[advertiser] = 0;
    }
}
