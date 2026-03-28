#!/bin/bash
# AdShell — Deploy all contracts to Monad Testnet
#
# Prerequisites:
#   1. foundry installed (forge, cast)
#   2. Deployer wallet has MON for gas
#   3. Deployer wallet has testnet USDC for seeding
#
# Usage:
#   export DEPLOYER_PRIVATE_KEY=0x...
#   export ADSHELL_CLAIMER_ADDRESS=0x...  (sponsor wallet address from proxy .env)
#   ./deploy.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

RPC_URL="https://testnet-rpc.monad.xyz"
USDC="0x534b2f3A21130d7a60830c2Df862319e593943A3"

# Check environment
if [ -z "${DEPLOYER_PRIVATE_KEY:-}" ]; then
    echo "❌ DEPLOYER_PRIVATE_KEY not set"
    echo "   export DEPLOYER_PRIVATE_KEY=0x..."
    exit 1
fi

if [ -z "${ADSHELL_CLAIMER_ADDRESS:-}" ]; then
    echo "❌ ADSHELL_CLAIMER_ADDRESS not set"
    echo "   This is the sponsor wallet ADDRESS from your adshell-proxy/.env"
    echo "   export ADSHELL_CLAIMER_ADDRESS=0x..."
    exit 1
fi

echo "════════════════════════════════════════"
echo "  AdShell Contract Deployment"
echo "════════════════════════════════════════"
echo ""
echo "  RPC:     $RPC_URL"
echo "  USDC:    $USDC"
echo "  Claimer: $ADSHELL_CLAIMER_ADDRESS"
echo ""

# Build first
echo "▶ Building contracts..."
forge build --force 2>&1 | tail -3
echo ""

# Deploy
echo "▶ Deploying to Monad Testnet..."
forge script script/Deploy.s.sol:Deploy \
    --rpc-url "$RPC_URL" \
    --private-key "$DEPLOYER_PRIVATE_KEY" \
    --broadcast \
    --skip-simulation \
    2>&1

echo ""
echo "════════════════════════════════════════"
echo "  Deployment complete!"
echo "════════════════════════════════════════"
echo ""
echo "Now update your adshell-proxy/.env with the"
echo "contract addresses printed above."
echo ""
echo "Then run: cd ../adshell-proxy && bun run dev"
