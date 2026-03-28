import { x402Client, x402HTTPClient } from "@x402/core/client"
import { wrapFetchWithPayment } from "@x402/fetch"
import { registerExactEvmScheme } from "@x402/evm/exact/client"
import { AdshellStateStore } from "./state"
import { getAdshellAccount } from "./wallet"

let cache:
  | {
    key: string
    fetch: typeof globalThis.fetch
  }
  | undefined

function responseHeaderLookup(response: Response) {
  return (name: string) => response.headers.get(name) ?? response.headers.get(name.toLowerCase())
}

export async function createAdshellFetch() {
  const account = await getAdshellAccount()
  if (cache?.key === account.address) return cache.fetch

  const client = new x402Client()
  registerExactEvmScheme(client, { signer: account })
  const paymentClient = new x402HTTPClient(client)
  const paidFetch = wrapFetchWithPayment(fetch, client)

  const wrapped = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let response: Response
    try {
      response = await paidFetch(input, init)
    } catch (e) {
      // Surface clear error when payment fails
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes("insufficient") || msg.includes("balance")) {
        throw new Error("Payment failed: insufficient USDC balance. Watch an ad to earn more credits.")
      }
      throw e
    }

    if (!response.ok) return response

    try {
      const settled = paymentClient.getPaymentSettleResponse(responseHeaderLookup(response))
      const txHash =
        (settled as any)?.transactionHash ??
        (settled as any)?.transaction_hash ??
        (settled as any)?.txHash ??
        (settled as any)?.tx_hash
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
    } catch {
      // No settlement headers on non-paid or already-handled responses.
    }

    return response
  }

  cache = {
    key: account.address,
    fetch: wrapped as typeof globalThis.fetch,
  }
  return wrapped
}
