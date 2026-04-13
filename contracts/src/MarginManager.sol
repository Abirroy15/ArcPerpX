// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./Vault.sol";

/**
 * @title MarginManager
 * @notice Manages cross and isolated margin accounting per user
 */
contract MarginManager is AccessControl {
    bytes32 public constant ENGINE_ROLE = keccak256("ENGINE_ROLE");

    Vault public vault;

    struct MarginAccount {
        uint256 crossMarginBalance;    // used for cross-margin positions
        uint256 totalLockedMargin;     // sum of isolated margins
        uint256 maintenanceRequired;   // min margin to stay open
        bool hasCrossPositions;
    }

    mapping(address => MarginAccount) public accounts;

    event MarginAdded(address indexed user, uint256 amount);
    event MarginWithdrawn(address indexed user, uint256 amount);
    event MarginTransferred(address indexed from, address indexed to, uint256 amount);

    constructor(address _vault, address admin) {
        vault = Vault(_vault);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ENGINE_ROLE, admin);
    }

    function getAvailableMargin(address user, address token) external view returns (uint256) {
        uint256 balance = vault.getBalance(user, token);
        uint256 locked = accounts[user].totalLockedMargin;
        return balance > locked ? balance - locked : 0;
    }

    function updateLockedMargin(address user, uint256 newLocked) external onlyRole(ENGINE_ROLE) {
        accounts[user].totalLockedMargin = newLocked;
    }

    function getCrossMarginBalance(address user) external view returns (uint256) {
        return accounts[user].crossMarginBalance;
    }
}


// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title RewardSystem
 * @notice XP tracking, achievements, seasonal rewards, protocol fee distribution
 */
contract RewardSystem is AccessControl {
    bytes32 public constant RECORDER_ROLE = keccak256("RECORDER_ROLE");
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");

    // ── Tiers ────────────────────────────────────────────────────────────

    enum Tier { APPRENTICE, TRADER, EXPERT, SENTINEL, LEGEND }

    struct TraderProfile {
        uint256 xpPoints;
        Tier tier;
        uint256 totalTrades;
        uint256 winningTrades;
        int256 totalPnl;
        uint256 season;
        uint256[] achievements;     // achievement IDs
        bool registered;
    }

    // ── Achievement System ────────────────────────────────────────────────

    struct Achievement {
        uint256 id;
        string name;
        string description;
        uint256 xpReward;
        bool isActive;
    }

    mapping(address => TraderProfile) public profiles;
    mapping(uint256 => Achievement) public achievements;
    mapping(address => mapping(uint256 => bool)) public hasAchievement;

    uint256 public currentSeason = 1;
    uint256 public nextAchievementId = 1;

    // Protocol fee pool for season rewards
    uint256 public seasonRewardPool;

    // ── Events ────────────────────────────────────────────────────────────

    event XPEarned(address indexed trader, uint256 amount, string reason);
    event TierUp(address indexed trader, Tier newTier);
    event AchievementUnlocked(address indexed trader, uint256 achievementId, string name);
    event SeasonRewardClaimed(address indexed trader, uint256 amount, uint256 season);

    // ── Constructor ───────────────────────────────────────────────────────

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GOVERNANCE_ROLE, admin);
        _grantRole(RECORDER_ROLE, admin);

        // Initialize base achievements
        _createAchievement("First Trade", "Complete your first trade", 100);
        _createAchievement("Centurion", "Complete 100 trades", 1000);
        _createAchievement("Profitable Month", "Positive PnL for 30 days", 2500);
        _createAchievement("Agent Creator", "Create your first AI agent", 500);
        _createAchievement("Breeder", "Breed two agents", 750);
        _createAchievement("Legend Status", "Reach 100,000 XP", 5000);
    }

    // ── XP System ────────────────────────────────────────────────────────

    function awardXP(address trader, uint256 amount, string calldata reason) external onlyRole(RECORDER_ROLE) {
        if (!profiles[trader].registered) {
            profiles[trader].registered = true;
        }

        profiles[trader].xpPoints += amount;
        _checkTierUp(trader);

        emit XPEarned(trader, amount, reason);
    }

    function recordTrade(address trader, int256 pnl, bool won) external onlyRole(RECORDER_ROLE) {
        TraderProfile storage p = profiles[trader];
        if (!p.registered) p.registered = true;

        p.totalTrades++;
        if (won) p.winningTrades++;
        p.totalPnl += pnl;

        // XP for trading activity
        uint256 xp = won ? 100 + uint256(pnl > 0 ? uint256(pnl) / 1e4 : 0) : 10;
        p.xpPoints += xp;
        _checkTierUp(trader);

        // Check achievements
        if (p.totalTrades == 1) _unlockAchievement(trader, 1);
        if (p.totalTrades == 100) _unlockAchievement(trader, 2);
        if (p.xpPoints >= 100_000) _unlockAchievement(trader, 6);

        emit XPEarned(trader, xp, won ? "winning_trade" : "trade_attempt");
    }

    // ── Season Management ─────────────────────────────────────────────────

    function endSeason() external onlyRole(GOVERNANCE_ROLE) {
        // Distribute rewards to top traders
        // In production: snapshot top 100, compute shares, allow claiming
        currentSeason++;
        seasonRewardPool = 0;
    }

    function contributeToSeasonPool(uint256 amount) external onlyRole(RECORDER_ROLE) {
        seasonRewardPool += amount;
    }

    // ── Internal ──────────────────────────────────────────────────────────

    function _checkTierUp(address trader) internal {
        uint256 xp = profiles[trader].xpPoints;
        Tier newTier;

        if (xp >= 100_000) newTier = Tier.LEGEND;
        else if (xp >= 25_000) newTier = Tier.SENTINEL;
        else if (xp >= 5_000) newTier = Tier.EXPERT;
        else if (xp >= 1_000) newTier = Tier.TRADER;
        else newTier = Tier.APPRENTICE;

        if (newTier != profiles[trader].tier) {
            profiles[trader].tier = newTier;
            emit TierUp(trader, newTier);
        }
    }

    function _unlockAchievement(address trader, uint256 achievementId) internal {
        if (hasAchievement[trader][achievementId]) return;
        Achievement storage a = achievements[achievementId];
        if (!a.isActive) return;

        hasAchievement[trader][achievementId] = true;
        profiles[trader].achievements.push(achievementId);
        profiles[trader].xpPoints += a.xpReward;

        emit AchievementUnlocked(trader, achievementId, a.name);
    }

    function _createAchievement(string memory name, string memory desc, uint256 xpReward) internal {
        uint256 id = nextAchievementId++;
        achievements[id] = Achievement(id, name, desc, xpReward, true);
    }

    // ── Views ─────────────────────────────────────────────────────────────

    function getProfile(address trader) external view returns (TraderProfile memory) {
        return profiles[trader];
    }

    function getTierName(address trader) external view returns (string memory) {
        Tier t = profiles[trader].tier;
        if (t == Tier.LEGEND) return "LEGEND";
        if (t == Tier.SENTINEL) return "SENTINEL";
        if (t == Tier.EXPERT) return "EXPERT";
        if (t == Tier.TRADER) return "TRADER";
        return "APPRENTICE";
    }
}
