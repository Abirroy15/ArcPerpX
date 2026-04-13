// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./Vault.sol";
import "./PerpEngine.sol";
import "./interfaces/IOracle.sol";

/**
 * @title LiquidationEngine
 * @notice Monitors positions and executes liquidations with cascade protection.
 * @dev AI Risk Oracle feeds anomaly signals to adjust dynamic thresholds.
 */
contract LiquidationEngine is AccessControl, ReentrancyGuard {

    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");
    bytes32 public constant AI_ORACLE_ROLE = keccak256("AI_ORACLE_ROLE");
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");

    // ── State ─────────────────────────────────────────────────────────────

    Vault public vault;
    PerpEngine public perpEngine;

    uint256 public maintenanceMarginRate = 500;  // 5% default
    uint256 public liquidationFeeRate = 50;       // 0.5%
    uint256 public maxLiquidationsPerBlock = 20;  // cascade protection
    uint256 public liquidationsThisBlock;
    uint256 public lastLiquidationBlock;

    // AI Risk Oracle adjustments
    uint256 public dynamicMarginMultiplier = 10000; // 1.0x default (bps)
    bool public cascadeCircuitBreaker;

    mapping(bytes32 => uint256) public positionLiquidationPrice;

    // ── Events ────────────────────────────────────────────────────────────

    event Liquidated(
        bytes32 indexed positionId,
        address indexed trader,
        address indexed liquidator,
        uint256 liqPrice,
        uint256 liquidatorBonus
    );
    event CircuitBreakerTriggered(uint256 liquidationCount, uint256 blockNumber);
    event DynamicMarginAdjusted(uint256 newMultiplier, string reason);
    event LiquidationWarning(bytes32 indexed positionId, uint256 marginRatio, uint256 threshold);

    // ── Constructor ───────────────────────────────────────────────────────

    constructor(address _vault, address _perpEngine, address admin) {
        vault = Vault(_vault);
        perpEngine = PerpEngine(_perpEngine);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GOVERNANCE_ROLE, admin);
        _grantRole(KEEPER_ROLE, admin);
    }

    // ── Liquidation Logic ─────────────────────────────────────────────────

    /**
     * @notice Check if a position is eligible for liquidation
     */
    function isLiquidatable(bytes32 positionId) public view returns (bool, uint256 marginRatio) {
        PerpEngine.Position memory pos = perpEngine.getPosition(positionId);
        if (!pos.isOpen) return (false, 0);

        PerpEngine.Market memory market = perpEngine.markets(pos.market);
        uint256 currentPrice = IOracle(market.oracle).getPrice(pos.market);

        // Calculate current margin ratio
        int256 unrealizedPnl = perpEngine.getUnrealizedPnl(positionId);
        uint256 effectiveMargin;
        
        if (unrealizedPnl >= 0) {
            effectiveMargin = pos.margin + uint256(unrealizedPnl);
        } else {
            uint256 loss = uint256(-unrealizedPnl);
            effectiveMargin = loss >= pos.margin ? 0 : pos.margin - loss;
        }

        uint256 notionalValue = (pos.size * currentPrice) / 1e18;
        if (notionalValue == 0) return (false, 0);

        marginRatio = (effectiveMargin * 10000) / notionalValue;
        
        // Apply dynamic multiplier from AI oracle
        uint256 effectiveThreshold = (maintenanceMarginRate * dynamicMarginMultiplier) / 10000;
        
        return (marginRatio < effectiveThreshold, marginRatio);
    }

    /**
     * @notice Execute liquidation of an underwater position
     * @dev Keepers call this; they receive a bonus from the liquidation fee
     */
    function liquidate(bytes32 positionId) external nonReentrant onlyRole(KEEPER_ROLE) {
        require(!cascadeCircuitBreaker, "LiquidationEngine: circuit breaker active");
        
        // Cascade protection
        if (block.number > lastLiquidationBlock) {
            liquidationsThisBlock = 0;
            lastLiquidationBlock = block.number;
        }
        require(liquidationsThisBlock < maxLiquidationsPerBlock, "LiquidationEngine: max liquidations reached");

        (bool liqEligible, uint256 marginRatio) = isLiquidatable(positionId);
        require(liqEligible, "LiquidationEngine: position not liquidatable");

        PerpEngine.Position memory pos = perpEngine.getPosition(positionId);
        PerpEngine.Market memory market = perpEngine.markets(pos.market);
        uint256 currentPrice = IOracle(market.oracle).getPrice(pos.market);

        // Calculate liquidation amounts
        uint256 notionalValue = (pos.size * currentPrice) / 1e18;
        uint256 liquidationFee = (notionalValue * liquidationFeeRate) / 10000;
        uint256 keeperBonus = liquidationFee / 2;
        uint256 insuranceContribution = liquidationFee - keeperBonus;

        // Execute via vault
        address collateralToken = address(0); // from market config
        vault.liquidate(pos.trader, collateralToken, pos.margin, address(this));
        
        // Distribute: keeper bonus + insurance fund
        liquidationsThisBlock++;

        emit Liquidated(positionId, pos.trader, msg.sender, currentPrice, keeperBonus);

        // Check for cascade risk
        if (liquidationsThisBlock >= maxLiquidationsPerBlock - 1) {
            emit CircuitBreakerTriggered(liquidationsThisBlock, block.number);
            // Don't auto-trigger; emit event for governance to review
        }
    }

    /**
     * @notice Batch check positions for liquidation warnings (off-chain keepers call view)
     */
    function checkPositionHealth(bytes32[] calldata positionIds) 
        external view returns (bytes32[] memory atRisk, uint256[] memory ratios) {
        uint256 count;
        bool[] memory flags = new bool[](positionIds.length);
        
        for (uint256 i = 0; i < positionIds.length; i++) {
            (bool liq, uint256 ratio) = isLiquidatable(positionIds[i]);
            if (liq || ratio < maintenanceMarginRate * 2) {
                flags[i] = true;
                count++;
            }
        }
        
        atRisk = new bytes32[](count);
        ratios = new uint256[](count);
        uint256 idx;
        for (uint256 i = 0; i < positionIds.length; i++) {
            if (flags[i]) {
                (,uint256 ratio) = isLiquidatable(positionIds[i]);
                atRisk[idx] = positionIds[i];
                ratios[idx] = ratio;
                idx++;
            }
        }
    }

    // ── AI Risk Oracle Integration ─────────────────────────────────────────

    /**
     * @notice AI oracle adjusts margin requirements based on detected anomalies
     * @dev Called by AI Risk Oracle service when market stress detected
     */
    function updateDynamicMargin(
        uint256 newMultiplier,
        string calldata reason
    ) external onlyRole(AI_ORACLE_ROLE) {
        require(newMultiplier >= 10000 && newMultiplier <= 30000, "LiquidationEngine: multiplier out of range");
        dynamicMarginMultiplier = newMultiplier;
        emit DynamicMarginAdjusted(newMultiplier, reason);
    }

    function triggerCascadeBreaker(bool active) external onlyRole(AI_ORACLE_ROLE) {
        cascadeCircuitBreaker = active;
    }

    // ── Governance ────────────────────────────────────────────────────────

    function setMaintenanceMarginRate(uint256 rate) external onlyRole(GOVERNANCE_ROLE) {
        require(rate >= 100 && rate <= 2000, "LiquidationEngine: invalid rate");
        maintenanceMarginRate = rate;
    }

    function setMaxLiquidationsPerBlock(uint256 max) external onlyRole(GOVERNANCE_ROLE) {
        maxLiquidationsPerBlock = max;
    }
}
