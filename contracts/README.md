# AdShell Smart Contracts

Four Solidity contracts powering the AdShell attention-economy protocol on Monad.

## Contracts

| Contract | Purpose | Key Functions |
|----------|---------|---------------|
| **AdPool.sol** | Escrow + impression payouts | `deposit()`, `withdraw()`, `claimImpression()` |
| **AdRegistry.sol** | On-chain ad creatives | `submitCreative()`, `approveCreative()`, `getAsciiArt()` |
| **RevenueDistributor.sol** | x402 payment splitting | `distribute()`, `distributeAll()`, `updateSplits()` |
| **ReputationOracle.sol** | Trust scoring | `recordClaim()`, `flagUser()`, `userScore()` |

## Architecture

```
Advertiser → AdPool.deposit(USDC)
                     ↓
User watches ad → Proxy calls AdPool.claimImpression(user)
                     ↓ USDC flows from AdPool → user wallet
User makes AI call → x402 payment → RevenueDistributor
                     ↓ Split: 50% Treasury, 30% Rebate, 15% Ops, 5% Community
Proxy reports → ReputationOracle.recordClaim() / recordPayment()
```

## Build

```bash
forge build
```

## Test

```bash
forge test
```

All 16 tests pass covering: deposits, withdrawals, impression claims, advertiser depletion, daily budget caps, pause/unpause, creative submission/approval/rejection, revenue distribution, reputation scoring, throttling, and a full integration test.

## Deploy to Monad Testnet

```bash
# Set environment
export DEPLOYER_PRIVATE_KEY=0x...
export ADSHELL_CLAIMER_ADDRESS=0x...  # Sponsor wallet address

# Deploy
./deploy.sh

# Or manually:
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast
```

## Contract Details

### AdPool.sol
- Holds advertiser USDC in escrow
- Round-robin queue rotates between active advertisers
- Only authorized claimers (proxy hot wallets) can trigger payouts
- Daily budget caps per advertiser
- Emergency pause function
- Auto-removes depleted advertisers from queue

### AdRegistry.sol
- ASCII art stored directly on-chain (no IPFS required)
- Creative submission → moderation → approval flow
- Advertiser can pause/unpause their own campaigns
- Owner can block malicious advertisers

### RevenueDistributor.sol
- Deployed as the `ADSHELL_PAY_TO` address for x402 middleware
- Configurable basis-point splits (must sum to 10000)
- Handles rounding by giving remainder to last recipient

### ReputationOracle.sol
- Tracks claim-to-payment ratio for fraud detection
- Auto-throttles users with 5+ fraud flags
- Advertiser scores based on deposits, impressions, and longevity
- Owner can manually unthrottle users (appeals)

## Gas Costs (Monad)

| Operation | Gas | Est. Cost |
|-----------|-----|-----------|
| `deposit()` | ~180K | ~$0.0001 |
| `claimImpression()` | ~300K | ~$0.0002 |
| `submitCreative()` | ~300K+ | ~$0.0002 |
| `distribute()` | ~320K | ~$0.0002 |

Monad's near-zero gas makes every micropayment economically viable.