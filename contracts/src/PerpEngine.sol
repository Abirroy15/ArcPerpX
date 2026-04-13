// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./Vault.sol";
import "./MarginManager.sol";
import "./FundingRateModule.sol";
import "./interfaces/IOracle.sol";

/**
 * @title PerpEngine
 * @notice Core perpetual futures engine. Handles position lifecycle.
 * @dev Off-chain order matching, on-chain settlement pattern.
 */
contract PerpEngine is ReentrancyGuard, AccessControl, Pausable {

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");

    // ── Data Structures ───────────────────────────────────────────────────

    enum Side { LONG, SHORT }
    enum MarginMode { CROSS, ISOLATED }

    struct Position {
        address trader;
        bytes32 market;          // e.g. keccak256("ETH-USD")
        Side side;
        MarginMode marginMode;
        uint256 size;            // in base units (1e18 = 1 contract)
        uint256 entryPrice;      // 1e18 scale
        uint256 margin;          // collateral locked
        uint256 leverage;        // 1x-50x, stored as 1e2 (100 = 1x)
        uint256 openTimestamp;
        int256 fundingAccrued;   // accumulated funding (can be negative)
        bool isOpen;
    }

    struct Market {
        bytes32 id;
        string symbol;
        address oracle;
        uint256 maxLeverage;     // 50x = 5000
        uint256 minSize;
        uint256 takerFee;        // bps, 10 = 0.10%
        uint256 makerFee;        // bps
        uint256 liquidationFee;  // bps
        bool isActive;
    }

    struct TradeParams {
        bytes32 market;
        Side side;
        MarginMode marginMode;
        uint256 size;
        uint256 price;           // limit price (0 = market)
        uint256 leverage;
        address collateralToken;
        bytes signature;         // relayer signature over order hash
    }

    // ── State ─────────────────────────────────────────────────────────────

    Vault public vault;
    MarginManager public marginManager;
    FundingRateModule public fundingModule;

    mapping(bytes32 => Position) public positions;     // positionId → Position
    mapping(bytes32 => Market) public markets;
    mapping(address => bytes32[]) public userPositions;

    uint256 public nextPositionId;
    address public protocolFeeRecipient;
    uint256 public protocolFeeShare = 2000; // 20% of fees go to protocol

    // ── Events ────────────────────────────────────────────────────────────

    event PositionOpened(
        bytes32 indexed positionId,
        address indexed trader,
        bytes32 indexed market,
        Side side,
        uint256 size,
        uint256 entryPrice,
        uint256 leverage
    );

    event PositionClosed(
        bytes32 indexed positionId,
        address indexed trader,
        int256 pnl,
        uint256 exitPrice,
        uint256 timestamp
    );

    event PositionIncreased(bytes32 indexed positionId, uint256 additionalSize, uint256 newEntryPrice);
    event PositionDecreased(bytes32 indexed positionId, uint256 reducedSize, int256 realizedPnl);
    event StopLossTriggered(bytes32 indexed positionId, uint256 triggerPrice);
    event TakeProfitTriggered(bytes32 indexed positionId, uint256 triggerPrice);
    event MarketAdded(bytes32 indexed marketId, string symbol);
    event FundingSettled(bytes32 indexed positionId, int256 fundingAmount);

    // ── Constructor ───────────────────────────────────────────────────────

    constructor(
        address _vault,
        address _marginManager,
        address _fundingModule,
        address _admin
    ) {
        vault = Vault(_vault);
        marginManager = MarginManager(_marginManager);
        fundingModule = FundingRateModule(_fundingModule);
        protocolFeeRecipient = _admin;
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(GOVERNANCE_ROLE, _admin);
    }

    // ── Core Trading Functions ────────────────────────────────────────────

    /**
     * @notice Open a new perpetual position
     * @dev Called by relayer after off-chain matching, or directly for market orders
     */
    function openPosition(
        TradeParams calldata params,
        address trader
    ) external nonReentrant whenNotPaused onlyRole(RELAYER_ROLE) returns (bytes32 positionId) {
        Market storage market = markets[params.market];
        require(market.isActive, "PerpEngine: market inactive");
        require(params.leverage <= market.maxLeverage, "PerpEngine: leverage too high");
        require(params.size >= market.minSize, "PerpEngine: size too small");

        // Get current oracle price
        uint256 currentPrice = IOracle(market.oracle).getPrice(params.market);
        uint256 executionPrice = params.price == 0 ? currentPrice : params.price;

        // Validate slippage for market orders
        if (params.price == 0) {
            executionPrice = currentPrice;
        }

        // Calculate required margin
        uint256 notionalValue = (params.size * executionPrice) / 1e18;
        uint256 requiredMargin = (notionalValue * 1e4) / params.leverage; // leverage in bps

        // Settle pending funding for cross margin
        _settleFunding(trader, params.market);

        // Lock margin in vault
        bool locked = vault.lockMargin(trader, params.collateralToken, requiredMargin);
        require(locked, "PerpEngine: insufficient margin");

        // Charge opening fee
        uint256 fee = (notionalValue * market.takerFee) / 10000;
        _chargeAndDistributeFee(trader, params.collateralToken, fee);

        // Create position
        positionId = keccak256(abi.encodePacked(trader, params.market, block.timestamp, nextPositionId++));
        
        positions[positionId] = Position({
            trader: trader,
            market: params.market,
            side: params.side,
            marginMode: params.marginMode,
            size: params.size,
            entryPrice: executionPrice,
            margin: requiredMargin - fee,
            leverage: params.leverage,
            openTimestamp: block.timestamp,
            fundingAccrued: 0,
            isOpen: true
        });

        userPositions[trader].push(positionId);

        emit PositionOpened(positionId, trader, params.market, params.side, params.size, executionPrice, params.leverage);
    }

    /**
     * @notice Close an existing position
     */
    function closePosition(
        bytes32 positionId,
        address trader
    ) external nonReentrant onlyRole(RELAYER_ROLE) {
        Position storage pos = positions[positionId];
        require(pos.isOpen, "PerpEngine: position not open");
        require(pos.trader == trader, "PerpEngine: not owner");

        Market storage market = markets[pos.market];
        uint256 exitPrice = IOracle(market.oracle).getPrice(pos.market);

        // Settle funding
        int256 fundingPnl = _settleFunding(trader, pos.market);

        // Calculate PnL
        int256 pricePnl;
        if (pos.side == Side.LONG) {
            pricePnl = int256(exitPrice) - int256(pos.entryPrice);
        } else {
            pricePnl = int256(pos.entryPrice) - int256(exitPrice);
        }

        int256 totalPnl = (pricePnl * int256(pos.size)) / 1e18 + fundingPnl;

        // Calculate closing fee
        uint256 notionalValue = (pos.size * exitPrice) / 1e18;
        uint256 fee = (notionalValue * market.takerFee) / 10000;

        // Settle: release margin ± PnL
        uint256 returnAmount = pos.margin;
        if (totalPnl > 0) {
            returnAmount += uint256(totalPnl);
            // Pull profit from counterparty pool (vault global balance)
        } else if (totalPnl < 0) {
            uint256 loss = uint256(-totalPnl);
            returnAmount = loss >= returnAmount ? 0 : returnAmount - loss;
        }

        returnAmount = returnAmount > fee ? returnAmount - fee : 0;

        pos.isOpen = false;
        vault.releaseMargin(trader, _getCollateralToken(pos.market), returnAmount);

        emit PositionClosed(positionId, trader, totalPnl, exitPrice, block.timestamp);
    }

    /**
     * @notice Partially increase a position size
     */
    function increasePosition(
        bytes32 positionId,
        uint256 additionalSize,
        address trader
    ) external nonReentrant onlyRole(RELAYER_ROLE) {
        Position storage pos = positions[positionId];
        require(pos.isOpen && pos.trader == trader, "PerpEngine: invalid position");

        Market storage market = markets[pos.market];
        uint256 currentPrice = IOracle(market.oracle).getPrice(pos.market);

        // New average entry price
        uint256 newEntryPrice = ((pos.size * pos.entryPrice) + (additionalSize * currentPrice)) 
                                / (pos.size + additionalSize);
        
        uint256 additionalMargin = (additionalSize * currentPrice) / pos.leverage;
        vault.lockMargin(trader, _getCollateralToken(pos.market), additionalMargin);

        pos.size += additionalSize;
        pos.entryPrice = newEntryPrice;
        pos.margin += additionalMargin;

        emit PositionIncreased(positionId, additionalSize, newEntryPrice);
    }

    // ── Internal Functions ────────────────────────────────────────────────

    function _settleFunding(address trader, bytes32 market) internal returns (int256 fundingAmount) {
        fundingAmount = fundingModule.getPendingFunding(trader, market);
        if (fundingAmount != 0) {
            emit FundingSettled(keccak256(abi.encodePacked(trader, market)), fundingAmount);
        }
    }

    function _chargeAndDistributeFee(address trader, address token, uint256 fee) internal {
        // Protocol share
        uint256 protocolShare = (fee * protocolFeeShare) / 10000;
        // Remainder goes to insurance fund
        uint256 insuranceShare = fee - protocolShare;
        vault.contributeToInsuranceFund(token, insuranceShare);
    }

    function _getCollateralToken(bytes32 market) internal pure returns (address) {
        // In production: lookup from market config
        // For MVP: return USDC address
        return address(0); // placeholder
    }

    // ── Governance ────────────────────────────────────────────────────────

    function addMarket(
        string calldata symbol,
        address oracle,
        uint256 maxLeverage,
        uint256 minSize,
        uint256 takerFee,
        uint256 makerFee
    ) external onlyRole(GOVERNANCE_ROLE) {
        bytes32 marketId = keccak256(abi.encodePacked(symbol));
        markets[marketId] = Market({
            id: marketId,
            symbol: symbol,
            oracle: oracle,
            maxLeverage: maxLeverage,
            minSize: minSize,
            takerFee: takerFee,
            makerFee: makerFee,
            liquidationFee: 50, // 0.5%
            isActive: true
        });
        emit MarketAdded(marketId, symbol);
    }

    function pause() external onlyRole(GOVERNANCE_ROLE) { _pause(); }
    function unpause() external onlyRole(GOVERNANCE_ROLE) { _unpause(); }

    // ── Views ─────────────────────────────────────────────────────────────

    function getPosition(bytes32 positionId) external view returns (Position memory) {
        return positions[positionId];
    }

    function getUserPositions(address trader) external view returns (bytes32[] memory) {
        return userPositions[trader];
    }

    function getUnrealizedPnl(bytes32 positionId) external view returns (int256) {
        Position storage pos = positions[positionId];
        if (!pos.isOpen) return 0;
        
        uint256 currentPrice = IOracle(markets[pos.market].oracle).getPrice(pos.market);
        int256 priceDiff = pos.side == Side.LONG
            ? int256(currentPrice) - int256(pos.entryPrice)
            : int256(pos.entryPrice) - int256(currentPrice);
        
        return (priceDiff * int256(pos.size)) / 1e18;
    }
}
