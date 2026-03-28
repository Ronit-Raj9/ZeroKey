import type { DialogContext } from "@/cli/cmd/tui/ui/dialog"
import type { ToastContext } from "@/cli/cmd/tui/ui/toast"
import { AdshellApi } from "./api"
import { AdshellStateStore } from "./state"
import { DialogAdshell } from "@/cli/cmd/tui/component/dialog-adshell"
import { ensureAdshellWallet } from "./wallet"

function formatHash(hash?: string) {
  if (!hash) return undefined
  if (hash.length <= 16) return hash
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`
}

export namespace AdshellFlow {
  export async function ensureCredit(input: {
    dialog: DialogContext
    toast: ToastContext
    sessionID: string
  }) {
    await ensureAdshellWallet()

    const current = await AdshellStateStore.get()
    if (current.creditCount > 0) return true

    // Attempt to recover a pending claim (e.g. app crashed mid-claim)
    if (current.pendingClaimId) {
      try {
        const resumed = await AdshellApi.claim(input.sessionID, current.pendingClaimId)
        const hashDisplay = formatHash(resumed.txHash) ?? ""
        const modeTag = resumed.mode === "on-chain" ? " [⛓ on-chain]" : ""
        input.toast.show({
          message: `Recovered AdShell claim${modeTag} ${hashDisplay}`.trim(),
          variant: "success",
        })
        return true
      } catch {
        await AdshellStateStore.clearPendingClaim()
      }
    }

    // Full ad flow: fetch → display → dwell → claim
    try {
      const ad = await AdshellApi.currentAd(input.sessionID)

      // Show the ad dialog and wait for user to watch
      const watched = await DialogAdshell.show(input.dialog, ad)
      if (!watched) {
        await AdshellStateStore.clearPendingClaim()
        return false
      }

      // Claim the impression
      input.toast.show({
        message: "Settling on Monad...",
        variant: "info",
      })

      const result = await Promise.race([
        AdshellApi.claim(input.sessionID, ad.claimId),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Monad settlement timed out after 10s")), 10000),
        ),
      ])

      const modeTag = result.mode === "on-chain" ? " ⛓" : ""
      const explorerDisplay = result.explorer
        ? ` → ${formatHash(result.txHash)}`
        : formatHash(result.txHash) ?? ""
      input.toast.show({
        message: `✅ Earned ${result.rewardAmount ?? "$0.001"}${modeTag} ${explorerDisplay}`.trim(),
        variant: "success",
      })
      return true
    } catch (error) {
      await AdshellStateStore.clearPendingClaim()
      const msg = error instanceof Error ? error.message : "Failed to claim AdShell credit"

      // User-friendly error messages
      let displayMsg = msg
      if (msg.includes("No active advertisers")) {
        displayMsg = "No advertisers in pool — using direct-transfer mode."
      } else if (msg.includes("timed out")) {
        displayMsg = "Monad settlement timed out — try again."
      } else if (msg.includes("Rate limited")) {
        displayMsg = "Rate limited — too many claims. Try again in a minute."
      }

      input.toast.show({
        message: displayMsg,
        variant: "error",
      })
      return false
    }
  }
}
