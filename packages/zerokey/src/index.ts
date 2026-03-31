/**
 * @ronii/zerokey — Complete AI development platform
 *
 * This umbrella package re-exports:
 * - @ronii/zerokey-sdk — Client and server APIs
 *
 * @example
 * ```ts
 * import { createClient, createServer } from '@ronii/zerokey'
 * ```
 */

// Re-export SDK
export {
  createOpencodeClient,
  createOpencodeServer,
  createOpencode,
  OpencodeClient,
  type OpencodeClientConfig,
  type ServerOptions,
  type TuiOptions,
} from '@ronii/zerokey-sdk'

// Re-export SDK types
export type {
  Config,
} from '@ronii/zerokey-sdk'

// CLI is available via bin
// Run: npx @ronii/zerokey init
