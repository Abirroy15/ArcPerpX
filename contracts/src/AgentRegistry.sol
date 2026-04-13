// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AgentRegistry
 * @notice On-chain registry for AI trading agents. Each agent is an NFT with Strategy DNA.
 * @dev Strategy DNA is a bytes32 hash of the encoded strategy vector stored off-chain (IPFS).
 */
contract AgentRegistry is ERC721, AccessControl, ReentrancyGuard {

    bytes32 public constant TRAINER_ROLE = keccak256("TRAINER_ROLE");
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");

    // ── Data Structures ───────────────────────────────────────────────────

    enum AgentStatus { ACTIVE, PAUSED, RETIRED, BREEDING }

    struct AgentDNA {
        bytes32 strategyHash;       // IPFS CID or hash of strategy vector
        uint256 generation;         // 0 = genesis, increments on breed
        uint256[] parentIds;        // parent agent IDs (empty for genesis)
        uint256 mutationRate;       // 0-10000 bps; how aggressively it evolves
        uint256 riskTolerance;      // 0-10000; conservative to aggressive
        uint256 timeHorizon;        // target hold duration in seconds
        bytes32 specialization;     // keccak256 of market it specializes in
    }

    struct AgentStats {
        uint256 totalTrades;
        uint256 winningTrades;
        int256 totalPnl;            // cumulative PnL in USDC (1e6)
        uint256 sharpeRatio;        // x100 (e.g., 250 = 2.50)
        uint256 maxDrawdown;        // bps
        uint256 xpPoints;
        uint256 lastTradeTimestamp;
        uint256 generationsFit;     // how many RL cycles survived
    }

    struct Agent {
        uint256 id;
        address owner;
        string name;
        AgentDNA dna;
        AgentStats stats;
        AgentStatus status;
        uint256 createdAt;
        bool isTradeable;           // listed in marketplace
        uint256 listPrice;          // price if for sale
        uint256 copyFee;            // fee to copy-trade this agent (per 30 days)
    }

    // ── State ─────────────────────────────────────────────────────────────

    mapping(uint256 => Agent) public agents;
    mapping(address => uint256[]) public ownerAgents;
    mapping(uint256 => address[]) public agentFollowers; // copy-traders
    
    uint256 public nextAgentId = 1;
    uint256 public breedingFee = 0.01 ether;
    uint256 public creationFee = 0.005 ether;
    uint256 public protocolCut = 1000; // 10% of copy fees

    address public treasury;

    // ── Events ────────────────────────────────────────────────────────────

    event AgentCreated(uint256 indexed agentId, address indexed owner, string name, bytes32 strategyHash);
    event AgentBred(uint256 indexed childId, uint256 indexed parent1, uint256 indexed parent2, address owner);
    event AgentEvolved(uint256 indexed agentId, bytes32 newStrategyHash, uint256 generation);
    event AgentListed(uint256 indexed agentId, uint256 price, uint256 copyFee);
    event AgentSold(uint256 indexed agentId, address from, address to, uint256 price);
    event AgentCopied(uint256 indexed agentId, address follower, uint256 fee);
    event StatsUpdated(uint256 indexed agentId, int256 pnl, bool won);
    event XPAwarded(uint256 indexed agentId, uint256 xp, string reason);

    // ── Constructor ───────────────────────────────────────────────────────

    constructor(address admin, address _treasury) ERC721("ArcPerpX Agent", "AGNT") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GOVERNANCE_ROLE, admin);
        _grantRole(TRAINER_ROLE, admin);
        treasury = _treasury;
    }

    // ── Agent Creation ────────────────────────────────────────────────────

    /**
     * @notice Create a genesis agent with custom strategy DNA
     */
    function createAgent(
        string calldata name,
        bytes32 strategyHash,
        uint256 mutationRate,
        uint256 riskTolerance,
        uint256 timeHorizon,
        bytes32 specialization
    ) external payable nonReentrant returns (uint256 agentId) {
        require(msg.value >= creationFee, "AgentRegistry: insufficient fee");
        require(mutationRate <= 10000, "AgentRegistry: invalid mutation rate");
        require(riskTolerance <= 10000, "AgentRegistry: invalid risk tolerance");

        agentId = nextAgentId++;

        uint256[] memory emptyParents;
        agents[agentId] = Agent({
            id: agentId,
            owner: msg.sender,
            name: name,
            dna: AgentDNA({
                strategyHash: strategyHash,
                generation: 0,
                parentIds: emptyParents,
                mutationRate: mutationRate,
                riskTolerance: riskTolerance,
                timeHorizon: timeHorizon,
                specialization: specialization
            }),
            stats: AgentStats({
                totalTrades: 0,
                winningTrades: 0,
                totalPnl: 0,
                sharpeRatio: 0,
                maxDrawdown: 0,
                xpPoints: 0,
                lastTradeTimestamp: 0,
                generationsFit: 0
            }),
            status: AgentStatus.ACTIVE,
            createdAt: block.timestamp,
            isTradeable: false,
            listPrice: 0,
            copyFee: 0
        });

        ownerAgents[msg.sender].push(agentId);
        _safeMint(msg.sender, agentId);
        
        // Send fee to treasury
        (bool sent,) = treasury.call{value: msg.value}("");
        require(sent, "AgentRegistry: fee transfer failed");

        emit AgentCreated(agentId, msg.sender, name, strategyHash);
    }

    /**
     * @notice Breed two agents to create a child with combined DNA
     * @dev Child DNA is a weighted average of parents, with random mutation
     */
    function breedAgents(
        uint256 parent1Id,
        uint256 parent2Id,
        string calldata childName
    ) external payable nonReentrant returns (uint256 childId) {
        require(msg.value >= breedingFee, "AgentRegistry: insufficient breeding fee");
        require(ownerOf(parent1Id) == msg.sender, "AgentRegistry: not parent1 owner");
        
        Agent storage p1 = agents[parent1Id];
        Agent storage p2 = agents[parent2Id];
        
        require(p1.status == AgentStatus.ACTIVE, "AgentRegistry: parent1 not active");
        require(p2.status == AgentStatus.ACTIVE, "AgentRegistry: parent2 not active");
        require(p1.dna.generation < 10, "AgentRegistry: max generation reached");

        childId = nextAgentId++;

        // DNA combination: inherit from higher-performing parent
        uint256 p1Weight = p1.stats.sharpeRatio + 1;
        uint256 p2Weight = p2.stats.sharpeRatio + 1;
        uint256 totalWeight = p1Weight + p2Weight;

        uint256 childMutation = (p1.dna.mutationRate * p1Weight + p2.dna.mutationRate * p2Weight) / totalWeight;
        uint256 childRisk = (p1.dna.riskTolerance * p1Weight + p2.dna.riskTolerance * p2Weight) / totalWeight;

        // Slight mutation on breeding
        uint256 mutationRoll = uint256(keccak256(abi.encodePacked(block.timestamp, childId))) % 1000;
        if (mutationRoll < childMutation / 10) {
            childRisk = childRisk + (childRisk * 500 / 10000); // +5% deviation
        }

        uint256[] memory parents = new uint256[](2);
        parents[0] = parent1Id;
        parents[1] = parent2Id;

        // Strategy hash is combined off-chain by AI engine, stored via updateStrategyDNA
        bytes32 combinedHash = keccak256(abi.encodePacked(p1.dna.strategyHash, p2.dna.strategyHash));

        agents[childId] = Agent({
            id: childId,
            owner: msg.sender,
            name: childName,
            dna: AgentDNA({
                strategyHash: combinedHash,
                generation: _max(p1.dna.generation, p2.dna.generation) + 1,
                parentIds: parents,
                mutationRate: childMutation,
                riskTolerance: childRisk,
                timeHorizon: (p1.dna.timeHorizon + p2.dna.timeHorizon) / 2,
                specialization: p1.stats.totalPnl > p2.stats.totalPnl ? p1.dna.specialization : p2.dna.specialization
            }),
            stats: AgentStats(0, 0, 0, 0, 0, 0, 0, 0),
            status: AgentStatus.ACTIVE,
            createdAt: block.timestamp,
            isTradeable: false,
            listPrice: 0,
            copyFee: 0
        });

        ownerAgents[msg.sender].push(childId);
        _safeMint(msg.sender, childId);

        (bool sent,) = treasury.call{value: msg.value}("");
        require(sent, "AgentRegistry: fee transfer failed");

        emit AgentBred(childId, parent1Id, parent2Id, msg.sender);
    }

    /**
     * @notice Update agent's strategy DNA after RL training cycle
     * @dev Only callable by TRAINER_ROLE (AI engine backend)
     */
    function evolveAgent(
        uint256 agentId,
        bytes32 newStrategyHash,
        uint256 newSharpeRatio,
        uint256 newDrawdown
    ) external onlyRole(TRAINER_ROLE) {
        Agent storage agent = agents[agentId];
        require(agent.status == AgentStatus.ACTIVE, "AgentRegistry: agent not active");

        agent.dna.strategyHash = newStrategyHash;
        agent.dna.generation++;
        agent.stats.sharpeRatio = newSharpeRatio;
        agent.stats.maxDrawdown = newDrawdown;
        agent.stats.generationsFit++;

        emit AgentEvolved(agentId, newStrategyHash, agent.dna.generation);
    }

    /**
     * @notice Update agent stats after a trade
     */
    function recordTrade(
        uint256 agentId,
        int256 pnl,
        bool won
    ) external onlyRole(TRAINER_ROLE) {
        Agent storage agent = agents[agentId];
        agent.stats.totalTrades++;
        if (won) agent.stats.winningTrades++;
        agent.stats.totalPnl += pnl;
        agent.stats.lastTradeTimestamp = block.timestamp;

        // XP system
        uint256 xpGained = won ? 100 + uint256(pnl > 0 ? uint256(pnl) / 1e4 : 0) : 10;
        agent.stats.xpPoints += xpGained;

        emit StatsUpdated(agentId, pnl, won);
        emit XPAwarded(agentId, xpGained, won ? "winning_trade" : "trade_attempt");
    }

    // ── Marketplace ───────────────────────────────────────────────────────

    function listAgent(uint256 agentId, uint256 price, uint256 _copyFee) external {
        require(ownerOf(agentId) == msg.sender, "AgentRegistry: not owner");
        Agent storage agent = agents[agentId];
        agent.isTradeable = true;
        agent.listPrice = price;
        agent.copyFee = _copyFee;
        emit AgentListed(agentId, price, _copyFee);
    }

    function buyAgent(uint256 agentId) external payable nonReentrant {
        Agent storage agent = agents[agentId];
        require(agent.isTradeable && agent.listPrice > 0, "AgentRegistry: not for sale");
        require(msg.value >= agent.listPrice, "AgentRegistry: insufficient payment");

        address seller = ownerOf(agentId);
        uint256 protocolFee = (msg.value * protocolCut) / 10000;
        uint256 sellerProceeds = msg.value - protocolFee;

        _transfer(seller, msg.sender, agentId);
        agent.owner = msg.sender;
        agent.isTradeable = false;

        (bool s1,) = seller.call{value: sellerProceeds}("");
        (bool s2,) = treasury.call{value: protocolFee}("");
        require(s1 && s2, "AgentRegistry: payment failed");

        emit AgentSold(agentId, seller, msg.sender, msg.value);
    }

    function copyTradeAgent(uint256 agentId) external payable nonReentrant {
        Agent storage agent = agents[agentId];
        require(agent.copyFee > 0, "AgentRegistry: not available for copy");
        require(msg.value >= agent.copyFee, "AgentRegistry: insufficient copy fee");

        agentFollowers[agentId].push(msg.sender);

        address agentOwner = ownerOf(agentId);
        uint256 protocolFee = (msg.value * protocolCut) / 10000;
        uint256 ownerFee = msg.value - protocolFee;

        (bool s1,) = agentOwner.call{value: ownerFee}("");
        (bool s2,) = treasury.call{value: protocolFee}("");
        require(s1 && s2, "AgentRegistry: payment failed");

        emit AgentCopied(agentId, msg.sender, msg.value);
    }

    // ── Views ─────────────────────────────────────────────────────────────

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        return agents[agentId];
    }

    function getOwnerAgents(address owner) external view returns (uint256[] memory) {
        return ownerAgents[owner];
    }

    function getTopAgentsByPnl(uint256 limit) external view returns (uint256[] memory) {
        // In production: off-chain indexed, on-chain verify
        // Simplified: returns first N agent IDs
        uint256 count = nextAgentId - 1 < limit ? nextAgentId - 1 : limit;
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = i + 1;
        }
        return result;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // ── Internal ──────────────────────────────────────────────────────────

    function _max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a : b;
    }
}
