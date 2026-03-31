import "dotenv/config"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { Prisma } from "@prisma/client"
import { createThirdwebClient } from "thirdweb"
import { facilitator, settlePayment } from "thirdweb/x402"
import { monadTestnet } from "thirdweb/chains"
import {
  defineChain,
  erc20Abi,
  formatUnits,
  http,
  parseUnits,
  createPublicClient,
  createWalletClient,
  type Abi,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { prisma } from "./lib/prisma"

type X402Network = `${string}:${string}`

// ──────────────────────────────────────────────
//  Environment
// ──────────────────────────────────────────────


const env = {
  port: Number(process.env.ADSHELL_PROXY_PORT || 4021),
  rpcUrl: process.env.ADSHELL_RPC_URL || "https://testnet-rpc.monad.xyz",
  usdcAddress: process.env.ADSHELL_USDC_ADDRESS || "0x534b2f3A21130d7a60830c2Df862319e593943A3",
  network: (process.env.ADSHELL_X402_NETWORK || "eip155:10143") as X402Network,
  facilitatorUrl: process.env.ADSHELL_FACILITATOR_URL || "https://x402-facilitator.molandak.org",
  rewardUsdc: process.env.ADSHELL_REWARD_USDC || "0.001",
  sponsorPrivateKey: process.env.ADSHELL_SPONSOR_PRIVATE_KEY || "",
  payTo: process.env.ADSHELL_PAY_TO || "",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiBaseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  upstreamModel: process.env.ADSHELL_UPSTREAM_MODEL || "gpt-4.1-mini",
  // On-chain contract addresses (optional — falls back to direct transfer if not set)
  adPoolAddress: process.env.ADSHELL_ADPOOL_ADDRESS || "",
  registryAddress: process.env.ADSHELL_REGISTRY_ADDRESS || "",
  reputationAddress: process.env.ADSHELL_REPUTATION_ADDRESS || "",
}

if (!process.env.THIRDWEB_SECRET_KEY) console.warn("⚠ THIRDWEB_SECRET_KEY is not set")
if (!env.sponsorPrivateKey) console.warn("⚠ ADSHELL_SPONSOR_PRIVATE_KEY is not set")
if (!env.payTo) console.warn("⚠ ADSHELL_PAY_TO must be a thirdweb server wallet address (create at thirdweb.com/dashboard → Wallets)")
if (!env.openaiApiKey) console.warn("⚠ OPENAI_API_KEY is not set")

const useOnChainPool = Boolean(env.adPoolAddress)
if (useOnChainPool) {
  console.log("✓ On-chain AdPool mode enabled")
  console.log("  AdPool:", env.adPoolAddress)
  if (env.registryAddress) console.log("  Registry:", env.registryAddress)
  if (env.reputationAddress) console.log("  Reputation:", env.reputationAddress)
} else {
  console.log("✓ Direct-transfer mode (MVP)")
}

// ──────────────────────────────────────────────
//  Chain Config
// ──────────────────────────────────────────────

const viemMonadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { decimals: 18, name: "Monad", symbol: "MON" },
  rpcUrls: { default: { http: [env.rpcUrl] } },
  blockExplorers: {
    default: { name: "Monad Explorer", url: "https://testnet.monadexplorer.com" },
  },
})

const rewardAmount = parseUnits(env.rewardUsdc, 6)
const sponsorAccount = env.sponsorPrivateKey
  ? privateKeyToAccount(env.sponsorPrivateKey as `0x${string}`)
  : undefined
const publicClient = createPublicClient({
  chain: viemMonadTestnet,
  transport: http(env.rpcUrl),
})
const sponsorClient =
  sponsorAccount &&
  createWalletClient({
    account: sponsorAccount,
    chain: viemMonadTestnet,
    transport: http(env.rpcUrl),
  })

// ──────────────────────────────────────────────
//  AdPool ABI (minimal — only what proxy calls)
// ──────────────────────────────────────────────

const adPoolAbi = [
  {
    name: "claimImpression",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "user", type: "address" }],
    outputs: [],
  },
  {
    name: "currentAdvertiser",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "activeAdvertiserCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balances",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalImpressions",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "impressionCost",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi

const adRegistryAbi = [
  {
    name: "getCreative",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "advertiser", type: "address" }],
    outputs: [
      { name: "asciiLines", type: "string[]" },
      { name: "tagline", type: "string" },
      { name: "sponsorName", type: "string" },
      { name: "targetTags", type: "string" },
      { name: "clickUrl", type: "string" },
      { name: "status", type: "uint8" },
    ],
  },
  {
    name: "isActive",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "advertiser", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const satisfies Abi

const reputationAbi = [
  {
    name: "recordClaim",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "user", type: "address" }],
    outputs: [],
  },
  {
    name: "recordPayment",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "user", type: "address" }],
    outputs: [],
  },
  {
    name: "isThrottled",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "userScore",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "advertiserScore",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "advertiser", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi

// ──────────────────────────────────────────────
//  Thirdweb x402 Setup
// ──────────────────────────────────────────────

const thirdwebSecretKey = process.env.THIRDWEB_SECRET_KEY
const thirdwebServerWalletAddress = env.payTo || sponsorAccount?.address || ""
const thirdwebClient = thirdwebSecretKey
  ? createThirdwebClient({ secretKey: thirdwebSecretKey })
  : null

const thirdwebX402Facilitator =
  thirdwebClient && thirdwebServerWalletAddress
    ? facilitator({
      client: thirdwebClient,
      serverWalletAddress: thirdwebServerWalletAddress,
      waitUntil: "confirmed",
    })
    : null

// ──────────────────────────────────────────────
//  DB-backed Ad Serving
// ──────────────────────────────────────────────

async function getRandomActiveAd() {
  const ads = await prisma.ad.findMany({ where: { isActive: true } })
  if (ads.length === 0) return null
  return ads[Math.floor(Math.random() * ads.length)]
}

async function upsertInstallation(machineId: string, walletAddress: string) {
  return prisma.opencodeInstallation.upsert({
    where: { machineId },
    update: { walletAddress },
    create: { machineId, walletAddress },
  })
}

async function trackAdEvent(params: {
  campaignId: string
  advertiser: string
  eventType: string
  sessionID: string
  walletAddress: string
  metadata?: Prisma.InputJsonValue
}) {
  const installation = await upsertInstallation(params.sessionID, params.walletAddress)

  return prisma.adEvent.create({
    data: {
      installationId: installation.id,
      campaignId: params.campaignId,
      advertiser: params.advertiser,
      eventType: params.eventType,
      metadata: params.metadata ?? {},
    },
  })
}

// ──────────────────────────────────────────────
//  Analytics Counters (in-memory)
// ──────────────────────────────────────────────

const analyticsCounters = {
  totalClaims: 0,
  totalAICalls: 0,
  uniqueWallets: new Set<string>(),
  startedAt: Date.now(),
}

// ──────────────────────────────────────────────
//  Claim Tracking
// ──────────────────────────────────────────────

type ClaimRecord = {
  adId: string
  sponsor: string
  walletAddress: string
  sessionID: string
  createdAt: number
  claimed: boolean
  advertiserAddress?: string // On-chain mode: which advertiser this impression is for
}

const claims = new Map<string, ClaimRecord>()
// Cleanup old claims every 5 minutes (prevent memory leak)
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000 // 10 min TTL
  for (const [id, claim] of claims) {
    if (claim.createdAt < cutoff) claims.delete(id)
  }
}, 5 * 60 * 1000)

// ──────────────────────────────────────────────
//  App
// ──────────────────────────────────────────────

const app = new Hono()

// CORS middleware
app.use("*", cors())

// ──────────────────────────────────────────────
//  GET /health — Enhanced with on-chain stats
// ──────────────────────────────────────────────

app.get("/health", async (c) => {
  const sponsorBalance =
    sponsorAccount && sponsorClient
      ? await publicClient
        .readContract({
          address: env.usdcAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [sponsorAccount.address],
        })
        .then((value) => formatUnits(value, 6))
        .catch(() => undefined)
      : undefined

  // On-chain pool stats
  let poolStats: Record<string, unknown> | undefined
  if (useOnChainPool) {
    try {
      const [activeCount, totalImpressions, impressionCost] = await Promise.all([
        publicClient.readContract({
          address: env.adPoolAddress as `0x${string}`,
          abi: adPoolAbi,
          functionName: "activeAdvertiserCount",
        }),
        publicClient.readContract({
          address: env.adPoolAddress as `0x${string}`,
          abi: adPoolAbi,
          functionName: "totalImpressions",
        }),
        publicClient.readContract({
          address: env.adPoolAddress as `0x${string}`,
          abi: adPoolAbi,
          functionName: "impressionCost",
        }),
      ])
      poolStats = {
        activeAdvertisers: Number(activeCount),
        totalImpressions: Number(totalImpressions),
        impressionCost: formatUnits(impressionCost, 6),
        adPoolAddress: env.adPoolAddress,
        registryAddress: env.registryAddress || null,
        reputationAddress: env.reputationAddress || null,
      }
    } catch (e) {
      poolStats = { error: "Failed to read AdPool", detail: String(e) }
    }
  }

  return c.json({
    ok: true,
    mode: useOnChainPool ? "on-chain" : "direct-transfer",
    network: env.network,
    payTo: env.payTo || sponsorAccount?.address,
    sponsor: sponsorAccount?.address,
    sponsorBalance,
    pool: poolStats,
    explorer: "https://testnet.monadexplorer.com",
  })
})

// ──────────────────────────────────────────────
//  GET /ad/current — Serve ad (on-chain or fallback)
// ──────────────────────────────────────────────

app.get("/ad/current", async (c) => {
  const wallet = c.req.query("wallet")
  const sessionID = c.req.query("session")
  if (!wallet || !sessionID) {
    return c.json({ error: "wallet and session are required" }, 400)
  }

  // Check throttle status if reputation oracle is available
  if (env.reputationAddress) {
    try {
      const throttled = await publicClient.readContract({
        address: env.reputationAddress as `0x${string}`,
        abi: reputationAbi,
        functionName: "isThrottled",
        args: [wallet as `0x${string}`],
      })
      if (throttled) {
        return c.json({ error: "Rate limited — too many claims without payments" }, 429)
      }
    } catch {
      // Ignore reputation check failures
    }
  }

  let ad: { sponsor: string; title: string; lines: string[] }
  let advertiserAddr: string | undefined
  let dbAdId: string | undefined

  // Try on-chain registry first
  if (useOnChainPool && env.registryAddress) {
    try {
      const currentAdv = await publicClient.readContract({
        address: env.adPoolAddress as `0x${string}`,
        abi: adPoolAbi,
        functionName: "currentAdvertiser",
      })

      if (currentAdv && currentAdv !== "0x0000000000000000000000000000000000000000") {
        const creative = await publicClient.readContract({
          address: env.registryAddress as `0x${string}`,
          abi: adRegistryAbi,
          functionName: "getCreative",
          args: [currentAdv],
        })

        // creative[5] is the status enum — 1 = Approved
        if (creative[5] === 1 && creative[0].length > 0) {
          ad = {
            sponsor: creative[2], // sponsorName
            title: creative[1],   // tagline
            lines: [...creative[0]],   // asciiLines
          }
          advertiserAddr = currentAdv
        } else {
          const dbAd = await getRandomActiveAd()
          if (!dbAd) return c.json({ error: "No active ads available" }, 503)
          ad = dbAd
          dbAdId = dbAd.id
        }
      } else {
        const dbAd = await getRandomActiveAd()
        if (!dbAd) return c.json({ error: "No active ads available" }, 503)
        ad = dbAd
        dbAdId = dbAd.id
      }
    } catch {
      const dbAd = await getRandomActiveAd()
      if (!dbAd) return c.json({ error: "No active ads available" }, 503)
      ad = dbAd
      dbAdId = dbAd.id
    }
  } else {
    // Direct-transfer mode: serve from DB
    const dbAd = await getRandomActiveAd()
    if (!dbAd) return c.json({ error: "No active ads available" }, 503)
    ad = dbAd
    dbAdId = dbAd.id
  }

  const claimId = crypto.randomUUID()
  const adId = dbAdId || `${ad.sponsor.toLowerCase()}-${Date.now()}`
  claims.set(claimId, {
    adId,
    sponsor: ad.sponsor,
    walletAddress: wallet,
    sessionID,
    createdAt: Date.now(),
    claimed: false,
    advertiserAddress: advertiserAddr,
  })

  // Track impression (fire-and-forget)
  trackAdEvent({
    campaignId: adId,
    advertiser: ad.sponsor,
    eventType: "impression",
    sessionID,
    walletAddress: wallet,
    metadata: {
      dbAdId: dbAdId ?? null,
      advertiserAddress: advertiserAddr ?? null,
      wallet,
    },
  }).catch(() => { })

  return c.json({
    adId,
    claimId,
    sponsor: ad.sponsor,
    title: ad.title,
    lines: [...ad.lines],
    dwellMs: 5000,
    rewardAmount: `$${env.rewardUsdc}`,
    onChain: Boolean(advertiserAddr),
    advertiser: advertiserAddr,
  })
})

// ──────────────────────────────────────────────
//  POST /ad/claim — Claim impression (on-chain or direct)
// ──────────────────────────────────────────────

app.post("/ad/claim", async (c) => {
  if (!sponsorAccount || !sponsorClient) {
    return c.json({ error: "sponsor wallet is not configured" }, 500)
  }

  const body = await c.req.json<{
    claimId?: string
    walletAddress?: string
    sessionID?: string
  }>()

  const claimId = body.claimId
  const walletAddress = body.walletAddress
  const sessionID = body.sessionID
  if (!claimId || !walletAddress || !sessionID) {
    return c.json({ error: "claimId, walletAddress, and sessionID are required" }, 400)
  }

  const claim = claims.get(claimId)
  if (!claim) return c.json({ error: "claim not found" }, 404)
  if (claim.claimed) return c.json({ error: "claim already used" }, 409)
  if (claim.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    return c.json({ error: "claim wallet mismatch" }, 409)
  }
  if (claim.sessionID !== sessionID) {
    return c.json({ error: "claim session mismatch" }, 409)
  }

  // Validate dwell time (must have been at least 3 seconds since claim was issued)
  const dwellMs = Date.now() - claim.createdAt
  if (dwellMs < 3000) {
    return c.json({ error: `Insufficient dwell time: ${dwellMs}ms (need 3000ms)` }, 400)
  }

  claim.claimed = true
  claims.set(claimId, claim)

  let hash: `0x${string}`

  if (useOnChainPool) {
    // ═══ ON-CHAIN MODE: Call AdPool.claimImpression() ═══
    try {
      hash = await sponsorClient.writeContract({
        account: sponsorAccount,
        chain: viemMonadTestnet,
        address: env.adPoolAddress as `0x${string}`,
        abi: adPoolAbi,
        functionName: "claimImpression",
        args: [walletAddress as `0x${string}`],
      })
      await publicClient.waitForTransactionReceipt({ hash })

      // Record in reputation oracle (fire-and-forget)
      if (env.reputationAddress) {
        sponsorClient
          .writeContract({
            account: sponsorAccount,
            chain: viemMonadTestnet,
            address: env.reputationAddress as `0x${string}`,
            abi: reputationAbi,
            functionName: "recordClaim",
            args: [walletAddress as `0x${string}`],
          })
          .catch(() => { }) // Non-critical
      }
    } catch (e) {
      claim.claimed = false // Allow retry
      const msg = e instanceof Error ? e.message : String(e)
      console.error("AdPool.claimImpression failed:", msg)
      return c.json({
        error: "On-chain claim failed",
        detail: msg.includes("NoActiveAdvertiser")
          ? "No active advertisers in pool"
          : msg.includes("DailyBudgetExceeded")
            ? "Advertiser daily budget exceeded"
            : msg,
      }, 500)
    }
  } else {
    // ═══ DIRECT-TRANSFER MODE (MVP): Simple USDC transfer ═══
    hash = await sponsorClient.writeContract({
      account: sponsorAccount,
      chain: viemMonadTestnet,
      address: env.usdcAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: "transfer",
      args: [walletAddress as `0x${string}`, rewardAmount],
    })
    await publicClient.waitForTransactionReceipt({ hash })
  }

  // Read user's new USDC balance
  const balance = await publicClient.readContract({
    address: env.usdcAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [walletAddress as `0x${string}`],
  })

  // Track analytics
  analyticsCounters.totalClaims++
  analyticsCounters.uniqueWallets.add(walletAddress.toLowerCase())

  ; (async () => {
    try {
      await trackAdEvent({
        campaignId: claim.adId,
        advertiser: claim.sponsor,
        eventType: "claim",
        sessionID,
        walletAddress,
        metadata: {
          claimId,
          dwellMs,
          advertiserAddress: claim.advertiserAddress ?? null,
        },
      })
    } catch (err) {
      console.error("Prisma telemetry error:", err)
    }
  })()


  return c.json({
    txHash: hash,
    rewardAmount: `$${env.rewardUsdc}`,
    balance: formatUnits(balance, 6),
    creditCount: Number(balance / rewardAmount),
    mode: useOnChainPool ? "on-chain" : "direct-transfer",
    explorer: `https://testnet.monadexplorer.com/tx/${hash}`,
  })
})

// ──────────────────────────────────────────────
//  GET /pool/stats — On-chain pool analytics
// ──────────────────────────────────────────────

app.get("/pool/stats", async (c) => {
  if (!useOnChainPool) {
    return c.json({ error: "On-chain pool not configured" }, 404)
  }

  try {
    const [activeCount, totalImpressions, impressionCostVal] = await Promise.all([
      publicClient.readContract({
        address: env.adPoolAddress as `0x${string}`,
        abi: adPoolAbi,
        functionName: "activeAdvertiserCount",
      }),
      publicClient.readContract({
        address: env.adPoolAddress as `0x${string}`,
        abi: adPoolAbi,
        functionName: "totalImpressions",
      }),
      publicClient.readContract({
        address: env.adPoolAddress as `0x${string}`,
        abi: adPoolAbi,
        functionName: "impressionCost",
      }),
    ])

    // Pool USDC balance
    const poolBalance = await publicClient.readContract({
      address: env.usdcAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [env.adPoolAddress as `0x${string}`],
    })

    return c.json({
      activeAdvertisers: Number(activeCount),
      totalImpressions: Number(totalImpressions),
      impressionCost: formatUnits(impressionCostVal, 6),
      poolBalance: formatUnits(poolBalance, 6),
      estimatedImpressionsRemaining:
        impressionCostVal > 0n ? Number(poolBalance / impressionCostVal) : 0,
      contracts: {
        adPool: env.adPoolAddress,
        registry: env.registryAddress || null,
        reputation: env.reputationAddress || null,
      },
    })
  } catch (e) {
    return c.json({ error: "Failed to read pool stats", detail: String(e) }, 500)
  }
})

// ──────────────────────────────────────────────
//  GET /reputation/:address — User/Advertiser reputation
// ──────────────────────────────────────────────

app.get("/reputation/:address", async (c) => {
  if (!env.reputationAddress) {
    return c.json({ error: "Reputation oracle not configured" }, 404)
  }

  const addr = c.req.param("address") as `0x${string}`

  try {
    const [userScoreVal, isThrottled] = await Promise.all([
      publicClient.readContract({
        address: env.reputationAddress as `0x${string}`,
        abi: reputationAbi,
        functionName: "userScore",
        args: [addr],
      }),
      publicClient.readContract({
        address: env.reputationAddress as `0x${string}`,
        abi: reputationAbi,
        functionName: "isThrottled",
        args: [addr],
      }),
    ])

    let advertiserScoreVal: bigint | undefined
    try {
      advertiserScoreVal = await publicClient.readContract({
        address: env.reputationAddress as `0x${string}`,
        abi: reputationAbi,
        functionName: "advertiserScore",
        args: [addr],
      })
    } catch {
      // Not an advertiser
    }

    return c.json({
      address: addr,
      userScore: Number(userScoreVal),
      advertiserScore: advertiserScoreVal !== undefined ? Number(advertiserScoreVal) : null,
      throttled: isThrottled,
    })
  } catch (e) {
    return c.json({ error: "Failed to read reputation", detail: String(e) }, 500)
  }
})

// ──────────────────────────────────────────────
//  POST /v1/chat/completions — x402-gated AI (Thirdweb)
// ──────────────────────────────────────────────

app.post("/v1/chat/completions", async (c) => {
  if (!env.openaiApiKey) {
    return c.json({ error: "OPENAI_API_KEY is not configured" }, 500)
  }
  if (!thirdwebX402Facilitator) {
    return c.json(
      {
        error:
          "x402 is not configured. Set THIRDWEB_SECRET_KEY and ADSHELL_PAY_TO (or ADSHELL_SPONSOR_PRIVATE_KEY).",
      },
      500,
    )
  }

  try {
    // x402 v1 sends "X-PAYMENT", v2 sends "PAYMENT-SIGNATURE" (Hono headers are case-insensitive)
    const paymentData = c.req.header("x-payment") ?? c.req.header("payment-signature")
    const requestUrl = new URL(c.req.url)
    const resourceUrl = `${requestUrl.origin}/v1/chat/completions`

    const result = await settlePayment({
      resourceUrl,
      method: "POST",
      paymentData,
      network: monadTestnet,
      price: `$${env.rewardUsdc}`,
      payTo: env.payTo || sponsorAccount?.address || "",
      facilitator: thirdwebX402Facilitator,
    })

    if (result.status !== 200) {
      // Log settlement errors for debugging
      const body = result.responseBody as Record<string, unknown> | undefined
      if (body?.error || body?.errorMessage) {
        console.error("[x402] Settlement failed:", body.error, "-", body.errorMessage)
        if (body.fundWalletLink) console.error("[x402] Fund wallet:", body.fundWalletLink)
      }
      // Payment required or failed — return the 402 / error response
      return new Response(
        JSON.stringify(result.responseBody),
        {
          status: result.status,
          headers: { "Content-Type": "application/json", ...(result.responseHeaders || {}) },
        },
      )
    }

    // Payment settled — forward to upstream AI
    console.log("=== x402 Payment Settled ===")
    console.log(JSON.stringify(result.paymentReceipt, null, 2))

    const body = await c.req.json<Record<string, unknown>>()
    const upstreamBody = {
      ...body,
      model: env.upstreamModel,
    }

    const upstream = await fetch(`${env.openaiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(upstreamBody),
    })

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => upstream.statusText)
      return new Response(JSON.stringify({ error: text || "upstream request failed" }), {
        status: upstream.status,
        headers: { "content-type": "application/json" },
      })
    }

    // Track AI call for analytics
    analyticsCounters.totalAICalls++

    // Record payment in reputation oracle (fire-and-forget)
    if (env.reputationAddress && sponsorClient && sponsorAccount) {
      const payer = (result.paymentReceipt as Record<string, unknown>)?.payer as string | undefined
      if (payer) {
        sponsorClient
          .writeContract({
            account: sponsorAccount,
            chain: viemMonadTestnet,
            address: env.reputationAddress as `0x${string}`,
            abi: reputationAbi,
            functionName: "recordPayment",
            args: [payer as `0x${string}`],
          })
          .catch(() => { }) // Non-critical
      }
    }

    const headers = new Headers(upstream.headers)
    headers.set("content-type", headers.get("content-type") || "text/event-stream")
    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("x402 payment error:", msg)
    return c.json(
      { error: "Payment processing failed", detail: msg },
      502,
    )
  }
})

// ──────────────────────────────────────────────
//  POST /advertiser/deposit — Advertiser onboarding
// ──────────────────────────────────────────────

app.post("/advertiser/deposit", async (c) => {
  if (!useOnChainPool) {
    return c.json({
      error: "On-chain pool not configured. Using direct-transfer mode.",
      mode: "direct-transfer",
    }, 400)
  }

  const body = await c.req.json<{ amount?: string }>()
  const amount = body.amount || "1.0" // Default 1 USDC

  // Return the info the advertiser's frontend wallet needs
  return c.json({
    adPoolAddress: env.adPoolAddress,
    usdcAddress: env.usdcAddress,
    requiredApproval: amount,
    steps: [
      `1. Approve USDC: call usdc.approve(${env.adPoolAddress}, ${amount} * 1e6)`,
      `2. Deposit: call adPool.deposit(${amount} * 1e6)`,
      `3. Submit creative to AdRegistry at ${env.registryAddress}`,
    ],
    network: env.network,
    explorer: "https://testnet.monadexplorer.com",
  })
})

// ──────────────────────────────────────────────
//  GET /analytics/public — Aggregate protocol metrics
// ──────────────────────────────────────────────

app.get("/analytics/public", async (c) => {
  let onChainMetrics: Record<string, unknown> = {}

  if (useOnChainPool) {
    try {
      const [activeCount, totalImpressions, poolBalance] = await Promise.all([
        publicClient.readContract({
          address: env.adPoolAddress as `0x${string}`,
          abi: adPoolAbi,
          functionName: "activeAdvertiserCount",
        }),
        publicClient.readContract({
          address: env.adPoolAddress as `0x${string}`,
          abi: adPoolAbi,
          functionName: "totalImpressions",
        }),
        publicClient.readContract({
          address: env.usdcAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [env.adPoolAddress as `0x${string}`],
        }),
      ])
      onChainMetrics = {
        activeAdvertisers: Number(activeCount),
        totalOnChainImpressions: Number(totalImpressions),
        poolBalanceUSDC: formatUnits(poolBalance, 6),
      }
    } catch {
      onChainMetrics = { error: "Failed to read on-chain data" }
    }
  }

  return c.json({
    protocol: "AdShell",
    network: env.network,
    mode: useOnChainPool ? "on-chain" : "direct-transfer",
    metrics: {
      totalImpressionsClaimed: analyticsCounters.totalClaims,
      totalAICalls: analyticsCounters.totalAICalls,
      totalUSDCDistributed: (analyticsCounters.totalClaims * Number(env.rewardUsdc)).toFixed(6),
      uniqueWallets: analyticsCounters.uniqueWallets.size,
      uptime: Math.floor((Date.now() - analyticsCounters.startedAt) / 1000),
      ...onChainMetrics,
    },
    contracts: useOnChainPool
      ? {
        adPool: env.adPoolAddress,
        registry: env.registryAddress || null,
        reputation: env.reputationAddress || null,
        payTo: env.payTo,
      }
      : null,
    explorer: "https://testnet.monadexplorer.com",
  })
})

// ──────────────────────────────────────────────
//  Admin API — Ad Management (protected by API key)
// ──────────────────────────────────────────────

app.use("/admin/*", async (c, next) => {
  const key = c.req.header("x-admin-key")
  if (!key || key !== (process.env.ADMIN_API_KEY || "adshell-admin")) {
    return c.json({ error: "Unauthorized" }, 401)
  }
  await next()
})

// List all ads (with stats)
app.get("/admin/ads", async (c) => {
  const ads = await prisma.ad.findMany({ orderBy: { createdAt: "desc" } })

  const impressions = await prisma.adEvent.groupBy({
    by: ["campaignId"],
    _count: { id: true },
    where: { eventType: "impression" },
  })
  const claimStats = await prisma.adEvent.groupBy({
    by: ["campaignId"],
    _count: { id: true },
    where: { eventType: "claim" },
  })

  const impMap = new Map(impressions.map((i) => [i.campaignId, i._count.id]))
  const claimMap = new Map(claimStats.map((i) => [i.campaignId, i._count.id]))

  const result = ads.map((ad) => ({
    ...ad,
    stats: {
      impressions: impMap.get(ad.id) || 0,
      claims: claimMap.get(ad.id) || 0,
    },
  }))

  return c.json(result)
})

// Create a new ad
app.post("/admin/ads", async (c) => {
  const body = await c.req.json<{
    sponsor: string
    title: string
    lines: string[]
    clickUrl?: string
  }>()

  if (!body.sponsor || !body.title || !body.lines?.length) {
    return c.json({ error: "sponsor, title, and lines are required" }, 400)
  }

  const ad = await prisma.ad.create({
    data: {
      sponsor: body.sponsor,
      title: body.title,
      lines: body.lines,
      clickUrl: body.clickUrl,
    },
  })

  return c.json(ad, 201)
})

// Update an ad
app.patch("/admin/ads/:id", async (c) => {
  const id = c.req.param("id")
  const body = await c.req.json<{
    sponsor?: string
    title?: string
    lines?: string[]
    clickUrl?: string
    isActive?: boolean
  }>()

  try {
    const ad = await prisma.ad.update({
      where: { id },
      data: {
        ...(body.sponsor !== undefined && { sponsor: body.sponsor }),
        ...(body.title !== undefined && { title: body.title }),
        ...(body.lines !== undefined && { lines: body.lines }),
        ...(body.clickUrl !== undefined && { clickUrl: body.clickUrl }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    })
    return c.json(ad)
  } catch {
    return c.json({ error: "Ad not found" }, 404)
  }
})

// Delete (soft-delete) an ad
app.delete("/admin/ads/:id", async (c) => {
  const id = c.req.param("id")
  try {
    await prisma.ad.update({ where: { id }, data: { isActive: false } })
    return c.json({ ok: true })
  } catch {
    return c.json({ error: "Ad not found" }, 404)
  }
})

// Get stats for a single ad
app.get("/admin/ads/:id/stats", async (c) => {
  const id = c.req.param("id")
  const ad = await prisma.ad.findUnique({ where: { id } })
  if (!ad) return c.json({ error: "Ad not found" }, 404)

  const [impressions, claims] = await Promise.all([
    prisma.adEvent.count({ where: { campaignId: id, eventType: "impression" } }),
    prisma.adEvent.count({ where: { campaignId: id, eventType: "claim" } }),
  ])

  return c.json({
    ad,
    impressions,
    claims,
    claimRate: impressions > 0 ? ((claims / impressions) * 100).toFixed(2) + "%" : "0%",
  })
})

// ──────────────────────────────────────────────
//  Start
// ──────────────────────────────────────────────

if (typeof Bun !== "undefined") {
  Bun.serve({
    port: env.port,
    fetch: app.fetch,
  })

  console.log("")
  console.log("╔═══════════════════════════════════════╗")
  console.log("║       AdShell Proxy v2.0              ║")
  console.log("╠═══════════════════════════════════════╣")
  console.log(`║  Port:     ${env.port}                       ║`)
  console.log(`║  Network:  ${env.network}            ║`)
  console.log(`║  Mode:     ${useOnChainPool ? "On-chain AdPool  " : "Direct Transfer  "}       ║`)
  console.log(`║  Model:    ${env.upstreamModel.padEnd(20)}    ║`)
  console.log("╚═══════════════════════════════════════╝")
  console.log("")
  console.log(`  Listening on http://127.0.0.1:${env.port}`)
  console.log(`  Health:     http://127.0.0.1:${env.port}/health`)
  console.log(`  Analytics:  http://127.0.0.1:${env.port}/analytics/public`)
  if (useOnChainPool) {
    console.log(`  Pool:       http://127.0.0.1:${env.port}/pool/stats`)
  }
  console.log("")
}

export default app
