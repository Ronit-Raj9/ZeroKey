/**
 * Executable name or absolute path for the ZeroKey / OpenCode-compatible CLI (native TUI).
 * @see ZEROKEY_BIN — preferred override
 * @see OPENCODE_BIN — legacy override
 */
export function resolveZerokeyExecutable(): string {
  const z = process.env.ZEROKEY_BIN?.trim()
  if (z) return z
  const o = process.env.OPENCODE_BIN?.trim()
  if (o) return o
  return "zerokey"
}

/** Match line printed by packages/opencode serve command. */
export function isServerListenLine(line: string): boolean {
  return /^\S+ server listening on http/.test(line.trim())
}
