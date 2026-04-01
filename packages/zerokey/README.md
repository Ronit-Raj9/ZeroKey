# @ronii/zerokey

**ZeroKey** — Complete AI development platform with AdShell proxy integration.

One npm install gives you access to:
- **SDK** — Client and server APIs for AI integration
- **UI** — React/SolidJS components for building AI interfaces
- **CLI** — Quick setup and configuration tools

## Installation

```bash
npm install @ronii/zerokey
```

That's it! No need to install additional packages.

## Quick Start

### 1. Initialize and run the terminal UI

Write global OpenCode-compatible config so the AdShell provider points at your proxy:

```bash
npx @ronii/zerokey init
npx @ronii/zerokey init --proxy https://your-proxy.example.com
```

Launch the **ZeroKey TUI** (native binary installed via optional `@ronii/zerokey-runtime`):

```bash
npx @ronii/zerokey start
```

Quick **chat** (bundled viem wallet, no TUI):

```bash
npx @ronii/zerokey chat
```

### 2. Use the SDK

```ts
import { createClient, createServer } from '@ronii/zerokey'

// Create client
const client = createClient({
  baseURL: 'https://zerokey-8p3y.onrender.com/v1',
  apiKey: 'your-api-key'
})

// Create server (spawns local zerokey CLI — set ZEROKEY_BIN if not on PATH)
const { client, server } = await createOpencode({
  port: 4096,
  hostname: '127.0.0.1'
})
```

### 3. Use UI Components (React/SolidJS)

```tsx
import { ZeroKeyProvider, ChatPanel } from '@ronii/zerokey/ui'

function App() {
  return (
    <ZeroKeyProvider config={{ baseURL: '...' }}>
      <ChatPanel />
    </ZeroKeyProvider>
  )
}
```

## Package Structure

| Package | Description |
|---------|-------------|
| `@ronii/zerokey` | Umbrella package: JS CLI + SDK/UI re-exports |
| `@ronii/zerokey-runtime` | Optional meta-package: native `zerokey` binaries per OS (published from `zerokey/packages/opencode`) |
| `@ronii/zerokey-sdk` | Client/server APIs (included in umbrella) |
| `@ronii/zerokey-ui` | UI components (included in umbrella) |

## Imports

```ts
// Main exports (umbrella)
import { createClient, createServer } from '@ronii/zerokey'

// SDK only
import { createClient } from '@ronii/zerokey/sdk'

// UI only
import { ChatPanel } from '@ronii/zerokey/ui'

// CLI
// npx @ronii/zerokey init
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ZEROKEY_PROXY_URL` | Custom proxy URL for `init` / chat | From `package.json` → `zerokey.defaultProxy` |
| `ZEROKEY_BIN_PATH` | Absolute path to native TUI binary | _(optional package resolution)_ |
| `ZEROKEY_BIN` | CLI name or path for SDK `createOpencode*` spawns | `zerokey` |
| `OPENCODE_BIN` | Same as `ZEROKEY_BIN` (compat) | `zerokey` |

## Requirements

- Node.js >= 18
- For UI: React 18+ or SolidJS 1.9+
- For x402 payments: Wallet with USDC on Monad testnet

## Publishing (Maintainers)

1. **Native runtime** — From `zerokey/packages/opencode`: run `bun run build` (or `--single` for current OS), then `bun run verify-dist`, then `bun run script/publish.ts` (publishes each `@ronii/zerokey-<platform>-<arch>` and the meta-package `@ronii/zerokey-runtime`).
2. **SDK / UI / umbrella** — Publish `@ronii/zerokey-sdk`, `@ronii/zerokey-ui`, then `@ronii/zerokey`. Bump `optionalDependencies.@ronii/zerokey-runtime` on the umbrella to match the published runtime version.

```bash
cd zerokey/packages/opencode && bun run build && bun run verify-dist
# then publish native tarballs + @ronii/zerokey-runtime (see script/publish.ts)
```

## Links

- [GitHub](https://github.com/Ronit-Raj9/ZeroKey)
- [Documentation](https://zerokey.dev)
- [npm](https://www.npmjs.com/package/@ronii/zerokey)

## License

MIT
