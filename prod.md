# AdShell — Production-Grade On-Chain Architecture
## Complete Deployment Plan on Monad × x402

***

## Vision Statement

AdShell is the world's first attention-economy AI infrastructure protocol. It creates a three-sided marketplace where developers get free AI access, advertisers reach a high-intent technical audience, and the protocol earns sustainable revenue — all settled trustlessly on Monad with zero user friction. Every economic interaction is on-chain, every payment is cryptographically verified, and every participant's incentives are aligned by smart contract logic rather than trust.

***

## System Overview — The Five Layers

```
LAYER 1: USER LAYER
  Developers using OpenCode / AdShell CLI
  Zero wallet friction, zero crypto knowledge required
  Embedded wallet managed invisibly

LAYER 2: APPLICATION LAYER
  OpenCode fork with adshell provider
  Ad dialog, zero-credit gate, footer status
  x402-aware fetch transport

LAYER 3: PROXY LAYER
  adshell-proxy Bun/Hono service
  Ad serving, impression validation, reward orchestration
  x402 payment verification, AI streaming

LAYER 4: PROTOCOL LAYER (ON-CHAIN — MONAD)
  AdPool.sol — escrow and impression payouts
  AdRegistry.sol — creative and campaign management
  RevenueDistributor.sol — payment splitting
  ReputationOracle.sol — advertiser scoring

LAYER 5: INFRASTRUCTURE LAYER
  Multi-region proxy deployment
  IPFS creative storage
  On-chain event indexing
  Analytics and observability
```

***

## Layer 4 Deep Dive — The Smart Contracts

### Contract 1: `AdPool.sol`

The financial core of the entire protocol. Holds all advertiser funds and executes every impression payout.

**Storage Architecture:**
- Advertiser balances mapping — every depositing wallet address maps to its remaining USDC balance in 6-decimal units
- Daily spend tracking — per advertiser, tracks USDC spent today and resets at UTC midnight via block timestamp comparison
- Daily budget caps — per advertiser, maximum USDC spendable in one day regardless of impression volume
- Lifetime impressions served — per advertiser, cumulative counter for analytics and reputation scoring
- Global impression cost — single value representing current USDC payout per verified impression, owner-settable
- Authorized claimer — single address (proxy hot wallet) permitted to call impression payout functions
- Active advertiser queue — ordered list of advertiser addresses currently serving ads, with weights for rotation
- Emergency pause state — boolean that halts all payouts when set by owner
- Minimum deposit threshold — prevents dust deposits from spamming the contract

**Deposit Flow — Detailed:**
- Advertiser must first approve AdPool contract to spend their USDC via the USDC contract's approve function
- Advertiser calls deposit with their desired amount
- Contract verifies amount is above minimum deposit threshold
- Contract calls transferFrom on USDC contract, pulling funds from advertiser to AdPool
- Contract updates advertiser's balance in the mapping
- Contract checks if advertiser is already in the active queue — if not and their balance is sufficient, adds them
- Contract emits Deposited event with advertiser address, amount, new balance, and block timestamp
- This event is indexed by the off-chain analytics layer

**Impression Claim Flow — Detailed:**
- Only callable by the single authorized claimer address — any other caller is rejected with a clear revert message
- Contract checks the pause state — reverts if paused
- Contract identifies the current active advertiser from the queue (round-robin rotation in production)
- Contract verifies active advertiser's balance is at or above impressionCost
- Contract verifies active advertiser has not exceeded their daily budget cap
- Contract deducts impressionCost from active advertiser's balance
- Contract increments active advertiser's daily spend counter
- Contract increments active advertiser's lifetime impression counter
- Contract increments global lifetime impression counter
- Contract calls USDC transfer to send impressionCost directly to the user's embedded wallet address
- Contract emits ImpressionClaimed event with user wallet, amount, active advertiser, block timestamp, and new advertiser balance
- If advertiser's remaining balance falls below impressionCost after this claim, contract removes them from active queue and emits AdvertiserDepleted event

**Withdrawal Flow — Detailed:**
- Advertiser calls withdraw with desired amount
- Contract verifies caller's balance in mapping is sufficient
- Contract verifies withdrawal does not leave advertiser in an inconsistent queue state
- If advertiser is in active queue and remaining balance after withdrawal would be below impressionCost, contract removes them from queue first
- Contract deducts amount from mapping
- Contract transfers USDC back to advertiser's wallet
- Contract emits Withdrawn event

**Queue Management — Detailed:**
- Active advertiser queue is a weighted list — advertisers who pay higher CPM get higher weight and more impressions per rotation cycle
- Default rotation is simple round-robin among all advertisers with sufficient balance
- When an advertiser's balance depletes, they are automatically removed from queue
- When an advertiser deposits more funds, they are automatically re-added to queue
- Owner can manually reprioritize queue for premium advertiser relationships
- Queue state is fully visible on-chain — no hidden prioritization

**Admin Functions:**
- setAuthorizedClaimer — rotate proxy wallet without redeployment, critical for security
- setImpressionCost — adjust payout per impression as advertiser CPM evolves
- setMinimumDeposit — adjust barrier to entry for new advertisers
- pause and unpause — emergency controls
- transferOwnership — standard owner transfer with two-step confirmation to prevent accidents
- recoverERC20 — allows owner to recover accidentally sent tokens other than USDC

***

### Contract 2: `AdRegistry.sol`

Manages ad creative metadata and campaign configuration. Linked to AdPool via advertiser address as the common key.

**Storage Architecture:**
- Per advertiser creative record containing:
  - IPFS content hash of the ASCII art creative and metadata JSON
  - Tagline string (stored directly on-chain, max 120 characters)
  - Sponsor display name (stored directly, max 40 characters)
  - Target audience tags (comma-separated string, e.g. "typescript,react,web3,defi")
  - Click-through URL for web dashboard display
  - Submission timestamp
  - Last updated timestamp
  - Approval status (pending, approved, rejected, paused)
  - Rejection reason if applicable
- Global creative approval queue — list of pending creatives awaiting review
- Approved advertiser registry — list of all ever-approved advertiser addresses
- Blocked advertiser list — permanently banned addresses

**Creative Submission Flow:**
- Advertiser uploads ASCII creative and metadata to IPFS off-chain first
- Advertiser calls submitCreative with the IPFS hash, tagline, sponsor name, target tags, and click URL
- Contract verifies advertiser is not on blocked list
- Contract records the submission with pending status
- Contract emits CreativeSubmitted event
- Off-chain moderation service picks up the event, reviews the creative for appropriateness
- Owner (or approved moderator address) calls approveCreative or rejectCreative
- On approval, contract emits CreativeApproved and the advertiser becomes eligible for queue entry in AdPool
- On rejection, contract stores rejection reason and emits CreativeRejected

**Creative Retrieval:**
- Proxy server calls getActiveCreative with the current active advertiser address from AdPool
- Contract returns the IPFS hash and on-chain tagline/sponsor name
- Proxy fetches full creative from IPFS (or cache) and serves to CLI
- This creates a fully on-chain-auditable ad serving trail — every creative served is traceable to its on-chain registration

**Campaign Controls:**
- Advertiser can pause their own campaign at any time via pauseCampaign
- Advertiser can update their creative by submitting a new IPFS hash (goes back through approval)
- Advertiser can update tagline, target tags, and URL without re-approval (non-creative changes)
- Owner can force-pause any campaign for policy violations

***

### Contract 3: `RevenueDistributor.sol`

Automatically splits all incoming x402 payments between protocol stakeholders. Deployed as the `ADSHELL_PAY_TO` address in the x402 middleware.

**The Split Logic:**
- Every incoming USDC payment from user x402 transactions arrives at this contract
- Contract maintains configurable basis point allocations for each recipient bucket
- Default split in production:
  - 50% to Protocol Treasury — funds development, infrastructure, team
  - 30% to Advertiser Rebate Pool — returned to advertisers as volume discounts, incentivizing larger deposits
  - 15% to Node Operator Pool — future decentralized proxy network
  - 5% to Community Incentives — grants, hackathons, open-source contributions
- Split percentages are owner-adjustable via governance in later versions
- Each bucket is a separate address — Treasury is a multisig, others are sub-contracts or EOAs initially

**Distribution Flow:**
- Any USDC transfer to this contract triggers the receive or fallback handler
- Handler records the incoming amount and sender
- Handler calculates each bucket's share using basis point math
- Handler transfers each share to the respective recipient address
- Handler emits RevenueDistributed event with full breakdown
- All revenue flows are permanently auditable on Monad explorer

**Treasury Management:**
- Treasury address is a 2-of-3 multisig from day one — no single point of failure
- Signers are you, one trusted co-founder or advisor, and a hardware wallet cold storage key
- All treasury withdrawals require 2 signatures and a 48-hour timelock
- Timelock gives community visibility into fund movements before they execute

***

### Contract 4: `ReputationOracle.sol`

Tracks advertiser and user behavior to enable trust scoring without a centralized database.

**Advertiser Reputation:**
- Tracks per advertiser: total USDC deposited lifetime, total impressions purchased, campaigns run, average campaign duration, fraud flags received
- Computes a reputation score (0-100) based on these factors
- High-reputation advertisers get priority queue positioning, lower minimum deposits, and the ability to serve ads without manual approval review
- Low-reputation advertisers face higher minimums, mandatory review, and rate limiting
- Reputation score is public and queryable by any contract or frontend

**User Behavior Tracking:**
- Tracks per user wallet: total impressions claimed, total x402 payments made, claim-to-payment ratio
- A wallet that claims many impressions but rarely pays for AI calls is flagged as potentially fraudulent
- Flagged wallets have their claim rate limited by the proxy server checking this contract
- Legitimate users are never affected — their claim-to-payment ratio is naturally 1:1

**Fraud Signal Aggregation:**
- Proxy server can submit fraud signals to this contract when it detects suspicious patterns
- Multiple fraud signals from different proxy instances (future multi-operator model) trigger automatic throttling
- Throttled wallets can appeal through a governance process

***

## Layer 3 Deep Dive — The Proxy Service

### `adshell-proxy` — Complete API Surface

**`GET /health`**
- Returns service status, proxy wallet balance, AdPool contract balance, facilitator connectivity status
- Used by monitoring systems and the CLI footer to show whether the service is healthy
- Returns degraded status if facilitator is unreachable or sponsor balance is critically low

**`GET /ad/current`**
- Accepts wallet address and session ID as query parameters
- Calls AdRegistry.getActiveCreative for the current active advertiser address from AdPool
- Fetches creative from IPFS or local cache (24-hour TTL)
- Generates a one-time claim token: a server-signed JWT containing wallet address, session ID, advertiser address, issue timestamp, and expiry (10 seconds)
- Returns the ASCII creative, tagline, sponsor name, claim token, and dwell requirement (3 seconds)
- Logs the request for frequency analysis

**`POST /ad/claim`**
- Accepts claim token, wallet address, session ID, and client-side dwell proof
- Validates claim token signature — rejects if tampered or expired
- Validates minimum dwell time was satisfied — rejects if too fast
- Checks claim token has not been used before — queries persistent store, rejects replay
- Checks wallet's recent claim rate against ReputationOracle — rate limits suspicious wallets
- If all checks pass: calls AdPool.claimImpression(walletAddress) from proxy hot wallet
- Waits for Monad transaction confirmation (~0.4 seconds)
- Marks claim token as used in persistent store with TTL matching block finality
- Submits positive reputation signal for this wallet to ReputationOracle
- Returns transaction hash, new wallet USDC balance, one credit granted, and Monad explorer URL

**`POST /v1/chat/completions`**
- OpenAI-compatible streaming endpoint
- Protected by x402 middleware configured with Monad testnet facilitator
- x402 middleware intercepts unauthenticated requests and returns 402 with payment requirements
- For authenticated requests: extracts payment authorization from headers
- Sends authorization to Monad x402 facilitator synchronously — awaits full confirmation
- Only after facilitator returns success with transaction hash does the handler proceed
- Logs payment transaction hash with session metadata
- Calls upstream Anthropic or OpenAI with the user's prompt
- Streams response back to client using chunked transfer encoding
- On stream completion: emits analytics event for this inference session
- On stream failure: does NOT trigger any refund in v1 (complexity vs hackathon timeline — mention as roadmap)

**`POST /advertiser/deposit` (Production)**
- Web dashboard calls this to initiate an advertiser deposit flow
- Returns the AdPool contract address and required USDC approval amount
- Client-side wallet signs approve + deposit transactions
- Proxy monitors AdPool events to confirm deposit and update dashboard

**`GET /analytics/public` (Production)**
- Returns public aggregate metrics: total impressions served, total USDC distributed, active advertiser count, total AI calls served
- Used by the landing page to show live traction numbers
- Sourced from on-chain event indexer, not from the proxy's own logs

***

## Layer 2 Deep Dive — OpenCode Integration

### New Modules in `src/adshell/`

**`wallet.ts` — Embedded Wallet Manager:**
- On first adshell use, generates a cryptographically random EVM private key
- Derives the public address from the private key
- Encrypts the private key using AES-256-GCM with a key derived from the user's machine ID, OS username, and a randomly generated salt
- Stores encrypted key + salt + address in `~/.opencode/adshell.json` with file permissions 0600
- On subsequent launches, reads and decrypts the stored key
- Exposes only the address publicly — private key is never logged, never transmitted, never exposed to the UI
- Provides a signing function used exclusively by the x402 fetch wrapper

**`state.ts` — Persistent State Manager:**
- Reads and writes `~/.opencode/adshell.json` atomically to prevent corruption
- State fields: walletAddress, creditCount, pendingClaimId, lastRewardTx, lastPaymentTx, lastRewardTimestamp, lifetimeImpressions, lifetimeAICalls
- creditCount is the local mirror of on-chain state — source of truth is always the chain, but local mirror prevents unnecessary RPC calls
- pendingClaimId tracks in-flight claims — if OpenCode crashes mid-claim, on restart the pending claim can be resolved or abandoned
- All writes are atomic — write to temp file, then rename to final path

**`api.ts` — Proxy Communication:**
- Typed HTTP client for all adshell-proxy endpoints
- Handles request timeouts (5 seconds for claim, 10 seconds for AI)
- Handles retry logic for transient network failures (max 2 retries with exponential backoff)
- Returns strongly typed response objects or typed error objects — never throws unhandled exceptions
- All errors surface as user-readable messages in the TUI, never as raw stack traces

**`fetch.ts` — x402-Aware Transport:**
- Wraps the standard fetch function with x402 payment logic
- On first request to proxy AI endpoint: sends without payment header
- On 402 response: extracts payment requirements from response headers
- Constructs EIP-712 payment authorization using the user's embedded wallet
- Signs the authorization using wallet.ts signing function
- Retries the request with the signed payment header attached
- On success: extracts transaction hash from response headers, updates lastPaymentTx in state, decrements creditCount
- On payment failure: surfaces clear error to user — "Payment failed: insufficient balance. Watch an ad to earn more credits."
- The entire 402 → sign → retry cycle is transparent to the rest of OpenCode

**`flow.ts` — Ad Flow Orchestrator:**
- Coordinates the complete zero-credit flow: fetch ad → display → dwell → claim → resume
- Calls api.ts to fetch current ad creative
- Signals the TUI to open the ad dialog with the creative content
- Starts the dwell timer
- On timer completion: calls api.ts to submit the claim
- On claim success: updates state.ts, signals TUI to close dialog, signals prompt to resume
- On claim failure: signals TUI to show retry state with error message
- On timeout (chain settlement takes > 5 seconds): shows "Monad settling..." with spinner, waits up to 10 seconds total before surfacing a timeout error

### TUI Changes

**`dialog-adshell.tsx` — Ad Modal:**
- Full-width modal that overlays the session view (not a new route)
- Top section: ASCII art creative rendered with correct ANSI colors
- Middle section: sponsor name and tagline in a styled box
- Bottom section: countdown timer bar that fills from 0 to 3 seconds
- Status line below timer: "Earning 0.001 USDC on Monad..." during dwell, "Settling on Monad..." during claim, "✅ Earned! Resuming..." on success
- The modal is non-dismissable during dwell — pressing Escape shows "Watch the ad to continue" message
- After successful claim, modal closes automatically and the original prompt resumes

**`footer.tsx` — Status Strip:**
- Always-visible when adshell is selected provider
- Shows in compact single line: `AdShell | Credits: N | Reward: 0xabc...↗ | Paid: 0xdef...↗`
- The ↗ symbols are clickable (or show URL on hover) linking to Monad testnet explorer
- Credits shown in green if > 0, amber if 0
- Transaction hashes truncated to 8 characters for display
- Animates with a subtle pulse when a new transaction arrives

**`prompt/index.tsx` — Zero-Credit Gate:**
- Single if-branch added before the existing prompt submission logic
- If selected provider is adshell AND creditCount is 0: call flow.ts to open ad flow, do not proceed with prompt
- If selected provider is adshell AND creditCount is greater than 0: proceed normally, adshellFetch handles x402 transparently
- If selected provider is not adshell: existing behavior completely unchanged
- The gate is the only place in the prompt component that knows about adshell — all other adshell logic is in src/adshell/

***

## Layer 5 Deep Dive — Production Infrastructure

### Multi-Region Proxy Deployment

**Architecture:**
- Primary proxy deployed as a containerized Bun service on Railway, Render, or Fly.io
- Three geographic regions: Asia-Pacific (Singapore), US East (Virginia), Europe West (Frankfurt)
- Cloudflare as the global entry point — routes each user to nearest region based on latency
- All regions share the same AdPool.sol and AdRegistry.sol contract addresses
- All regions share the same `ADSHELL_PAY_TO` address (RevenueDistributor.sol)
- Each region has its own proxy hot wallet (authorized claimer) — owner calls setAuthorizedClaimer to whitelist all three
- AdPool.sol supports multiple authorized claimers in production (upgrade from single claimer in v1)

**Load Balancing:**
- Cloudflare Workers handle geographic routing with <10ms overhead
- Each worker checks the target region's health endpoint before routing
- If a region is degraded, traffic automatically falls over to the next nearest region
- No single region failure can take down the service

**State Synchronization:**
- creditCount is stored locally on the user's machine — no inter-region sync needed
- Claim tokens are region-scoped — a token issued by the Singapore proxy cannot be redeemed at the Virginia proxy (prevents geographic replay attacks)
- On-chain state (AdPool balances, ReputationOracle scores) is shared globally via Monad

### IPFS Creative Storage

**Why IPFS for Creatives:**
- Ad creatives change over time — storing them on-chain is expensive and inflexible
- IPFS content addressing means the hash in AdRegistry permanently identifies the exact creative
- If you ever serve a different creative than what the hash points to, it's detectable on-chain
- Advertisers can verify their creative is being served correctly by checking the hash

**Creative Format on IPFS:**
- Each creative is stored as a structured JSON file containing the ASCII art string, ANSI color codes for each line, tagline, sponsor name, click URL, dimensions (width × height in characters), and a content hash for integrity verification
- IPFS pinning via Pinata or web3.storage ensures the creative is always retrievable
- Local proxy cache (Redis or in-memory with 24h TTL) prevents repeated IPFS fetches

### On-Chain Event Indexing

**Why Indexing Is Needed:**
- Smart contract events are the source of truth for all AdShell activity
- Raw RPC queries for historical events are slow and expensive
- An indexer transforms raw events into a fast queryable API

**Indexing Architecture:**
- Envio or The Graph indexes all AdPool.sol and AdRegistry.sol events
- Indexed entities: all Deposited events, all ImpressionClaimed events, all Withdrawn events, all CreativeApproved events
- GraphQL API exposes this data to:
  - Advertiser dashboard (query their own campaign performance)
  - Public analytics page (aggregate protocol metrics)
  - Proxy server (verify claim history without querying chain directly)

**Key Queries the Indexer Enables:**
- "How many impressions has advertiser X served in the last 7 days?"
- "What is the total USDC distributed to users this month?"
- "How many unique user wallets have interacted with AdPool?"
- "What is the average time between deposit and depletion for advertisers?"

### Observability Stack

**Metrics (Prometheus + Grafana):**
- Proxy service metrics: requests per second per endpoint, p50/p95/p99 latency, error rates by type
- x402 metrics: payment success rate, facilitator response time, failed payment reasons
- Business metrics: impressions per hour, USDC distributed per hour, AI calls per hour, active user wallets
- Chain metrics: AdPool USDC balance (alert if below 24-hour runway), gas prices on Monad, block time anomalies

**Tracing (OpenTelemetry):**
- Distributed trace for every AI call: CLI → proxy → facilitator → Anthropic → proxy → CLI
- Trace includes x402 payment verification time, facilitator settlement time, AI response time
- Traces exported to Jaeger or Grafana Tempo
- Any trace where facilitator takes > 2 seconds is flagged for investigation

**Alerting:**
- PagerDuty alerts for: proxy error rate > 5%, facilitator unreachable > 30 seconds, AdPool balance < 0.01 USDC, any contract call failure
- Slack alerts for: new advertiser deposit, daily revenue summary, weekly user growth

***

## The Complete Token Economy — Production Numbers

### Unit Economics at Scale

**Per Interaction:**
- Advertiser pays: 0.001 USDC per impression (set in AdPool.sol)
- User receives: 0.001 USDC reward (from AdPool.sol claimImpression)
- User pays: 0.001 USDC for AI call (via x402 to RevenueDistributor.sol)
- RevenueDistributor splits: 0.0005 to treasury, 0.0003 to advertiser rebate, 0.00015 to node operators, 0.00005 to community
- Actual Anthropic cost: ~0.0003 USDC per call (Claude Haiku)
- Protocol net per interaction: 0.0005 - 0.0003 = 0.0002 USDC per call (after treasury receives and pays Anthropic)
- User net per interaction: 0 USDC (earned and spent cancel out perfectly)
- Advertiser net per interaction: -0.001 USDC (pure ad spend, partially offset by rebate)

**At 10,000 Daily Active Users, 20 calls/day:**
- Daily impressions: 200,000
- Daily USDC distributed to users: 200 USDC
- Daily x402 payments collected: 200 USDC
- Daily Anthropic cost: ~60 USDC
- Daily protocol net: ~140 USDC = ~$51,000/year

**At 100,000 DAU:**
- ~$510,000/year protocol revenue
- This is the business case that justifies the infrastructure investment

### Why Monad Specifically Enables This Economy

- Gas cost per claimImpression call on Monad: ~0.0001 USDC equivalent
- Gas cost per x402 settlement on Monad: ~0.0001 USDC equivalent (covered by facilitator)
- Total gas per interaction: ~0.0002 USDC
- Gas as percentage of impression value: 0.02% — essentially free
- On Ethereum L1: gas would be $0.50+ per interaction, making the entire model impossible
- On Arbitrum/Optimism: gas would be $0.005-0.01 per interaction, consuming 50-100% of impression value
- Only Monad makes the $0.001 micropayment economy viable at scale

***

## Security Model — Threat Analysis and Mitigations

### Threat 1: Impression Fraud (Free Riding)
**Attack:** User calls POST /ad/claim without actually watching the ad
**Mitigations:**
- Server-issued one-time claim tokens that expire in 10 seconds
- Client-side signed dwell proof (timestamp + wallet + session, signed by embedded wallet)
- Server-side dwell time validation
- ReputationOracle rate limiting for wallets with anomalous claim patterns
- Future: Noir ZK circuit proving honest dwell time (cryptographically eliminates this threat)

### Threat 2: Claim Token Replay
**Attack:** Reuse a valid claim token to get multiple rewards
**Mitigations:**
- Persistent store of used claim tokens with TTL of 1 hour
- Claim token contains a cryptographic nonce generated fresh per request
- Token signature verified server-side against the proxy's signing key

### Threat 3: Proxy Wallet Compromise
**Attack:** Attacker gains access to the authorized claimer private key and drains AdPool
**Mitigations:**
- AdPool.sol has a daily claim limit per authorized claimer
- AdPool.sol has a per-transaction maximum (cannot claim more than impressionCost per call)
- Owner can call setAuthorizedClaimer instantly to revoke a compromised wallet
- Proxy wallet holds only MON for gas, never USDC — only the contract holds USDC
- Multi-region deployment uses different authorized claimers per region

### Threat 4: Smart Contract Exploit
**Attack:** Attacker finds a vulnerability in AdPool.sol and drains the USDC escrow
**Mitigations:**
- Full audit by a reputable firm (Trail of Bits, OpenZeppelin, Sherlock) before mainnet
- Emergency pause function controlled by owner multisig
- Maximum deposit cap per advertiser limits blast radius
- Formal verification of the claimImpression function using Certora Prover
- Bug bounty program with up to 10% of TVL for critical vulnerabilities

### Threat 5: Facilitator Centralization
**Attack:** Monad x402 facilitator goes down, all AI calls fail
**Mitigations:**
- Proxy monitors facilitator health every 30 seconds
- On facilitator failure: surface clear error "Payment network temporarily unavailable — try again in 60 seconds"
- Roadmap: support multiple facilitator endpoints with automatic fallback
- Roadmap: run a self-hosted facilitator for resilience

***

## Governance Roadmap

### Phase 1 — Benevolent Dictator (Launch to Month 6)
- Owner wallet controls all admin functions
- All changes communicated publicly on Discord and Twitter before execution
- Community feedback period of 48 hours for major parameter changes

### Phase 2 — Multisig Council (Month 6 to Month 18)
- Replace single owner with 3-of-5 multisig
- Council members: team (2 seats), major advertisers (1 seat), community representative (1 seat), independent security researcher (1 seat)
- All parameter changes require multisig approval and 48-hour timelock
- AdShell governance token introduced for community signal voting (non-binding initially)

### Phase 3 — Full DAO (Month 18+)
- Token holders vote on impressionCost, revenue split percentages, authorized proxy operators
- Timelock on all governance actions
- Emergency multisig override for security incidents only
- Protocol becomes fully community-owned

***

## Launch Sequence — From Hackathon to Mainnet

### Stage 1: Hackathon MVP (Today)
- AdPool.sol on Monad testnet with hot wallet sponsor
- 3 hardcoded ASCII ads
- Single proxy on localhost
- Full x402 loop working end-to-end
- OpenCode fork with ad dialog and footer

### Stage 2: Testnet Beta (Week 1–4)
- AdPool.sol fully deployed and audited on testnet
- AdRegistry.sol deployed with on-chain creative storage
- Real advertiser (Monad ecosystem project) deposits testnet USDC
- CommitAds API integration for real ad creatives
- Proxy deployed on Railway (not localhost)
- 50–100 beta users from Monad Discord

### Stage 3: Security Hardening (Month 1–2)
- Full smart contract audit
- Encrypted wallet storage
- Persistent replay prevention database
- Multi-region proxy deployment
- Comprehensive observability stack
- Bug bounty program launched

### Stage 4: Mainnet Launch (Month 2–3)
- All contracts deployed to Monad mainnet
- Real USDC flowing
- First paying advertisers onboarded
- Public beta open to all OpenCode users
- Landing page with live on-chain metrics

### Stage 5: Protocol Expansion (Month 3–6)
- RevenueDistributor.sol deployed
- ReputationOracle.sol deployed
- Governance multisig established
- First node operator onboarded (decentralized proxy network begins)
- Noir ZK fraud prevention circuit deployed
- 1,000+ DAU milestone

***

## The One-Paragraph Pitch for Everything Above

> *AdShell is a three-sided attention economy protocol built on Monad. Advertisers deposit USDC into a trustless smart contract. Developers watch a five-second ASCII ad to earn that USDC. The earned USDC automatically pays for their AI API call via the x402 protocol. Every transaction — deposit, impression payout, AI payment — settles on Monad in under one second with near-zero gas. The developer never touches a wallet, never buys crypto, and never pays for AI. The advertiser gets verified impressions from a high-intent technical audience. The protocol earns a sustainable margin on every interaction. It is AdSense for the terminal, rebuilt on programmable money.*


Got it. Those three sections — Multi-Region Proxy, IPFS Creative Storage, and On-Chain Event Indexing — are **completely removed** from your production plan.

***

## What Your Production Plan Now Looks Like

The five layers stay, but Layer 5 is now much leaner:

### Layer 5 — Infrastructure (Simplified)

**Proxy Deployment:**
- Single Bun/Hono service deployed on Railway or Render
- One region only — no geographic distribution
- One authorized claimer wallet — no multi-region complexity
- Simple health endpoint for uptime monitoring

**Creative Storage:**
- ASCII creatives stored directly in `AdRegistry.sol` as on-chain strings
- No IPFS, no content hashing, no pinning services
- Advertiser submits creative directly via contract call
- Proxy reads creative directly from contract via RPC call

**Analytics:**
- Proxy logs requests to a simple PostgreSQL database (Supabase free tier)
- Basic dashboard showing: impressions served, USDC distributed, active users
- No blockchain indexer, no GraphQL API, no The Graph
- On-chain explorer (Monad testnet explorer) serves as the public audit trail

***

## Your Actual Production Stack (Clean Version)

```
Users → OpenCode fork (adshell provider)
          ↓
Single proxy on Railway
  ├── AdPool.sol (Monad) — escrow + payouts
  ├── AdRegistry.sol (Monad) — creatives on-chain
  ├── RevenueDistributor.sol (Monad) — payment splits
  ├── ReputationOracle.sol (Monad) — fraud scoring
  └── Supabase — claim token storage + basic analytics
```

**This is everything you need. Nothing more.** 

Now sleep. 🛌## Don't. Here's Why.

Running local IPFS for a hackathon demo is one of the highest-risk decisions you can make tonight.

***

## The Problems With Local IPFS

- **It dies when your laptop sleeps** — judges watch your demo, you close the lid for 2 minutes, IPFS node goes offline, creatives don't load
- **It's not accessible from the proxy** — if your proxy is deployed on Railway, it cannot reach `localhost:5001` on your laptop
- **Setup takes 45+ minutes** — install IPFS daemon, init node, pin files, configure API, test retrieval
- **Adds zero demo value** — judges cannot see IPFS working, they just see an ad creative render. They don't care where it came from

***

## What You Should Do Instead

**Store the ASCII creative directly in `AdRegistry.sol` as an on-chain string.**

- One string field in the contract
- Proxy reads it via a single RPC call
- Always available as long as Monad testnet is up
- Actually MORE impressive to judges — *"the creative is stored on-chain"* is a better story than *"we run local IPFS"*
- Zero additional infrastructure

***

## The Only Time IPFS Makes Sense

When your creative files are large (images, videos, audio) and storing them on-chain is prohibitively expensive. ASCII art is 20 lines of text — it costs almost nothing to store on Monad. IPFS solves a problem you don't have.

**On-chain string storage is your answer. Skip IPFS entirely.** 🎯

Now please sleep. 🛌