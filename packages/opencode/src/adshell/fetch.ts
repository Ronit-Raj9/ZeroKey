import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { createThirdwebClient } from "thirdweb"
import type { ThirdwebClient } from "thirdweb"
import { monadTestnet } from "thirdweb/chains"
import { wrapFetchWithPayment } from "thirdweb/x402"
import { privateKeyToAccount } from "thirdweb/wallets"
import type { Wallet } from "thirdweb/wallets"
import { AdshellStateStore } from "./state"
import { ensureAdshellWallet } from "./wallet"

/**
 * Load thirdweb credentials from the adshell-proxy .env file.
 * The opencode CLI process doesn't have these in its own env,
 * so we read them from the sibling adshell-proxy package.
 */
function loadProxyEnv(): Record<string, string> {
  const vars: Record<string, string> = {}
  try {
    // Resolve relative to this file: src/adshell/fetch.ts → ../../.. → packages/opencode → ../../adshell-proxy/.env
    const envPath = resolve(dirname(import.meta.dir), "..", "..", "..", "adshell-proxy", ".env")
    const content = readFileSync(envPath, "utf-8")
    for (const line of content.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eqIdx = trimmed.indexOf("=")
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "")
      vars[key] = val
    }
  } catch {
    // .env not found — fall back to process.env
  }
  return vars
}

let _thirdwebClient: ThirdwebClient | undefined

function getThirdwebClient(): ThirdwebClient {
  if (!_thirdwebClient) {
    let clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || process.env.THIRDWEB_CLIENT_ID
    let secretKey = process.env.THIRDWEB_SECRET_KEY

    // If not in process env, load from adshell-proxy .env
    if (!clientId && !secretKey) {
      const proxyEnv = loadProxyEnv()
      clientId = proxyEnv.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || proxyEnv.THIRDWEB_CLIENT_ID
      secretKey = proxyEnv.THIRDWEB_SECRET_KEY
    }

    if (!clientId && !secretKey) {
      throw new Error("THIRDWEB_CLIENT_ID or THIRDWEB_SECRET_KEY must be set for x402 payments")
    }
    _thirdwebClient = createThirdwebClient(
      secretKey ? { secretKey } : { clientId: clientId! },
    )
  }
  return _thirdwebClient
}

let cache:
  | {
    key: string
    fetch: typeof globalThis.fetch
  }
  | undefined

/**
 * Build a minimal Wallet-compatible object from a private key.
 * thirdweb's wrapFetchWithPayment calls wallet.getAccount() and wallet.getChain(),
 * so we satisfy that interface with a private-key-derived account on Monad Testnet.
 */
function privateKeyWallet(client: ThirdwebClient, privateKey: string): Wallet {
  const account = privateKeyToAccount({
    client,
    privateKey,
  })

  return {
    id: "inApp",
    getAccount: () => account,
    getChain: () => monadTestnet,
    // Stubs for interface compliance — not called by wrapFetchWithPayment
    subscribe: () => () => { },
    connect: async () => account,
    autoConnect: async () => account,
    disconnect: async () => { },
    switchChain: async () => { },
    getConfig: () => undefined,
  } as unknown as Wallet
}

export async function createAdshellFetch() {
  const walletInfo = await ensureAdshellWallet()
  if (cache?.key === walletInfo.address) return cache.fetch

  const client = getThirdwebClient()
  const wallet = privateKeyWallet(client, walletInfo.privateKey)
  const paidFetch = wrapFetchWithPayment(fetch, client, wallet)

  const wrapped = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let response: Response
    try {
      response = await paidFetch(input instanceof URL ? input.toString() : input, init)
    } catch (e) {
      // Surface clear error when payment fails
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes("insufficient") || msg.includes("balance")) {
        throw new Error("Payment failed: insufficient USDC balance. Watch an ad to earn more credits.")
      }
      throw e
    }

    if (!response.ok) return response

    // Track payment from response headers
    try {
      const receiptHeader = response.headers.get("x-payment-receipt")
      if (receiptHeader) {
        const receipt = JSON.parse(receiptHeader) as Record<string, unknown>
        const txHash =
          (receipt.transactionHash as string) ??
          (receipt.transaction_hash as string) ??
          (receipt.txHash as string) ??
          (receipt.tx_hash as string)
        if (txHash) {
          const state = await AdshellStateStore.get()
          const explorerUrl = `https://testnet.monadexplorer.com/tx/${txHash}`
          await AdshellStateStore.patch({
            lastPaymentTx: txHash,
            lastPaymentExplorer: explorerUrl,
            creditCount: Math.max(0, state.creditCount - 1),
            lifetimeAICalls: state.lifetimeAICalls + 1,
          })
        }
      }
    } catch {
      // No settlement headers on non-paid or already-handled responses.
    }

    return response
  }

  cache = {
    key: walletInfo.address,
    fetch: wrapped as typeof globalThis.fetch,
  }
  return wrapped
}
