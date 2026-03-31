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

### 1. Initialize CLI (Optional)

Configure OpenCode to use the hosted AdShell proxy:

```bash
npx @ronii/zerokey init
```

Or with a custom proxy URL:

```bash
npx @ronii/zerokey init --proxy https://your-proxy.example.com
```

### 2. Use the SDK

```ts
import { createClient, createServer } from '@ronii/zerokey'

// Create client
const client = createClient({
  baseURL: 'https://zerokey-8p3y.onrender.com/v1',
  apiKey: 'your-api-key'
})

// Create server (spawns local opencode server)
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
| `@ronii/zerokey` | Umbrella package (recommended) |
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
| `ZEROKEY_PROXY_URL` | Custom proxy URL | `https://zerokey-8p3y.onrender.com` |

## Requirements

- Node.js >= 18
- For UI: React 18+ or SolidJS 1.9+
- For x402 payments: Wallet with USDC on Monad testnet

## Publishing (Maintainers)

Packages are published via GitHub Actions:

```bash
# Tag a new release
git tag zerokey-v1.0.0
git push origin zerokey-v1.0.0
```

Or manually via GitHub Actions UI with package selection.

Publish order: sdk → ui → umbrella

## Links

- [GitHub](https://github.com/Ronit-Raj9/ZeroKey)
- [Documentation](https://zerokey.dev)
- [npm](https://www.npmjs.com/package/@ronii/zerokey)

## License

MIT
