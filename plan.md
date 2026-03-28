# AdShell — Complete Setup & Run Guide

> Everything you need to do, in order, to get AdShell running end-to-end.

---

## 🧩 What Already Exists (You're Further Along Than You Think)

After reading every file, here's what's **already built**:

### ✅ `adshell-proxy/` — Fully implemented standalone server
| File | What it does |
|------|-------------|
| `src/index.ts` (296 lines) | Hono server with x402 payment middleware, 3 ASCII ads, on-chain USDC reward transfers, OpenAI forwarding |
| Endpoints | `GET /health`, `GET /ad/current`, `POST /ad/claim`, `POST /v1/chat/completions` (x402-gated) |
| Packages | `@x402/core@2.8.0`, `@x402/evm@2.8.0`, `@x402/hono@2.8.0`, `viem@2.47.6`, `hono@4.12.9` |

### ✅ `packages/opencode/src/adshell/` — 5 integration modules inside OpenCode
| File | What it does |
|------|-------------|
| `wallet.ts` | Auto-creates a viem private key, persists to `adshell.json` |
| `state.ts` | JSON-based state: wallet, credits, pending claims, tx hashes |
| `api.ts` | Calls proxy's `/ad/current` and `/ad/claim` endpoints |
| `flow.ts` | Orchestrates: fetch ad → show dialog → wait countdown → claim → credit |
| `fetch.ts` | Wraps `fetch` with `@x402/fetch` so all AI requests auto-attach x402 payments |

### ✅ `packages/opencode/src/cli/cmd/tui/component/dialog-adshell.tsx`
- Full SolidJS/OpenTUI dialog with countdown timer, "claim" button, sponsor branding

### ✅ `packages/opencode/src/provider/provider.ts` lines 164-173
- `adshell` custom loader with `autoload: true` — wraps fetch with x402 payments

### ✅ `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx` line 593
- When `providerID === "adshell"` → triggers `AdshellFlow.ensureCredit()` before each prompt

---

## 🚨 What's Missing / Broken (Things You Need to Do)

### Issue 1: `.env` has placeholder values
Your `.env` currently has:
```
ADSHELL_SPONSOR_PRIVATE_KEY=0xyour_private_key   ← PLACEHOLDER
ADSHELL_PAY_TO=0xyour_receive_address             ← PLACEHOLDER
OPENAI_API_KEY=                                    ← EMPTY
```

### Issue 2: `adshell` provider not in models.dev registry
The `CUSTOM_LOADERS` system at `provider.ts:1102` checks `database[providerID]` — if `"adshell"` doesn't exist in `models.dev` data, the custom loader **silently skips** and the provider never loads. You need an `opencode.json` config to define it locally.

### Issue 3: Sponsor wallet needs testnet USDC
The proxy's `/ad/claim` endpoint calls `sponsorClient.writeContract()` to transfer USDC to users. The sponsor wallet needs:
- Testnet MON (for gas)
- Testnet USDC (to send as rewards)

### Issue 4: x402 client packages may need installing in OpenCode
The AdShell client code imports `@x402/core`, `@x402/evm`, `@x402/fetch` — these may not be in OpenCode's `package.json`.

---

## 📋 Step-by-Step: Everything You Need to Do

### Step 1: Generate Wallets (2 minutes)

```bash
cd /tmp && npm install ethers 2>/dev/null
node -e "
const {ethers} = require('ethers');
const sponsor = ethers.Wallet.createRandom();
const proxy = ethers.Wallet.createRandom();
console.log('=== SPONSOR WALLET (sends rewards to users) ===');
console.log('Address:', sponsor.address);
console.log('Private Key:', sponsor.privateKey);
console.log('');
console.log('=== PROXY WALLET (receives x402 payments) ===');
console.log('Address:', proxy.address);
console.log('Private Key:', proxy.privateKey);
"
```

**Save both outputs!** You need the Sponsor private key and the Proxy address.

---

### Step 2: Fill in `.env` (1 minute)

Edit `opencode/adshell-proxy/.env`:

```bash
ADSHELL_PROXY_PORT=4021
ADSHELL_RPC_URL=https://testnet-rpc.monad.xyz
ADSHELL_USDC_ADDRESS=0x534b2f3A21130d7a60830c2Df862319e593943A3
ADSHELL_X402_NETWORK=eip155:10143
ADSHELL_FACILITATOR_URL=https://x402-facilitator.molandak.org
ADSHELL_SPONSOR_PRIVATE_KEY=0x<YOUR_SPONSOR_PRIVATE_KEY>
ADSHELL_PAY_TO=0x<YOUR_PROXY_WALLET_ADDRESS>
ADSHELL_REWARD_USDC=0.001
OPENAI_API_KEY=sk-<YOUR_OPENAI_KEY>
OPENAI_BASE_URL=https://api.openai.com/v1
ADSHELL_UPSTREAM_MODEL=gpt-4.1-mini
```

| Variable | Value | Source |
|----------|-------|--------|
| `ADSHELL_SPONSOR_PRIVATE_KEY` | `0x...` (64 hex chars) | Sponsor wallet **private key** from Step 1 |
| `ADSHELL_PAY_TO` | `0x...` (40 hex chars) | Proxy wallet **address** (NOT key!) from Step 1 |
| `OPENAI_API_KEY` | `sk-...` | Your [OpenAI dashboard](https://platform.openai.com/api-keys) |

---

### Step 3: Fund the Sponsor Wallet (5-10 minutes)

The sponsor wallet needs testnet tokens. Do these **in parallel**:

**3a. Get testnet MON (for gas):**
1. Go to https://faucet.monad.xyz
2. Paste your **SPONSOR wallet address**
3. Request tokens

**3b. Get testnet USDC:**
1. Go to https://faucet.circle.com
2. Select **USDC** as token
3. Select **Monad Testnet** from the Network dropdown
4. Paste your **SPONSOR wallet address**
5. Click "Send 1 USDC"

**Verify balance:**
```bash
cast call 0x534b2f3A21130d7a60830c2Df862319e593943A3 \
  "balanceOf(address)(uint256)" \
  <YOUR_SPONSOR_ADDRESS> \
  --rpc-url https://testnet-rpc.monad.xyz
```
Should return a non-zero number (1000000 = 1 USDC).

---

### Step 4: Install x402 packages in OpenCode (2 minutes)

The AdShell client code (`adshell/fetch.ts`) imports x402 packages. Check if they're installed:

```bash
cd /home/raj/Documents/CODING/Hackathon/MonadBlitz/Adshell/opencode
# Check if x402 is already a dependency
grep -r "x402" packages/opencode/package.json
```

If NOT found, add them:
```bash
cd packages/opencode
bun add @x402/core@2.8.0 @x402/evm@2.8.0 @x402/fetch@2.8.0
```

Also verify `viem` is installed (used by `adshell/wallet.ts`):
```bash
grep "viem" packages/opencode/package.json
```

If not found:
```bash
bun add viem@2.47.6
```

---

### Step 5: Create `opencode.json` Config for AdShell Provider (3 minutes)

The `adshell` provider needs to be defined somewhere OpenCode can find it. The `CUSTOM_LOADERS` system (at `provider.ts:1102`) requires that the provider ID exists in the model database. Since `models.dev` doesn't have `"adshell"`, you must define it locally in an `opencode.json` config file.

Create `opencode.json` in your project root (where you run opencode from):

```bash
cat > /home/raj/Documents/CODING/Hackathon/MonadBlitz/Adshell/opencode/opencode.json << 'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "adshell": {
      "name": "AdShell (x402 on Monad)",
      "api": "http://127.0.0.1:4021/v1",
      "npm": "@ai-sdk/openai-compatible",
      "env": [],
      "models": {
        "adshell-gpt4.1-mini": {
          "name": "AdShell GPT-4.1 Mini (ad-subsidized)",
          "id": "gpt-4.1-mini",
          "attachment": false,
          "reasoning": false,
          "temperature": true,
          "tool_call": true,
          "limit": {
            "context": 128000,
            "output": 16384
          },
          "cost": {
            "input": 0,
            "output": 0
          }
        }
      }
    }
  }
}
EOF
```

**Key details:**
- `api` points to your local proxy at `http://127.0.0.1:4021/v1`
- `npm` is `@ai-sdk/openai-compatible` because the proxy speaks the OpenAI API format
- `env` is empty because authentication is handled by x402 (not API keys)
- `cost` is `0` because the user pays via ad impressions, not money
- The model `id` maps to the proxy's `ADSHELL_UPSTREAM_MODEL` (gpt-4.1-mini)

---

### Step 6: Install Proxy Dependencies (1 minute)

```bash
cd /home/raj/Documents/CODING/Hackathon/MonadBlitz/Adshell/opencode/adshell-proxy
bun install
```

---

### Step 7: Start the Proxy (1 minute)

```bash
cd /home/raj/Documents/CODING/Hackathon/MonadBlitz/Adshell/opencode/adshell-proxy
bun run dev
```

You should see:
```
AdShell proxy listening on http://127.0.0.1:4021
```

**No warnings about missing env vars** means your `.env` is correct.

**Test it:**
```bash
# In another terminal:
curl http://localhost:4021/health
# Should return: {"ok":true,"network":"eip155:10143","payTo":"0x...","sponsor":"0x...","sponsorBalance":"1.000000"}

curl "http://localhost:4021/ad/current?wallet=0x1234&session=test123"
# Should return an ad with claimId, sponsor, title, lines, dwellMs
```

---

### Step 8: Start OpenCode (1 minute)

```bash
cd /home/raj/Documents/CODING/Hackathon/MonadBlitz/Adshell/opencode
bun run dev
```

This runs OpenCode's TUI. Once it launches:

1. Press `Tab` or use the model selector to switch to the **AdShell** provider
2. Select **adshell-gpt4.1-mini** as your model
3. Type a prompt — the ad dialog should pop up!

---

## 🔄 The Full Flow (What Happens When You Send a Prompt)

```
1. You type a prompt in OpenCode TUI
2. prompt/index.tsx:593 detects providerID === "adshell"
3. AdshellFlow.ensureCredit() is called
4. flow.ts checks creditCount > 0 — if not:
   a. api.ts calls GET /ad/current?wallet=...&session=...
   b. Proxy returns ASCII ad + claimId
   c. dialog-adshell.tsx renders ad with 5-second countdown
   d. User watches ad, presses Enter or waits for "claim" to enable
   e. api.ts calls POST /ad/claim with claimId + walletAddress
   f. Proxy calls sponsorClient.writeContract() → USDC transfer on Monad
   g. state.ts updates creditCount += 1
5. prompt/index.tsx continues — sends actual prompt to OpenCode server
6. Provider system calls createAdshellFetch() (fetch.ts)
7. fetch.ts wraps fetch with @x402/fetch → adds payment header automatically
8. Request hits POST /v1/chat/completions with X-PAYMENT header
9. x402 middleware verifies payment via Monad facilitator
10. Proxy forwards to OpenAI, streams response back
11. fetch.ts extracts settlement tx hash, decrements creditCount
12. User sees AI response in terminal
```

**Two on-chain transactions happen:**
- **Impression reward:** Sponsor → User wallet (0.001 USDC)
- **API payment:** User wallet → Proxy wallet (0.001 USDC) via x402

---

## 🧪 Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "Provider does not exist in model list adshell" in logs | Missing `opencode.json` | Create it per Step 5 |
| "ADSHELL_SPONSOR_PRIVATE_KEY is not set" | Empty `.env` | Fill in per Step 2 |
| "sponsor wallet is not configured" on `/ad/claim` | Invalid private key format | Must start with `0x` and be 66 chars total |
| x402 payment fails with 402 | User wallet has no USDC | The ad claim must succeed first to fund the wallet |
| "upstream request failed" on chat | Bad OPENAI_API_KEY | Check key at platform.openai.com |
| Ad dialog doesn't appear | Wrong provider selected | Select `adshell/adshell-gpt4.1-mini` in model picker |
| `@x402/fetch` import error | Missing packages | Run `bun add @x402/core @x402/evm @x402/fetch` in `packages/opencode` |
| Circle faucet won't give USDC | Monad testnet not listed | Try again or ask in Monad Discord #testnet |

---

## 📁 Files You Need to Create / Edit

| Action | Path | What |
|--------|------|------|
| **EDIT** | `adshell-proxy/.env` | Fill in real values (Step 2) |
| **CREATE** | `opencode/opencode.json` | Provider config for adshell (Step 5) |
| **MAYBE** | `packages/opencode/package.json` | Add x402 deps if missing (Step 4) |

**That's it.** Everything else is already built. The proxy, the client integration, the TUI dialog, the wallet, the x402 flow — all done. You just need config + funding.

---

## ⏱ Time Estimate

| Step | Time |
|------|------|
| Generate wallets | 2 min |
| Fill `.env` | 1 min |
| Fund sponsor (faucets) | 5-10 min (waiting for faucet) |
| Install x402 packages | 2 min |
| Create `opencode.json` | 3 min |
| Install proxy deps | 1 min |
| Start & test proxy | 2 min |
| Start & test OpenCode | 2 min |
| **Total** | **~20 minutes** |

The rest of your 6 hours should go to **polish, demo prep, and pitch** — the core system is already functional. 🔥
