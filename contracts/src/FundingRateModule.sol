// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title FundingRateModule
 * @notice Dynamic funding rate based on market imbalance + AI prediction.
 * @dev Uses TWAP of long/short skew to compute funding. Predictive visualization
 *      data is pushed from off-chain AI, stored for frontend consumption.
 */
contract FundingRateModule is AccessControl {

    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");
    bytes32 public constant AI_ORACLE_ROLE = keccak256("AI_ORACLE_ROLE");

    // ── State ─────────────────────────────────────────────────────────────

    struct FundingState {
        int256 currentRate;          // bps per 8h, can be negative
        int256 predictedNextRate;    // AI prediction for next epoch
        uint256 lastUpdateTime;
        uint256 fundingEpoch;        // 8 hours
        int256 cumulativeFundingIndex; // running sum for position settlement
        uint256 longOpenInterest;
        uint256 shortOpenInterest;
    }

    mapping(bytes32 => FundingState) public fundingStates; // market → state
    mapping(address => mapping(bytes32 => int256)) public userFundingIndex; // user → market → last index

    uint256 public constant FUNDING_EPOCH = 8 hours;
    int256 public constant MAX_FUNDING_RATE = 300;  // 3% per 8h
    int256 public constant MIN_FUNDING_RATE = -300;
    int256 public constant BASE_FUNDING_RATE = 10;  // 0.1% per 8h

    // ── Events ────────────────────────────────────────────────────────────

    event FundingRateUpdated(bytes32 indexed market, int256 rate, int256 predicted, uint256 timestamp);
    event OpenInterestUpdated(bytes32 indexed market, uint256 longOI, uint256 shortOI);
    event PredictedFundingUpdated(bytes32 indexed market, int256 predictedRate, uint256 confidence);

    // ── Core Functions ────────────────────────────────────────────────────

    /**
     * @notice Update funding rate for a market (called every 8h by keeper)
     */
    function updateFundingRate(bytes32 market) external onlyRole(UPDATER_ROLE) {
        FundingState storage state = fundingStates[market];
        require(
            block.timestamp >= state.lastUpdateTime + FUNDING_EPOCH,
            "FundingRateModule: too early"
        );

        // Calculate rate based on OI imbalance
        int256 newRate = _calculateFundingRate(state.longOpenInterest, state.shortOpenInterest);
        
        // Update cumulative index
        state.cumulativeFundingIndex += newRate;
        state.currentRate = newRate;
        state.lastUpdateTime = block.timestamp;
        state.fundingEpoch++;

        emit FundingRateUpdated(market, newRate, state.predictedNextRate, block.timestamp);
    }

    /**
     * @notice Calculate pending funding for a user position
     */
    function getPendingFunding(address user, bytes32 market) external view returns (int256) {
        FundingState storage state = fundingStates[market];
        int256 userIndex = userFundingIndex[user][market];
        int256 indexDelta = state.cumulativeFundingIndex - userIndex;
        
        // In production: multiply by position size
        // Simplified here for interface compatibility
        return indexDelta;
    }

    /**
     * @notice Settle funding for a user (called by PerpEngine on position events)
     */
    function settleFunding(address user, bytes32 market, uint256 positionSize, bool isLong) 
        external onlyRole(UPDATER_ROLE) returns (int256 fundingPayment) {
        FundingState storage state = fundingStates[market];
        int256 userIndex = userFundingIndex[user][market];
        int256 indexDelta = state.cumulativeFundingIndex - userIndex;
        
        // Longs pay shorts when rate is positive; reverse when negative
        fundingPayment = (indexDelta * int256(positionSize)) / 1e18;
        if (!isLong) fundingPayment = -fundingPayment;
        
        userFundingIndex[user][market] = state.cumulativeFundingIndex;
    }

    /**
     * @notice AI oracle pushes predicted next funding rate
     * @dev Used for predictive visualization in the frontend
     */
    function updatePredictedFunding(
        bytes32 market,
        int256 predictedRate,
        uint256 confidence
    ) external onlyRole(AI_ORACLE_ROLE) {
        FundingState storage state = fundingStates[market];
        state.predictedNextRate = predictedRate;
        emit PredictedFundingUpdated(market, predictedRate, confidence);
    }

    /**
     * @notice Update open interest (called by PerpEngine on position open/close)
     */
    function updateOpenInterest(
        bytes32 market,
        uint256 longOI,
        uint256 shortOI
    ) external onlyRole(UPDATER_ROLE) {
        FundingState storage state = fundingStates[market];
        state.longOpenInterest = longOI;
        state.shortOpenInterest = shortOI;
        emit OpenInterestUpdated(market, longOI, shortOI);
    }

    // ── Internal ──────────────────────────────────────────────────────────

    /**
     * @notice Funding rate = BASE + imbalance factor
     * @dev When longs > shorts: longs pay shorts (positive rate)
     *      When shorts > longs: shorts pay longs (negative rate)
     */
    function _calculateFundingRate(uint256 longOI, uint256 shortOI) internal pure returns (int256) {
        if (longOI == 0 && shortOI == 0) return 0;
        
        int256 totalOI = int256(longOI + shortOI);
        int256 imbalance = int256(longOI) - int256(shortOI);
        
        // Imbalance factor: normalized by total OI, scaled to max rate
        int256 imbalanceFactor = (imbalance * int256(MAX_FUNDING_RATE)) / totalOI;
        int256 rate = BASE_FUNDING_RATE + imbalanceFactor;
        
        // Clamp to min/max
        if (rate > MAX_FUNDING_RATE) return MAX_FUNDING_RATE;
        if (rate < MIN_FUNDING_RATE) return MIN_FUNDING_RATE;
        return rate;
    }

    // ── Views ─────────────────────────────────────────────────────────────

    function getFundingState(bytes32 market) external view returns (FundingState memory) {
        return fundingStates[market];
    }

    function getTimeToNextFunding(bytes32 market) external view returns (uint256) {
        FundingState storage state = fundingStates[market];
        uint256 nextFunding = state.lastUpdateTime + FUNDING_EPOCH;
        if (block.timestamp >= nextFunding) return 0;
        return nextFunding - block.timestamp;
    }

    function getFundingHistory(bytes32 market) external view returns (int256 rate, uint256 epoch) {
        FundingState storage state = fundingStates[market];
        return (state.currentRate, state.fundingEpoch);
    }
}
