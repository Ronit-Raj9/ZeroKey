import path from "path"
import { Global } from "@/global"
import { Filesystem } from "@/util/filesystem"

export type AdshellAd = {
  adId: string
  claimId: string
  sponsor: string
  title: string
  lines: string[]
  dwellMs: number
  rewardAmount: string
  onChain?: boolean
  advertiser?: string
}

export type EncryptedKey = {
  salt: string
  iv: string
  tag: string
  ciphertext: string
}

export type AdshellState = {
  walletPrivateKey?: `0x${string}`
  walletAddress?: `0x${string}`
  encryptedKey?: EncryptedKey
  creditCount: number
  pendingClaimId?: string
  lastRewardTx?: string
  lastPaymentTx?: string
  lastRewardExplorer?: string
  lastPaymentExplorer?: string
  currentAd?: AdshellAd
  lifetimeImpressions: number
  lifetimeAICalls: number
  mode?: "direct-transfer" | "on-chain"
  updatedAt: number
}

const file = path.join(Global.Path.data, "adshell.json")

function normalize(input: Partial<AdshellState> | undefined): AdshellState {
  return {
    walletPrivateKey: input?.walletPrivateKey,
    walletAddress: input?.walletAddress,
    encryptedKey: input?.encryptedKey,
    creditCount: Math.max(0, Number(input?.creditCount ?? 0) || 0),
    pendingClaimId: input?.pendingClaimId,
    lastRewardTx: input?.lastRewardTx,
    lastPaymentTx: input?.lastPaymentTx,
    lastRewardExplorer: input?.lastRewardExplorer,
    lastPaymentExplorer: input?.lastPaymentExplorer,
    currentAd: input?.currentAd,
    lifetimeImpressions: Number(input?.lifetimeImpressions ?? 0) || 0,
    lifetimeAICalls: Number(input?.lifetimeAICalls ?? 0) || 0,
    mode: input?.mode,
    updatedAt: Number(input?.updatedAt ?? Date.now()) || Date.now(),
  }
}

export namespace AdshellStateStore {
  export async function get() {
    const data = await Filesystem.readJson<Partial<AdshellState>>(file).catch(() => undefined)
    return normalize(data)
  }

  export async function set(input: Partial<AdshellState>) {
    const next = normalize(input)
    await Filesystem.writeJson(file, next, 0o600)
    return next
  }

  export async function patch(input: Partial<AdshellState>) {
    const current = await get()
    return set({
      ...current,
      ...input,
      updatedAt: Date.now(),
    })
  }

  export async function clearPendingClaim() {
    return patch({
      pendingClaimId: undefined,
      currentAd: undefined,
    })
  }
}
