import { TextAttributes } from "@opentui/core"
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "../ui/dialog"
import type { AdshellAd } from "@/adshell/state"

type DialogAdshellProps = {
  ad: AdshellAd
  onConfirm?: () => void
  onCancel?: () => void
}

export function DialogAdshell(props: DialogAdshellProps) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const dwellSeconds = Math.max(0, Math.ceil(props.ad.dwellMs / 1000))
  const [remaining, setRemaining] = createSignal(dwellSeconds)
  const [elapsed, setElapsed] = createSignal(0)
  const ready = createMemo(() => remaining() <= 0)

  // Progress bar width
  const progressWidth = 40
  const progressFilled = createMemo(() => {
    if (dwellSeconds === 0) return progressWidth
    return Math.min(progressWidth, Math.floor((elapsed() / dwellSeconds) * progressWidth))
  })
  const progressBar = createMemo(() => {
    const filled = progressFilled()
    return "█".repeat(filled) + "░".repeat(progressWidth - filled)
  })

  onMount(() => {
    const timer = setInterval(() => {
      setElapsed((v) => v + 1)
      setRemaining((value) => {
        if (value <= 1) {
          clearInterval(timer)
          return 0
        }
        return value - 1
      })
    }, 1000)
    onCleanup(() => clearInterval(timer))
  })

  useKeyboard((evt) => {
    if (evt.name === "escape") {
      if (!ready()) {
        // Non-dismissable during dwell — ignore escape
        evt.preventDefault()
        evt.stopPropagation()
        return
      }
      props.onCancel?.()
      dialog.clear()
      evt.preventDefault()
      evt.stopPropagation()
      return
    }
    if (evt.name !== "return") return
    if (!ready()) return
    props.onConfirm?.()
    dialog.clear()
    evt.preventDefault()
    evt.stopPropagation()
  })

  return (
    <box flexDirection="column" paddingLeft={2} paddingRight={2} gap={1}>
      {/* Header */}
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          ◈ Sponsored Credit
        </text>
        <box flexDirection="row" gap={1}>
          <Show when={props.ad.onChain}>
            <text fg={theme.success}>⛓ on-chain</text>
          </Show>
          <text fg={theme.textMuted}>
            {ready() ? "press enter" : "esc disabled"}
          </text>
        </box>
      </box>

      {/* Subtitle */}
      <text fg={theme.textMuted}>
        Watch this ad to earn {props.ad.rewardAmount} USDC on Monad and unlock your next AI call.
      </text>

      {/* Ad Creative Box */}
      <box
        flexDirection="column"
        border={["top", "right", "bottom", "left"]}
        borderColor={ready() ? theme.success : theme.border}
        paddingLeft={2}
        paddingRight={2}
      >
        <text attributes={TextAttributes.BOLD} fg={theme.primary}>
          {props.ad.title}
        </text>
        <text fg={theme.textMuted}>by {props.ad.sponsor}</text>
        <box height={1} />
        <For each={props.ad.lines}>
          {(line) => <text fg={theme.text}>{line}</text>}
        </For>
      </box>

      {/* Progress Bar */}
      <box flexDirection="column">
        <text fg={ready() ? theme.success : theme.primary}>
          {progressBar()}
        </text>
        <text fg={ready() ? theme.success : theme.textMuted}>
          {ready()
            ? "✅ Earned! Press Enter to claim and resume."
            : `Earning ${props.ad.rewardAmount} USDC on Monad... ${remaining()}s remaining`}
        </text>
      </box>

      {/* Buttons */}
      <box flexDirection="row" justifyContent="space-between" alignItems="center" paddingBottom={1}>
        <text fg={theme.textMuted}>
          {props.ad.advertiser
            ? `Advertiser: ${props.ad.advertiser.slice(0, 8)}...${props.ad.advertiser.slice(-4)}`
            : `Ad: ${props.ad.adId}`}
        </text>
        <box flexDirection="row" gap={1}>
          <box
            paddingLeft={3}
            paddingRight={3}
            border={["top", "right", "bottom", "left"]}
            borderColor={theme.border}
            onMouseUp={() => {
              if (!ready()) return
              props.onCancel?.()
              dialog.clear()
            }}
          >
            <text fg={theme.textMuted}>{ready() ? "skip" : "..."}</text>
          </box>
          <box
            paddingLeft={3}
            paddingRight={3}
            backgroundColor={ready() ? theme.primary : theme.backgroundElement}
            onMouseUp={() => {
              if (!ready()) return
              props.onConfirm?.()
              dialog.clear()
            }}
          >
            <text fg={ready() ? theme.selectedListItemText : theme.textMuted}>
              {ready() ? "⚡ claim" : `${remaining()}s`}
            </text>
          </box>
        </box>
      </box>
    </box>
  )
}

DialogAdshell.show = (dialog: DialogContext, ad: AdshellAd) => {
  return new Promise<boolean>((resolve) => {
    dialog.replace(() => <DialogAdshell ad={ad} onConfirm={() => resolve(true)} onCancel={() => resolve(false)} />, () =>
      resolve(false),
    )
    dialog.setSize("large")
  })
}
