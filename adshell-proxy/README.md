# AdShell Proxy v2

Standalone Bun/Hono service for the AdShell protocol — serves ads, validates impressions, handles x402-gated AI payments on Monad.

## Two Modes

### Direct-Transfer Mode (MVP)
Leave `ADSHELL_ADPOOL_ADDRESS` empty. The proxy uses the sponsor wallet to directly transfer USDC to users.

### On-Chain Mode (Production)
Set `ADSHELL_ADPOOL_ADDRESS` (and optionally `ADSHELL_REGISTRY_ADDRESS`, `ADSHELL_REPUTATION_ADDRESS`). The proxy calls `AdPool.claimImpression()` on-chain, reads creatives from `AdRegistry`, and checks fraud scores via `ReputationOracle`.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Service status, balances, pool stats |
| `GET` | `/ad/current` | Fetch an ad creative + claim token |
| `POST` | `/ad/claim` | Validate impression + transfer USDC reward |
| `GET` | `/admin/ads` | List admin-managed ads with impression/claim counts |
| `POST` | `/admin/ads` | Create an admin-managed ad |
| `PATCH` | `/admin/ads/:id` | Update an ad or toggle active status |
| `DELETE` | `/admin/ads/:id` | Soft-delete an ad |
| `GET` | `/admin/ads/:id/stats` | Fetch per-ad performance stats |
| `POST` | `/v1/chat/completions` | x402-gated OpenAI-compatible AI endpoint |
| `GET` | `/pool/stats` | On-chain AdPool analytics (on-chain mode only) |
| `GET` | `/reputation/:address` | User/advertiser reputation score (on-chain mode only) |

## Setup

1. Copy `.env.example` to `.env`
2. Fill in the sponsor wallet, pay-to wallet, and OpenAI key
   Set `ADMIN_API_KEY` if you want something other than the default `adshell-admin` for the admin dashboard.
3. Install dependencies:

```bash
bun install
```

4. Start the proxy:

```bash
bun run dev
```

5. Test:

```bash
curl http://localhost:4021/health
curl "http://localhost:4021/ad/current?wallet=0x1234&session=test"
```

## Smart Contracts

Deploy using Foundry from `../contracts/`:

```bash
cd ../contracts
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast
```

Then update `.env` with the deployed addresses.

## Architecture

```
User (OpenCode TUI)
    ↓ GET /ad/current
Proxy → AdRegistry.getCreative() [on-chain]
    ↓ ASCII ad + claim token
User watches ad (5s dwell)
    ↓ POST /ad/claim
Proxy → AdPool.claimImpression() [on-chain USDC transfer]
    ↓ tx hash + credit
User sends prompt
    ↓ POST /v1/chat/completions (with x402 payment)
Proxy → x402 Facilitator on Monad [settles payment]
Proxy → OpenAI API [forwards prompt]
    ↓ streamed AI response
User sees response
```
