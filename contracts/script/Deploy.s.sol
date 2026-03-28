// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/AdPool.sol";
import "../src/AdRegistry.sol";
import "../src/RevenueDistributor.sol";
import "../src/ReputationOracle.sol";

/// @notice Deploys all AdShell contracts to Monad Testnet
/// Usage:
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url https://testnet-rpc.monad.xyz \
///     --private-key $DEPLOYER_PRIVATE_KEY \
///     --broadcast \
///     --verify
contract Deploy is Script {
    // Monad Testnet USDC
    address constant USDC = 0x534b2f3A21130d7a60830c2Df862319e593943A3;

    // 0.001 USDC = 1000 units (6 decimals)
    uint256 constant IMPRESSION_COST = 1000;

    // Minimum deposit: 0.01 USDC = 10000 units
    uint256 constant MINIMUM_DEPOSIT = 10000;

    function run() external {
        // Read deployer key from env
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // Read proxy claimer address (the sponsor wallet from adshell-proxy)
        address proxyClaimer = vm.envAddress("ADSHELL_CLAIMER_ADDRESS");

        // Revenue split recipients (use deployer for all in testnet)
        address treasury = deployer;
        address advertiserRebate = deployer;
        address nodeOperators = deployer;
        address community = deployer;

        console.log("Deployer:", deployer);
        console.log("Proxy Claimer:", proxyClaimer);
        console.log("USDC:", USDC);
        console.log("");

        vm.startBroadcast(deployerKey);

        // 1. Deploy AdPool
        AdPool adPool = new AdPool(USDC, IMPRESSION_COST, MINIMUM_DEPOSIT, proxyClaimer);
        console.log("AdPool deployed:", address(adPool));

        // 2. Deploy AdRegistry
        AdRegistry adRegistry = new AdRegistry();
        console.log("AdRegistry deployed:", address(adRegistry));

        // 3. Deploy RevenueDistributor (this becomes the PAY_TO address!)
        RevenueDistributor revDist = new RevenueDistributor(USDC, treasury, advertiserRebate, nodeOperators, community);
        console.log("RevenueDistributor deployed:", address(revDist));
        console.log("  ^ Use this as ADSHELL_PAY_TO in proxy .env");

        // 4. Deploy ReputationOracle
        ReputationOracle repOracle = new ReputationOracle(proxyClaimer);
        console.log("ReputationOracle deployed:", address(repOracle));

        vm.stopBroadcast();

        // Print summary
        console.log("");
        console.log("====================================");
        console.log("  DEPLOYMENT COMPLETE");
        console.log("====================================");
        console.log("");
        console.log("Update your .env with:");
        console.log(string.concat("  ADSHELL_ADPOOL_ADDRESS=", vm.toString(address(adPool))));
        console.log(string.concat("  ADSHELL_REGISTRY_ADDRESS=", vm.toString(address(adRegistry))));
        console.log(string.concat("  ADSHELL_PAY_TO=", vm.toString(address(revDist))));
        console.log(string.concat("  ADSHELL_REPUTATION_ADDRESS=", vm.toString(address(repOracle))));
        console.log("");
        console.log("Next steps:");
        console.log("  1. Fund AdPool with USDC (deposit via advertiser wallet)");
        console.log("  2. Submit creatives to AdRegistry");
        console.log("  3. Approve creatives via moderator");
        console.log("  4. Start adshell-proxy with updated .env");
    }
}

/// @notice Seeds the deployed contracts with demo data
/// Usage:
///   forge script script/Deploy.s.sol:SeedDemo \
///     --rpc-url https://testnet-rpc.monad.xyz \
///     --private-key $DEPLOYER_PRIVATE_KEY \
///     --broadcast
contract SeedDemo is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address adPoolAddr = vm.envAddress("ADSHELL_ADPOOL_ADDRESS");
        address registryAddr = vm.envAddress("ADSHELL_REGISTRY_ADDRESS");
        address usdc = 0x534b2f3A21130d7a60830c2Df862319e593943A3;

        vm.startBroadcast(deployerKey);

        AdPool pool = AdPool(adPoolAddr);
        AdRegistry registry = AdRegistry(registryAddr);

        // 1. Approve USDC spending and deposit into AdPool
        IERC20(usdc).approve(adPoolAddr, type(uint256).max);
        uint256 usdcBalance = IERC20(usdc).balanceOf(vm.addr(deployerKey));
        if (usdcBalance > 0) {
            uint256 depositAmount = usdcBalance > 500000 ? 500000 : usdcBalance; // 0.5 USDC max
            pool.deposit(depositAmount);
            console.log("Deposited into AdPool:", depositAmount);
        }

        // 2. Submit and approve demo creatives
        string[] memory kuruLines = new string[](6);
        kuruLines[0] = unicode"██╗  ██╗██╗   ██╗██████╗ ██╗   ██╗";
        kuruLines[1] = unicode"██║ ██╔╝██║   ██║██╔══██╗██║   ██║";
        kuruLines[2] = unicode"█████╔╝ ██║   ██║██████╔╝██║   ██║";
        kuruLines[3] = unicode"██╔═██╗ ██║   ██║██╔══██╗██║   ██║";
        kuruLines[4] = unicode"██║  ██╗╚██████╔╝██║  ██║╚██████╔╝";
        kuruLines[5] = "Ship faster on Monad-native infra.";

        registry.submitCreative(
            kuruLines,
            "Build On Monad - 10,000 TPS, Sub-second Finality",
            "Kuru",
            "web3,defi,monad,infrastructure",
            "https://kuru.io"
        );
        registry.approveCreative(vm.addr(deployerKey));
        console.log("Demo creative submitted and approved");

        vm.stopBroadcast();

        console.log("");
        console.log("Demo seed complete!");
        console.log("AdPool balance:", pool.balances(vm.addr(deployerKey)));
    }
}
