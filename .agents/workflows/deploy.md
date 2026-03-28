---
description: Deploy AdShell contracts to Monad testnet and start the proxy
---

# AdShell Deployment Workflow

## Prerequisites
- Foundry installed (`forge`, `cast`)
- Sponsor wallet has testnet MON for gas  
- Sponsor wallet has testnet USDC for seeding

## Step 1: Fund the Sponsor Wallet with MON

Go to https://faucet.monad.xyz and request MON for:
```
0x339a6c81C5d382DDB18b3A660C8c125741695931
```

Verify balance:
```bash
cast balance 0x339a6c81C5d382DDB18b3A660C8c125741695931 --rpc-url https://testnet-rpc.monad.xyz --ether
```

## Step 2: Deploy All Contracts

// turbo
```bash
cd /home/raj/Documents/CODING/Hackathon/MonadBlitz/Adshell/opencode/contracts && \
  DEPLOYER_PRIVATE_KEY=0xd58419c3e42fe8743c6f5e57231a97301849626286c425b48240ce095fd608a4 \
  ADSHELL_CLAIMER_ADDRESS=0x339a6c81C5d382DDB18b3A660C8c125741695931 \
  forge script script/Deploy.s.sol:Deploy \
    --rpc-url https://testnet-rpc.monad.xyz \
    --private-key 0xd58419c3e42fe8743c6f5e57231a97301849626286c425b48240ce095fd608a4 \
    --broadcast \
    --skip-simulation
```

## Step 3: Update .env with Deployed Addresses

Copy the contract addresses from the deploy output and update:
```
/home/raj/Documents/CODING/Hackathon/MonadBlitz/Adshell/opencode/adshell-proxy/.env
```

Set:
- `ADSHELL_ADPOOL_ADDRESS=<deployed AdPool address>`
- `ADSHELL_REGISTRY_ADDRESS=<deployed AdRegistry address>`
- `ADSHELL_REPUTATION_ADDRESS=<deployed ReputationOracle address>`
- `ADSHELL_PAY_TO=<deployed RevenueDistributor address>`

## Step 4: Seed Demo Data

// turbo
```bash
cd /home/raj/Documents/CODING/Hackathon/MonadBlitz/Adshell/opencode/contracts && \
  DEPLOYER_PRIVATE_KEY=0xd58419c3e42fe8743c6f5e57231a97301849626286c425b48240ce095fd608a4 \
  ADSHELL_ADPOOL_ADDRESS=<from step 2> \
  ADSHELL_REGISTRY_ADDRESS=<from step 2> \
  forge script script/Deploy.s.sol:SeedDemo \
    --rpc-url https://testnet-rpc.monad.xyz \
    --private-key 0xd58419c3e42fe8743c6f5e57231a97301849626286c425b48240ce095fd608a4 \
    --broadcast \
    --skip-simulation
```

## Step 5: Start the Proxy

// turbo
```bash
cd /home/raj/Documents/CODING/Hackathon/MonadBlitz/Adshell/opencode/adshell-proxy && bun run dev
```

## Step 6: Verify Health

// turbo
```bash
curl -s http://localhost:4021/health | jq .
```

## Step 7: Test Ad Flow

// turbo
```bash
# Fetch an ad
curl -s "http://localhost:4021/ad/current?wallet=0x339a6c81C5d382DDB18b3A660C8c125741695931&session=test-1" | jq .
```

## Step 8: Run OpenCode

// turbo
```bash
cd /home/raj/Documents/CODING/Hackathon/MonadBlitz/Adshell/opencode && bun run dev
```

Select "adshell" provider → "adshell-demo" model → type a prompt → should see ad dialog!
