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
