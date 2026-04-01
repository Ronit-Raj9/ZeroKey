/**
 * @ronii/zerokey/sdk — re-exports @opencode-ai/sdk
 *
 * @example
 * ```ts
 * import { createClient, createServer } from '@ronii/zerokey/sdk'
 * ```
 */

export {
  createOpencodeClient,
  createOpencodeServer,
  createOpencode,
  OpencodeClient,
  type OpencodeClientConfig,
  type ServerOptions,
  type TuiOptions,
} from '@opencode-ai/sdk'

export type {
  Config,
} from '@opencode-ai/sdk'
