import { AdshellStateStore, type AdshellAd } from "./state"
import { ensureAdshellWallet } from "./wallet"

export type AdshellClaimResponse = {
  txHash?: string
  rewardAmount?: string
  creditCount?: number
  balance?: string
  mode?: "direct-transfer" | "on-chain"
  explorer?: string
}

function proxyUrl() {
  return process.env.ADSHELL_PROXY_URL || "http://127.0.0.1:4021"
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    throw new Error(text || `AdShell request failed with ${response.status}`)
  }
  return response.json() as Promise<T>
}

export namespace AdshellApi {
  export async function currentAd(sessionID: string) {
    const wallet = await ensureAdshellWallet()
    const url = new URL("/ad/current", proxyUrl())
    url.searchParams.set("wallet", wallet.address)
    url.searchParams.set("session", sessionID)

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    })
    const ad = await parseJson<AdshellAd>(response)
    await AdshellStateStore.patch({
      pendingClaimId: ad.claimId,
      currentAd: ad,
    })
    return ad
  }

  export async function claim(sessionID: string, claimId?: string) {
    const state = await AdshellStateStore.get()
    const wallet = await ensureAdshellWallet()
    const activeClaimId = claimId ?? state.pendingClaimId
    if (!activeClaimId) throw new Error("No AdShell claim is pending")

    const response = await fetch(new URL("/ad/claim", proxyUrl()), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        claimId: activeClaimId,
        sessionID,
        walletAddress: wallet.address,
      }),
    })

    const result = await parseJson<AdshellClaimResponse>(response)
    await AdshellStateStore.patch({
      pendingClaimId: undefined,
      currentAd: undefined,
      creditCount: Math.max(0, Number(result.creditCount ?? state.creditCount + 1)),
      lastRewardTx: result.txHash ?? state.lastRewardTx,
      lastRewardExplorer: result.explorer ?? state.lastRewardExplorer,
      lifetimeImpressions: state.lifetimeImpressions + 1,
      mode: result.mode ?? state.mode,
    })
    return result
  }
}
