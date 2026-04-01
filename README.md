# ZeroKey 🔑

> Watch one ad. Get a free AI model call. Settled on-chain via x402 on Monad.

ZeroKey is an ad-funded AI developer platform that gives developers access to
premium AI model calls for free — by watching a short sponsor ad. Every
impression, credit claim, and inference payment is settled on-chain via x402
micropayments on Monad.

No API key. No subscription. No wallet setup. Just install and build.

---

## How It Works

```
Advertiser deposits USDC → Developer watches 5s ad → Attention verified on-chain
→ Developer earns USDC credit → Credit pays for AI call via x402 → AI responds
→ Advertiser gets provable impression → Developer gets free AI ✅
```

Every step is auditable on Monad. No middlemen. No black boxes.

---

## Install

```bash
npm i -g @ronii/zerokey
# or
bun add -g @ronii/zerokey
```

---

## Usage

```bash
zerokey          # Start chatting with AI
opencode         # Same — both commands work
```

On first run, ZeroKey automatically:
- Creates an embedded wallet at `~/.zerokey/wallet.json`
- Connects to the ZeroKey proxy (no config needed)
- Prompts you to watch a sponsor ad before your first AI call

No MetaMask. No external wallet. No setup.

---

## Quick Start (Local, Full Stack)

If you want to run the full ZeroKey stack locally (contracts + proxy + admin + CLI), follow this order.

### 1) Prerequisites

- Bun `>=1.3`
- Node.js `>=20` (recommended for admin app compatibility)
- Foundry (`forge`, `cast`) for smart contracts
- A PostgreSQL database (for admin telemetry)
- Monad testnet RPC access (`https://testnet-rpc.monad.xyz`)
- USDC + MON on Monad testnet for deployer/sponsor wallets

### 2) Clone and install dependencies

```bash
git clone https://github.com/Ronit-Raj9/ZeroKey
cd ZeroKey/zerokey
bun install
```

### 3) Deploy smart contracts (optional for MVP, required for on-chain mode)

```bash
cd contracts
forge build
forge test

export DEPLOYER_PRIVATE_KEY=0x...
export ADSHELL_CLAIMER_ADDRESS=0x...   # proxy/sponsor wallet
./deploy.sh
```

Save the deployed addresses for:
- `AdPool`
- `AdRegistry`
- `RevenueDistributor`
- `ReputationOracle`

### 4) Run AdShell proxy

```bash
cd ../adshell-proxy
cp .env.example .env
```

Set at minimum in `.env`:
- `OPENAI_API_KEY`
- `ADMIN_API_KEY`
- `ADSHELL_PAY_TO_ADDRESS`
- `MONAD_RPC_URL=https://testnet-rpc.monad.xyz`

For on-chain mode, also set:
- `ADSHELL_ADPOOL_ADDRESS`
- `ADSHELL_REGISTRY_ADDRESS`
- `ADSHELL_REPUTATION_ADDRESS`

Then start:

```bash
bun install
bun run dev
```

### 5) Run admin dashboard (optional but recommended)

```bash
cd ../admin
cp env.example .env.local
```

Set required values in `.env.local`:
- `DATABASE_URL` (and optional `DIRECT_URL`)
- `NEXT_PUBLIC_MONAD_RPC`
- `NEXT_PUBLIC_PROXY_URL=http://localhost:4021`
- `NEXT_PUBLIC_ADPOOL_ADDRESS`
- `NEXT_PUBLIC_ADREGISTRY_ADDRESS`
- `NEXT_PUBLIC_REVENUE_DISTRIBUTOR_ADDRESS`
- `NEXT_PUBLIC_REPUTATION_ADDRESS`

Start admin:

```bash
bun install
bun dev
```

### 6) Run CLI

```bash
cd ../packages/opencode
bun run dev
```

Or install globally and run:

```bash
npm i -g @ronii/zerokey
zerokey
```

### 7) Smoke test checklist

- Proxy health: `curl http://localhost:4021/health`
- Ad fetch: `curl "http://localhost:4021/ad/current?wallet=0x1234&session=test"`
- Admin opens at `http://localhost:3000`
- CLI shows sponsor ad, then allows AI call

---

## Features

- **Bundled Wallet** — Auto-generated on first run via viem, stored locally
- **x402 Micropayments** — Each AI call settled on-chain on Monad testnet
- **Ad-Credit Loop** — Watch ad → earn credit → use AI free
- **OpenCode Compatible** — Full terminal + web agent workflow
- **Admin Dashboard** — Advertisers manage campaigns, track impressions
- **On-Chain Analytics** — Every impression/claim/payment logged on Monad
- **Demo Mode** — Try it instantly, no wallet funding needed

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 ZeroKey CLI                      │
│   (Modified OpenCode + Bundled Viem Wallet)      │
└──────────────────┬──────────────────────────────┘
                   │ x402 micropayment
                   ▼
┌─────────────────────────────────────────────────┐
│              AdShell Proxy                       │
│   (Hono + x402 middleware + Ad Pool)             │
│   Hosted: https://zerokey-8p3y.onrender.com      │
└──────────┬────────────────────┬─────────────────┘
           │                    │
           ▼                    ▼
    ┌─────────────┐    ┌─────────────────┐
    │  OpenAI /   │    │  Monad Testnet  │
    │  Anthropic  │    │  (USDC settle)  │
    └─────────────┘    └─────────────────┘
```

---

## Wallet Commands

```bash
zerokey wallet     # Show your wallet address
zerokey balance    # Check MON/USDC balance
zerokey help       # Show all commands
```

In-chat commands:
```
/clear    Clear conversation
/quit     Exit ZeroKey
/help     Show help
```

---

## For Advertisers

Advertisers deposit USDC into the ZeroKey ad pool and get:
- Verified developer impressions (5s minimum dwell)
- On-chain proof of every ad view
- Real-time analytics via admin dashboard
- Direct access to high-intent developer audience

Contact: [your email] or visit the admin dashboard.

---

## For Developers

```bash
# Install
npm i -g @ronii/zerokey

# Run
zerokey

# Watch the ad when prompted (5 seconds)
# Your AI credit is now funded
# Ask anything — GPT-4.1 responds instantly
# No API key ever needed ✅
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| CLI / TUI | TypeScript, OpenCode fork |
| Wallet | Viem, generatePrivateKey |
| Payments | x402 protocol, USDC |
| Blockchain | Monad Testnet |
| Proxy | Hono, Node.js |
| AI Models | OpenAI GPT-4.1 mini |
| Admin | React, Next.js |

---

## Project Structure

```
zerokey/
├── packages/
│   ├── opencode/          # Modified OpenCode TUI + wallet integration
│   └── zerokey/           # CLI entry point + wallet generation
├── adshell-proxy/         # Hono proxy with x402 + ad pool
├── zerokey_admin/         # Admin dashboard for advertisers
└── contracts/             # Monad smart contracts for ad pool
```

---

## Local Development

```bash
git clone https://github.com/Ronit-Raj9/ZeroKey
cd ZeroKey
bun install

# Run proxy
cd adshell-proxy && bun run dev

# Run CLI
cd packages/opencode && bun run dev
```

---

## Smart Contracts (Monad)

ZeroKey uses four Solidity contracts in `contracts/`:

| Contract | Responsibility | Key Methods |
|---|---|---|
| `AdPool.sol` | Escrow and payout of advertiser USDC | `deposit()`, `withdraw()`, `claimImpression()` |
| `AdRegistry.sol` | On-chain ad creative registry/moderation | `submitCreative()`, `approveCreative()`, `getAsciiArt()` |
| `RevenueDistributor.sol` | x402 payment split routing | `distribute()`, `distributeAll()`, `updateSplits()` |
| `ReputationOracle.sol` | Fraud and trust scoring | `recordClaim()`, `flagUser()`, `userScore()` |

### Contract flow

1. Advertiser deposits USDC into `AdPool`.
2. User watches an ad; proxy verifies dwell and calls `claimImpression()`.
3. User receives credit and makes AI call through x402 path.
4. Payments route through `RevenueDistributor` using configured split rules.
5. Proxy updates `ReputationOracle` for anti-fraud scoring/throttling.

### Build and test

```bash
cd contracts
forge build
forge test
```

### Deploy to Monad testnet

```bash
cd contracts
export DEPLOYER_PRIVATE_KEY=0x...
export ADSHELL_CLAIMER_ADDRESS=0x...

forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast
```

### Wire deployed addresses into apps

- `adshell-proxy/.env`:
  - `ADSHELL_ADPOOL_ADDRESS`
  - `ADSHELL_REGISTRY_ADDRESS`
  - `ADSHELL_REPUTATION_ADDRESS`
  - `ADSHELL_PAY_TO_ADDRESS` (typically `RevenueDistributor`)
- `admin/.env.local`:
  - `NEXT_PUBLIC_ADPOOL_ADDRESS`
  - `NEXT_PUBLIC_ADREGISTRY_ADDRESS`
  - `NEXT_PUBLIC_REVENUE_DISTRIBUTOR_ADDRESS`
  - `NEXT_PUBLIC_REPUTATION_ADDRESS`

For deeper contract docs, see `contracts/README.md`.

---

## Environment Variables (Proxy)

```env
OPENAI_API_KEY=sk-...
ADSHELL_UPSTREAM_MODEL=gpt-4.1-mini
ADMIN_API_KEY=your-secret
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
```

---

## Hackathon

Built for **PL Genesis: Frontiers of Collaboration Hackathon** by Protocol Labs.

Tracks submitted:
- 🔐 Ethereum Foundation: Agents With Receipts — 8004
- 🤖 Ethereum Foundation: Agent Only — Let the agent cook
- Protocol Labs: Crypto
- Protocol Labs: AI & Robotics
- Protocol Labs: Infrastructure & Digital Rights
- Protocol Labs: Fresh Code

---

## License

MIT © Ronit Raj
