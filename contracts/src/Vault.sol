// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title Vault
 * @notice Custody of all collateral. Single source of truth for balances.
 * @dev Only authorized modules (PerpEngine, LiquidationEngine) can move funds.
 */
contract Vault is ReentrancyGuard, AccessControl, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant ENGINE_ROLE = keccak256("ENGINE_ROLE");
    bytes32 public constant LIQUIDATOR_ROLE = keccak256("LIQUIDATOR_ROLE");
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");

    // ── State ─────────────────────────────────────────────────────────────

    mapping(address => mapping(address => uint256)) public userBalance; // user → token → amount
    mapping(address => bool) public supportedTokens;
    mapping(address => uint256) public insuranceFund;

    uint256 public constant MAX_WITHDRAWAL_PER_BLOCK = 1_000_000e18;
    uint256 public totalInsuranceFund;

    // ── Events ────────────────────────────────────────────────────────────

    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event InsuranceFundContribution(address indexed token, uint256 amount);
    event InsuranceFundUsed(uint256 amount, string reason);
    event TokenSupported(address indexed token, bool supported);

    // ── Constructor ───────────────────────────────────────────────────────

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GOVERNANCE_ROLE, admin);
    }

    // ── User Functions ────────────────────────────────────────────────────

    /**
     * @notice Deposit collateral into the vault
     */
    function deposit(address token, uint256 amount) external nonReentrant whenNotPaused {
        require(supportedTokens[token], "Vault: unsupported token");
        require(amount > 0, "Vault: zero amount");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        userBalance[msg.sender][token] += amount;

        emit Deposited(msg.sender, token, amount);
    }

    /**
     * @notice Withdraw collateral from the vault
     */
    function withdraw(address token, uint256 amount) external nonReentrant whenNotPaused {
        require(userBalance[msg.sender][token] >= amount, "Vault: insufficient balance");
        
        userBalance[msg.sender][token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, token, amount);
    }

    // ── Engine Functions ──────────────────────────────────────────────────

    /**
     * @notice Transfer funds between users (called by PerpEngine on settlement)
     */
    function transferBetweenUsers(
        address from,
        address to,
        address token,
        uint256 amount
    ) external onlyRole(ENGINE_ROLE) {
        require(userBalance[from][token] >= amount, "Vault: insufficient balance");
        userBalance[from][token] -= amount;
        userBalance[to][token] += amount;
    }

    /**
     * @notice Lock margin for an open position
     */
    function lockMargin(
        address user,
        address token,
        uint256 amount
    ) external onlyRole(ENGINE_ROLE) returns (bool) {
        if (userBalance[user][token] < amount) return false;
        userBalance[user][token] -= amount;
        return true;
    }

    /**
     * @notice Release margin back to user
     */
    function releaseMargin(
        address user,
        address token,
        uint256 amount
    ) external onlyRole(ENGINE_ROLE) {
        userBalance[user][token] += amount;
    }

    /**
     * @notice Called by liquidation engine — moves funds from insolvent user
     */
    function liquidate(
        address insolventUser,
        address token,
        uint256 amount,
        address recipient
    ) external onlyRole(LIQUIDATOR_ROLE) {
        uint256 available = userBalance[insolventUser][token];
        uint256 toMove = amount > available ? available : amount;
        
        userBalance[insolventUser][token] = 0;
        
        if (toMove < amount) {
            // Tap insurance fund for shortfall
            uint256 shortfall = amount - toMove;
            require(insuranceFund[token] >= shortfall, "Vault: insurance fund depleted");
            insuranceFund[token] -= shortfall;
            totalInsuranceFund -= shortfall;
            emit InsuranceFundUsed(shortfall, "liquidation_shortfall");
        }
        
        userBalance[recipient][token] += toMove;
    }

    /**
     * @notice Contribute to insurance fund (protocol fees)
     */
    function contributeToInsuranceFund(address token, uint256 amount) external onlyRole(ENGINE_ROLE) {
        require(userBalance[address(this)][token] >= amount, "Vault: insufficient protocol balance");
        insuranceFund[token] += amount;
        totalInsuranceFund += amount;
        emit InsuranceFundContribution(token, amount);
    }

    // ── Governance ────────────────────────────────────────────────────────

    function setSupportedToken(address token, bool supported) external onlyRole(GOVERNANCE_ROLE) {
        supportedTokens[token] = supported;
        emit TokenSupported(token, supported);
    }

    function pause() external onlyRole(GOVERNANCE_ROLE) { _pause(); }
    function unpause() external onlyRole(GOVERNANCE_ROLE) { _unpause(); }

    // ── Views ─────────────────────────────────────────────────────────────

    function getBalance(address user, address token) external view returns (uint256) {
        return userBalance[user][token];
    }

    function getInsuranceFund(address token) external view returns (uint256) {
        return insuranceFund[token];
    }
}
