/**
 * @ronii/zerokey — Complete AI development platform
 *
 * This umbrella package re-exports:
 * - @opencode-ai/sdk — Client and server APIs
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
} from '@opencode-ai/sdk'

// Re-export SDK types
export type {
  Config,
} from '@opencode-ai/sdk'

// CLI: npx @ronii/zerokey init | start | chat | wallet
