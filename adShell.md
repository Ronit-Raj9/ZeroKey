This is a **genuinely original idea** — "AdSense for CLI tools" powered by x402 micropayments on Monad. And critically, Monad already has a native x402 facilitator deployed, meaning you have working infrastructure out of the box. Here's the full breakdown. [docs.monad](https://docs.monad.xyz/guides/x402-guide)

***

## Why This Wins 🏆

This hits every winning criterion simultaneously:
- **Consumer domain** ✅ — developer-facing CLI is a consumer product (OpenCode has 131k stars for a reason)
- **Monad-native** ✅ — x402 on Monad is officially documented with working code [docs.monad](https://docs.monad.xyz/guides/x402-guide)
- **AI Agent Payment Rails** ✅ — directly maps to the official hackathon track [docs.cdp.coinbase](https://docs.cdp.coinbase.com/x402/welcome)
- **Novel** ✅ — nobody has built ad-subsidized CLI AI yet
- **Demo-able in 60 seconds** ✅ — the loop is completely visible on screen

***

## The Economic Model

```
 ADVERTISER                    FREE USER                    AI API
     │                              │                          │
     │  Deposit USDC into AdPool    │                          │
     │──────────────────────────►   │                          │
     │                              │                          │
     │                   ASCII Ad renders in CLI               │
     │                              │                          │
     │              x402 impression claim fires on Monad       │
     │                   (+0.001 USDC → user wallet)           │
     │                              │                          │
     │                              │  x402 payment to proxy   │
     │                              │  (-0.001 USDC auto-pay)  │
     │                              │─────────────────────────►│
     │                              │                          │
     │                              │◄─────────────────────────│
     │                              │     AI response          │
```

The key insight: **ad impressions and API calls cost the same ($0.001)** — one ad view = one free AI call. Monad's 1s finality makes this loop feel instant. [docs.cdp.coinbase](https://docs.cdp.coinbase.com/x402/welcome)

***

## x402 on Monad — The Exact Setup

Monad has a **live facilitator already deployed**: [docs.monad](https://docs.monad.xyz/guides/x402-guide)

```typescript
// Monad Testnet x402 Config — this already works!
const MONAD_NETWORK = "eip155:10143";
const MONAD_USDC   = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
const FACILITATOR  = "https://x402-facilitator.molandak.org";
```

The `@x402/express` middleware gates your AI proxy endpoint: [simplescraper](https://simplescraper.io/blog/x402-payment-protocol)

```typescript
import { paymentMiddleware } from "@x402/express";

app.use(paymentMiddleware({
  "POST /ai": {
    accepts: [{
      scheme: "exact",
      price: "$0.001",          // 1 ad view = 1 AI call
      network: MONAD_NETWORK,
      payTo: process.env.PROXY_WALLET,
    }],
    description: "AI API call via ad-subsidized credits",
  }
}, resourceServer));
```

***

## Architecture (4 Components to Build)

### 1. `AdPool.sol` — Smart Contract (30 min)
```solidity
// Advertisers deposit USDC → pays out per impression
contract AdPool {
    mapping(address => uint256) public adBudgets;
    uint256 public constant IMPRESSION_COST = 1000; // 0.001 USDC (6 decimals)

    function deposit(uint256 amount) external { ... }
    function claimImpression(address user) external {
        // Called by x402 ad server per verified impression
        // Transfers IMPRESSION_COST from pool → user wallet
    }
}
```

### 2. x402 Ad Server (45 min)
Express server with two x402 endpoints:
- `GET /ad` — returns ASCII art ad content + triggers impression payment to user
- Advertiser is the payer; user receives the micropayment

### 3. x402 AI Proxy Server (45 min)
- `POST /ai` — x402-gated, costs $0.001 USDC
- On valid payment: forwards prompt to Anthropic/OpenAI, streams response back
- User's wallet (funded by ad impressions) auto-pays via `@x402/client`

### 4. CLI Tool (3 hrs — the main build)
Built with `ink.js` + `chalk` + `boxen`. Layout:

```
┌─────────────────────────────────────────────┐
│  > asking claude about monads...             │
│                                              │
│  ┌── 📢 SPONSORED ──────────────────────┐   │
│  │  ██╗  ██╗██╗   ██╗██████╗ ██╗   ██╗  │   │
│  │  ██║ ██╔╝██║   ██║██╔══██╗██║   ██║  │   │
│  │  █████╔╝ ██║   ██║██████╔╝██║   ██║  │   │
│  │  BUILD ON KURU DEX — monad-native     │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ⚡ +0.001 USDC earned  [Monad tx: 0xabc]   │
│  💸 -0.001 USDC paid    [Monad tx: 0xdef]   │
│                                              │
│  Claude: A monad is a design pattern...      │
└─────────────────────────────────────────────┘
```

***

## 7-Hour Build Plan

| Time | Task | Deliverable |
|---|---|---|
| **0:00–0:30** | Deploy `AdPool.sol` on Monad testnet via Foundry | Live contract address |
| **0:30–1:15** | x402 AI proxy server (`@x402/express` + Anthropic SDK) | `POST /ai` works |
| **1:15–2:00** | x402 Ad server (serve ASCII ads + trigger impression claim) | `GET /ad` works |
| **2:00–4:30** | CLI skeleton: `ink.js` layout + ASCII ad panel + wallet embed | TUI renders |
| **4:30–5:30** | Wire x402 client (`@x402/client`) into CLI for auto-payment | Full loop works |
| **5:30–6:15** | Polish: live USDC balance tracker, Monad tx links in footer | Demo-ready |
| **6:15–7:00** | Demo rehearsal + 3 pre-seeded ASCII ads | Pitch ready |

***

## Key Packages to Install Right Now

```bash
npm install @x402/express @x402/client @x402/evm @x402/core
npm install ink chalk boxen figlet blessed   # CLI rendering
npm install @anthropic-ai/sdk ethers         # AI + on-chain
npm install express cors dotenv              # API server
```

***

## Your Pitch One-Liner

> *"OpenCode made AI coding free and open source. We made it actually free — watch an ASCII ad for 2 seconds, get one AI call paid on Monad in 1 second. No wallet setup, no subscription, no friction. This is AdSense for the terminal."*

This idea has a name too — call it **"AdShell"** or **"FluxCLI"**. The demo writes itself: open terminal, watch an ad, earn USDC on Monad live, AI responds. The entire x402 payment loop happens in under 2 seconds on screen. No other team at the hackathon will have a live on-chain economic loop like this. 🔥 [docs.cdp.coinbase](https://docs.cdp.coinbase.com/x402/welcome)

Here is the full product architecture document. Save this — it's your submission description, pitch notes, and technical spec all in one.

***

# AdShell — The Attention-Economy CLI for AI

## Tagline
> *"Trade 5 seconds of attention for unlimited AI. No wallet. No subscription. No friction."*

***

## The Problem

There are three broken pieces in the AI developer tooling economy today, and no one has solved all three simultaneously.

**Problem 1 — Premium AI APIs are paywalled.** Every serious AI coding assistant (Claude, GPT-4, Gemini) requires a paid subscription or prepaid credits. A student in India, a developer in Lagos, or a hobbyist anywhere in the world cannot access these tools without a credit card and a minimum monthly spend. The best tools are gated behind financial infrastructure that billions of people don't have.

**Problem 2 — Micropayments haven't worked on the web.** The internet has needed a working micropayment layer since 1995 — the HTTP 402 status code was reserved for "Payment Required" but left unimplemented for 30 years. Every attempt to build sub-cent payments failed because of gas fees, latency, account friction, and settlement time. A $0.001 payment on Ethereum L1 costs $0.50 in gas. It has been fundamentally impossible until now.

**Problem 3 — CLI tools have zero monetization layer.** OpenCode (131k stars), Claude Code, Cursor's terminal — none of them have a mechanism to subsidize free users at the infrastructure level. They either charge everyone or absorb the API cost themselves. There is no middle path. [docs.cdp.coinbase](https://docs.cdp.coinbase.com/x402/welcome)

***

## The Solution: AdShell

AdShell is an open-source AI coding agent CLI that introduces a third tier between "free (no AI)" and "paid subscription" — **attention-subsidized access**. Free users watch a single ASCII advertisement before each AI call. That ad view generates an x402 micropayment on Monad, which flows directly into a pool that pays for the user's AI API call. The entire loop — from ad render to on-chain settlement to AI response — completes in under 3 seconds. [docs.monad](https://docs.monad.xyz/guides/x402-guide)

This is **AdSense for the terminal**, rebuilt with Web3 payment rails.

***

## Mental Model

Think of three familiar things combined:

| Component | Real-World Analogy |
|---|---|
| ASCII ads in CLI | TV commercials before free content |
| x402 impression payment | Google AdSense paying publishers per impression |
| AI API proxy | A SaaS backend that accepts ad revenue instead of user payments |
| Monad blockchain | The instant settlement rail (like UPI but trustless) |

The user never thinks about crypto. They just see: *"Watch a 5-second ad → get your AI answer."* Everything else happens invisibly at the infrastructure layer.

***

## The Three Stakeholders

### 1. The Free Developer (CLI User)
A student, open-source contributor, or junior developer who wants access to Claude/GPT-4 without paying. They install AdShell for free. They see a small ASCII ad banner in their terminal before each AI prompt is answered. Their wallet is automatically created in the background (embedded, non-custodial). They never sign a transaction manually. The credit system handles everything.

### 2. The Advertiser
A blockchain project, a SaaS company, or a dev tool that wants to reach developers. They go to the AdShell dashboard, upload an ASCII art creative (or use an AI generator), set a budget in USDC, define targeting (e.g., "developers who use TypeScript"), and deposit funds into the `AdPool` smart contract on Monad. Their ads run until the budget is exhausted. They pay per verified impression — not per click, not per day.

### 3. The AI Proxy Operator (Protocol)
The AdShell backend acts as the economic bridge. It receives ad revenue from the `AdPool` contract on behalf of users, and simultaneously accepts x402 micropayments from users' embedded wallets to forward AI API calls. The proxy is the only entity with actual AI API keys — users never need them. [docs.cdp.coinbase](https://docs.cdp.coinbase.com/x402/welcome)

***

## The Economic Loop — Explained Precisely

This is the core innovation. Here is the full economic cycle:

**Step 1 — Advertiser Funding:**
An advertiser deposits 100 USDC into the `AdPool` smart contract. They specify their ad creative, targeting criteria, and a price per impression (e.g., $0.001 per view). This budget sits on-chain until consumed.

**Step 2 — User Installs AdShell:**
The user runs one install command. On first launch, AdShell silently generates an embedded EVM wallet and stores the private key locally (encrypted). This wallet is funded with 0 USDC. No faucet, no bridge, no manual setup needed.

**Step 3 — User Makes an AI Request:**
The user types a prompt into the CLI — e.g., `ask "explain this Solidity function"`. Before the AI call fires, AdShell triggers the ad display flow.

**Step 4 — Ad Renders + Impression Fires:**
An ASCII art ad renders in a dedicated panel in the terminal. Simultaneously, the CLI sends a signed impression claim to the Ad Server. The Ad Server verifies the impression (checks wallet address, timestamp, anti-spam) and calls the `AdPool` contract to release $0.001 USDC to the user's embedded wallet. Monad settles this in ~0.4 seconds. [docs.monad](https://docs.monad.xyz/guides/x402-guide)

**Step 5 — x402 Payment Fires Automatically:**
The CLI's x402 client detects that the user now has $0.001 USDC. It automatically constructs an EIP-712 signed payment authorization (using the user's embedded wallet) for $0.001 USDC directed at the AI Proxy Server. This payment is attached to the HTTP request — no manual signing, no MetaMask popup, no gas fee paid by the user (facilitator covers gas). [docs.cdp.coinbase](https://docs.cdp.coinbase.com/x402/welcome)

**Step 6 — AI Proxy Receives Payment + Responds:**
The AI Proxy Server receives the HTTP request with the x402 payment header. It forwards the payment to the Monad x402 Facilitator (`https://x402-facilitator.molandak.org`) for verification and on-chain settlement. Once confirmed, the proxy forwards the prompt to the underlying AI API (Anthropic/OpenAI) and streams the response back to the CLI. [docs.monad](https://docs.monad.xyz/guides/x402-guide)

**Step 7 — User Sees Response:**
The ad panel closes. The AI response streams into the terminal. The footer shows: `⚡ +$0.001 earned from [Kuru DEX ad] | 💸 -$0.001 paid for AI call | Net: $0.000`.

**Result:** The advertiser paid $0.001. The user got a free AI call. The x402 protocol settled two transactions on Monad. No subscription, no credit card, no gas fee paid by the user.

***

## Full System Architecture

AdShell is composed of **five distinct systems** that communicate via HTTP, WebSockets, and on-chain events.

***

### System 1: The CLI Application

The CLI is the only thing the user interacts with. It is a terminal UI application built with a component-based rendering library (like Ink.js for React-in-terminal).

**Layout Structure:**
The terminal screen is divided into three zones:

- **Zone A — Main Chat Panel (70% width):** This is where the AI conversation happens. Prompts go in, responses stream out. It looks and feels like a standard REPL.
- **Zone B — Ad Panel (30% width, right side):** This is the ad display zone. It appears only when an AI call is pending. It renders ASCII art from the ad creative. A countdown timer (5 seconds) shows at the bottom. The panel closes automatically when the timer hits zero and the impression payment clears.
- **Zone C — Status Footer (full width, bottom):** Shows real-time transaction status. Wallet address (truncated), current USDC balance, last earned impression, last paid API call, and a Monad testnet explorer link for both transactions.

**Embedded Wallet Manager:**
The CLI maintains a local wallet without any user interaction. On first launch, it generates a fresh EVM keypair. The private key is stored encrypted in `~/.adshell/wallet.enc` using the user's machine ID as the encryption key (basic protection — hackathon MVP). The wallet address is derived from this keypair. All x402 payment signatures are signed silently in the background using this key.

**x402 Client Integration:**
The CLI bundles the `@x402/client` and `@x402/fetch` libraries. Every AI request is wrapped in a payment-aware fetch — if the server returns 402, the client automatically constructs the USDC payment authorization signed by the embedded wallet, attaches it as the `PAYMENT-SIGNATURE` header, and retries the request. The user never sees this. [docs.cdp.coinbase](https://docs.cdp.coinbase.com/x402/welcome)

**Ad Display Timer Logic:**
The ad timer starts as soon as the ad renders. The impression is considered "valid" only after 3 full seconds of display (anti-fraud minimum). The AI request is held in a pending state until the impression payment clears on Monad. Since Monad settles in ~0.4 seconds, the user waits approximately 3.4 seconds total before seeing their AI response. [docs.monad](https://docs.monad.xyz/guides/x402-guide)

***

### System 2: The Ad Server

The Ad Server is an HTTP server responsible for serving ad creatives, validating impressions, and triggering on-chain payments to user wallets.

**Responsibilities:**
- Serve ad creatives (ASCII art + metadata) to CLI clients
- Validate impression claims (check wallet, timestamp, session token, anti-spam)
- Call the `AdPool` smart contract to release USDC to the user's wallet upon valid impression
- Maintain an off-chain index of ad inventory (which ads are active, remaining budgets, targeting rules)

**Ad Targeting System:**
When the CLI requests an ad, it sends a minimal context payload: OS type, primary programming language detected in the current directory (via file extension scan), and a hashed wallet address for frequency capping. The Ad Server matches this context against advertiser targeting rules and returns the most relevant ad creative. No personal data is transmitted.

**Impression Anti-Fraud:**
Each ad request generates a one-time session token. The CLI must return this token with the impression claim. The server also checks: time between request and claim (must be ≥ 3 seconds), wallet address uniqueness per time window (rate limiting), and that the same session token is not reused.

**Ad Creative Format:**
Ad creatives are stored as structured JSON objects containing: the ASCII art string (maximum 20 lines × 40 characters), a tagline (maximum 60 characters), a destination URL, and color codes for terminal rendering (chalk-compatible ANSI codes). Advertisers upload these via the Advertiser Dashboard. An AI tool (optional) can auto-generate ASCII art from a brand logo or description.

***

### System 3: The Smart Contracts (on Monad)

Two contracts run on Monad — one handles advertiser funds, one is optional for advanced payout logic.

**`AdPool.sol`:**
This is the primary contract. It holds advertiser USDC deposits and processes impression payouts.

Key state it maintains:
- `adBudgets`: mapping from advertiser address → remaining USDC budget
- `impressionCost`: global cost per impression (set at $0.001 USDC = 1000 in 6-decimal USDC units)
- `totalImpressionsServed`: lifetime counter for analytics
- `authorizedAdServer`: the only address allowed to call `claimImpression` (the Ad Server's hot wallet)

Key operations:
- `deposit(amount)` — advertisers call this to fund their ad budget
- `claimImpression(userWallet)` — called by the Ad Server after a valid impression; transfers `impressionCost` from the active advertiser budget to `userWallet`
- `withdraw(amount)` — advertisers can pull unspent budget
- `setAdServer(address)` — owner-only function to update the authorized ad server

**Why Monad specifically for this contract:**
The `claimImpression` function is called once per AI request per user. At scale, this means thousands of on-chain transfers per minute. On Ethereum L1, this is impossible (gas costs exceed payout). On most L2s, there is still meaningful latency. Monad's 10,000 TPS and 0.4-second block times mean the claim, settlement, and balance update all complete before the user's 3-second ad timer even expires. The contract is called and settled mid-ad-display — completely invisible to the user. [docs.monad](https://docs.monad.xyz/guides/x402-guide)

***

### System 4: The AI Proxy Server

The AI Proxy is a gated HTTP server. It holds the actual AI API keys (Anthropic, OpenAI). It accepts requests only from clients that have attached a valid x402 payment header. It uses the Monad x402 Facilitator to verify and settle payments before forwarding prompts.

**Request Lifecycle on the Proxy:**
1. CLI sends `POST /ai` with prompt body and `PAYMENT-SIGNATURE` header containing the x402 payment authorization
2. Proxy extracts the payment header and sends it to the Monad Facilitator (`https://x402-facilitator.molandak.org`) for verification
3. Facilitator verifies the EIP-712 signature, checks USDC balance, and executes the on-chain transfer
4. Facilitator returns success with the Monad transaction hash
5. Proxy logs the transaction hash, then forwards the prompt to the AI API
6. AI response streams back through the proxy to the CLI

**Model Routing:**
The proxy supports multiple AI backends. It routes based on a `model` parameter in the request: `claude-3-haiku` for fast/cheap calls ($0.001/call), `gpt-4o-mini` for balanced calls ($0.002/call, requiring 2 ad views), `claude-sonnet` for premium calls ($0.005/call, requiring 5 ad views). This creates a natural quality-vs-attention tradeoff the user controls.

**Gas Sponsorship:**
The x402 Facilitator on Monad covers gas fees for the USDC transfer. This means the user's embedded wallet needs zero MON for gas. The entire payment flow is gasless from the user's perspective — they only spend the USDC they earned from ad impressions. [docs.monad](https://docs.monad.xyz/guides/x402-guide)

***

### System 5: The Advertiser Dashboard (Web)

A simple Next.js web interface for advertisers to manage their campaigns.

**Features:**
- Connect wallet (MetaMask, Rabby, WalletConnect)
- Deposit USDC into `AdPool.sol`
- Upload ASCII art creative or use the AI generator (paste a logo description, get ASCII art back)
- Set targeting rules: language stack, OS, budget cap per day
- View real-time analytics: impressions served, USDC spent, remaining budget, CPM (cost per mille)
- Pull remaining budget back to wallet

This is the least critical component for the hackathon MVP — a minimal version can be a simple HTML form.

***

## Complete Data Flow (End-to-End)

```
ADVERTISER
    │
    │  Deposits 100 USDC → AdPool.sol (Monad)
    ▼

AD POOL CONTRACT (Monad)
    │  Holds funds. Waits for claimImpression() calls.
    ▼

USER TYPES PROMPT IN ADSHELL CLI
    │
    ├─► CLI requests ad creative from Ad Server
    │       Ad Server returns ASCII art + session token
    │
    ├─► ASCII ad renders in terminal (Zone B)
    │       3-second countdown starts
    │
    ├─► After 3 seconds: CLI sends impression claim to Ad Server
    │       (wallet address + session token + timestamp)
    │
    ├─► Ad Server validates claim → calls AdPool.claimImpression(userWallet)
    │       Monad settles in ~0.4s
    │       User's embedded wallet now has +$0.001 USDC
    │
    ├─► CLI's x402 client detects USDC balance
    │       Constructs EIP-712 payment authorization ($0.001 USDC)
    │       Signs with embedded wallet key
    │       Attaches as PAYMENT-SIGNATURE header on POST /ai
    │
    ├─► AI Proxy receives request
    │       Forwards payment header to Monad Facilitator
    │       Facilitator verifies + settles on Monad (~0.4s)
    │       Returns success + tx hash
    │
    ├─► Proxy forwards prompt to Anthropic/OpenAI
    │       Streams response back to CLI
    │
    └─► CLI renders AI response in Zone A
            Footer shows: both tx hashes, balance update
            Ad panel closes

NET RESULT:
    Advertiser: -$0.001 USDC (ad budget consumed)
    User: $0.000 net (earned $0.001, spent $0.001)
    AI Proxy: +$0.001 USDC revenue (pays API bill)
    Two Monad transactions settled, total time ~3.5 seconds
```

***

## Why x402 Is the Right Protocol Here

x402 was specifically designed for this use case: machine-to-machine HTTP payments without accounts, sessions, or human intervention. The key properties that make it uniquely suitable: [docs.cdp.coinbase](https://docs.cdp.coinbase.com/x402/welcome)

- **It lives inside HTTP headers.** The payment travels with the request — no separate payment step, no redirect, no wallet popup. The CLI's payment is invisible to the user.
- **It uses EIP-712 signed authorizations.** The user's embedded wallet signs a typed-data authorization once. No raw transaction broadcast, no gas estimation, no nonce management. The facilitator handles all of that. [docs.monad](https://docs.monad.xyz/guides/x402-guide)
- **The facilitator covers gas.** Monad's x402 facilitator is a gasless relay. Users never need native MON tokens to pay gas. This eliminates the #1 onboarding friction point of all crypto consumer apps. [docs.monad](https://docs.monad.xyz/guides/x402-guide)
- **It is a standard.** Any future AdShell-compatible AI proxy can accept payments without custom integration. Advertisers building on x402 today are building on infrastructure that will exist in 5 years. [docs.cdp.coinbase](https://docs.cdp.coinbase.com/x402/welcome)

***

## Why Monad Is Technically Non-Negotiable Here

This product cannot be built on any other chain for the following mathematical reason:

Each AI interaction generates **two on-chain transactions** — an impression claim and an API payment. At even modest usage (1,000 users, 10 requests/day each), that is 20,000 on-chain transactions per day. At peak hackathon demo, you might have 50 users doing live demos simultaneously, generating 100 concurrent transactions.

| Chain | TPS | Settlement Time | Gas Cost per Transfer | Viable? |
|---|---|---|---|---|
| Ethereum L1 | ~15 TPS | ~12 seconds | ~$0.50 | ❌ Gas > payout |
| Arbitrum/Optimism | ~2,000 TPS | ~2 seconds | ~$0.01 | ❌ Gas > payout |
| Base | ~2,000 TPS | ~2 seconds | ~$0.001 | ⚠️ Marginal |
| **Monad** | **10,000 TPS** | **~0.4 seconds** | **~$0.0001** | **✅ Perfect** |

Monad is the only chain where the gas cost for the settlement transaction is 100x cheaper than the payment amount, settlement happens faster than the ad display timer, and throughput can handle simultaneous users without mempool congestion. [docs.monad](https://docs.monad.xyz/guides/x402-guide)

***

## Competitive Landscape

| Product | What It Does | What's Missing |
|---|---|---|
| OpenCode | Open-source AI CLI (131k stars) | No monetization layer, requires paid API key |
| Claude Code | Anthropic's official CLI | Paid subscription only, no free tier mechanism |
| Cursor / Copilot | IDE-based AI | Not CLI-native, subscription-only |
| Google AdSense | Ad monetization for web | Web-only, no micropayment settlement, no crypto |
| Brave Ads (BAT) | Attention-based ad rewards | Browser-only, BAT token specific, no AI integration |
| **AdShell** | **All of the above combined** | **N/A — novel combination** |

No existing product combines AI CLI tooling + attention-based monetization + on-chain micropayment settlement. This is a genuine white space.

***

## Pitch Narrative for Monad Blitz

**The Hook (10 seconds):**
*"Every developer in this room has used an AI coding tool. Every developer in this room has hit a paywall. What if you never had to pay for AI again — just watch a 5-second ASCII ad, settle it on Monad in half a second, and get your answer? That's AdShell."*

**The Demo (90 seconds):**
1. Open terminal — run `adshell ask "explain this Solidity function"`
2. ASCII ad renders live (e.g., "BUILD ON MONAD — monad.xyz")
3. Footer shows: `settling impression on Monad...` → `✅ +$0.001 USDC [tx: 0xabc]`
4. x402 payment fires: `paying AI proxy...` → `✅ -$0.001 USDC [tx: 0xdef]`
5. Claude's response streams in
6. Open Monad explorer — show both tx hashes as live proof

**The Scale Argument (20 seconds):**
*"500 million developers globally. Less than 5% have paid AI subscriptions. The other 95% are the addressable market — people who would trade 5 seconds of attention for an AI answer. AdShell is the infrastructure layer for that economy."*

***

## MVP Scope for 7 Hours

Everything above is the full vision. For the hackathon, the minimum shippable demo requires only:

- ✅ `AdPool.sol` deployed on Monad testnet with one pre-seeded advertiser
- ✅ Ad Server serving 3 hardcoded ASCII ad creatives
- ✅ AI Proxy with x402 middleware pointing to Anthropic API
- ✅ CLI rendering: chat zone + ad panel + status footer
- ✅ Embedded wallet auto-creation on first run
- ✅ Full economic loop working end-to-end (ad → payment → AI response)

Everything else — advertiser dashboard, targeting, multi-model routing, anti-fraud — is a post-hackathon roadmap item. The demo loop is what wins. 🔥 [docs.cdp.coinbase](https://docs.cdp.coinbase.com/x402/welcome)