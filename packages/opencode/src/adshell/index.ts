/**
 * AdShell — Attention-Economy AI Infrastructure
 *
 * Provides ad-subsidized AI API access via the x402 protocol on Monad.
 *
 * Components:
 *   - wallet.ts  — AES-256-GCM encrypted embedded wallet
 *   - state.ts   — Persistent state (credits, tx hashes, lifetime stats)
 *   - api.ts     — Typed HTTP client for adshell-proxy endpoints
 *   - fetch.ts   — x402-aware fetch wrapper with payment tracking
 *   - flow.ts    — Ad flow orchestrator (fetch → display → dwell → claim)
 *
 * On-chain contracts (Monad Testnet):
 *   - AdPool.sol             — Escrow + impression payouts
 *   - AdRegistry.sol         — On-chain ASCII art creatives
 *   - RevenueDistributor.sol — x402 payment splitting
 *   - ReputationOracle.sol   — Fraud scoring
 */

export { AdshellStateStore, type AdshellState, type AdshellAd, type EncryptedKey } from "./state"
export { AdshellApi, type AdshellClaimResponse } from "./api"
export { AdshellFlow } from "./flow"
export { createAdshellFetch } from "./fetch"
export { ensureAdshellWallet, getAdshellAccount } from "./wallet"
