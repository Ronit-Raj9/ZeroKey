#!/usr/bin/env node
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import process from "node:process"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { xdgConfig } from "xdg-basedir"

/** Default proxy when package.json has no zerokey.defaultProxy (dev). */
const FALLBACK_PROXY_ORIGIN = "https://zerokey-8p3y.onrender.com"

function findPackageJsonPath(): string | undefined {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 12; i++) {
    const candidate = path.join(dir, "package.json")
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

function readDefaultProxyFromPackage(): string {
  try {
    const pkgPath = findPackageJsonPath()
    if (!pkgPath) return ""
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
      zerokey?: { defaultProxy?: string }
    }
    return pkg.zerokey?.defaultProxy?.trim() ?? ""
  } catch {
    return ""
  }
}

function effectiveProxyBaseV1(): string {
  const fromPkg = readDefaultProxyFromPackage()
  const raw = (fromPkg || FALLBACK_PROXY_ORIGIN).trim().replace(/\/+$/, "")
  return raw.endsWith("/v1") ? raw : `${raw}/v1`
}

const PROXY_URL = effectiveProxyBaseV1()

const ZEROKEY_DIR = path.join(os.homedir(), ".zerokey")
const WALLET_PATH = path.join(ZEROKEY_DIR, "wallet.json")

export function opencodeConfigDir(): string {
  const base = xdgConfig ?? path.join(os.homedir(), ".config")
  return path.join(base, "opencode")
}

function normalizeProxyBaseV1(raw: string): string {
  const t = raw.trim().replace(/\/+$/, "")
  if (t.endsWith("/v1")) return t
  return `${t}/v1`
}

function buildOpenCodeConfig(baseURL: string) {
  return {
    $schema: "https://opencode.ai/config.json",
    provider: {
      adshell: {
        npm: "@ai-sdk/openai-compatible",
        name: "AdShell",
        options: {
          baseURL,
          apiKey: "adshell-demo",
          headers: {
            "x-adshell-client": "zerokey",
          },
          timeout: 300_000,
          chunkTimeout: 30_000,
        },
        models: {
          "adshell-demo": {
            name: "AdShell Demo",
            id: "adshell-demo",
            limit: {
              context: 200_000,
              output: 8192,
            },
            temperature: true,
            reasoning: false,
            attachment: true,
            tool_call: true,
            modalities: {
              input: ["text", "image"],
              output: ["text"],
            },
            cost: {
              input: 0,
              output: 0,
            },
          },
        },
      },
      opencode: {
        options: {},
      },
    },
    permission: {
      edit: {},
    },
    mcp: {},
    tools: {},
  }
}

export function getOrCreateWallet() {
  if (fs.existsSync(WALLET_PATH)) {
    const { privateKey } = JSON.parse(fs.readFileSync(WALLET_PATH, "utf-8")) as { privateKey: `0x${string}` }
    return privateKeyToAccount(privateKey)
  }

  const privateKey = generatePrivateKey()
  fs.mkdirSync(ZEROKEY_DIR, { recursive: true })
  fs.writeFileSync(WALLET_PATH, JSON.stringify({ privateKey }, "utf-8"))
  console.log("✅ ZeroKey wallet created at ~/.zerokey/wallet.json")
  console.log(`   Address: ${privateKeyToAccount(privateKey).address}`)

  return privateKeyToAccount(privateKey)
}

async function chatWithAI(
  account: ReturnType<typeof privateKeyToAccount>,
  messages: Array<{ role: string; content: string }>,
  model = "adshell-demo",
) {
  const payment = {
    payer: account.address,
    amount: 1,
    resource: "chat/completions",
    timestamp: Date.now(),
  }

  const signature = await account
    .sign({
      hash: await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payment))),
    })
    .catch(() => "0x00")

  const response = await fetch(`${PROXY_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Payment-Payload": JSON.stringify(payment),
      "X-Payment-Signature": signature,
      "X-AdShell-Client": "zerokey-cli",
    },
    body: JSON.stringify({ model, messages, stream: false }),
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return data.choices?.[0]?.message?.content || "No response"
}

async function startREPL(account: ReturnType<typeof privateKeyToAccount>) {
  console.log("\n🔑 ZeroKey AI Assistant")
  console.log(`   Wallet: ${account.address}`)
  console.log(`   Proxy: ${PROXY_URL}`)
  console.log("\nType your message and press Enter. Type 'quit' to exit.\n")

  const messages: Array<{ role: string; content: string }> = []
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "> " })

  rl.prompt()

  for await (const line of rl) {
    const input = line.trim()
    if (input === "quit" || input === "exit") {
      console.log("Goodbye!")
      rl.close()
      process.exit(0)
    }
    if (!input) {
      rl.prompt()
      continue
    }

    messages.push({ role: "user", content: input })

    try {
      console.log("\nThinking...")
      const response = await chatWithAI(account, messages)
      messages.push({ role: "assistant", content: response })
      console.log(`\n${response}\n`)
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : "Unknown error"}`)
      messages.pop()
    }

    rl.prompt()
  }
}

function showWallet() {
  const account = getOrCreateWallet()
  console.log("\n🔑 ZeroKey Wallet")
  console.log(`   Address: ${account.address}`)
  console.log(`   Path: ${WALLET_PATH}\n`)
}

function runInit(proxyUrl: string | null) {
  const fromCliOrEnv = proxyUrl?.trim() || ""
  const fromPackage = readDefaultProxyFromPackage()
  const fallbackLocal = "http://127.0.0.1:4021"
  const raw = fromCliOrEnv || process.env.ZEROKEY_PROXY_URL?.trim() || fromPackage || fallbackLocal
  const resolved = normalizeProxyBaseV1(raw)
  const dir = opencodeConfigDir()
  const target = path.join(dir, "opencode.jsonc")
  fs.mkdirSync(dir, { recursive: true })
  const config = buildOpenCodeConfig(resolved)
  fs.writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`, "utf-8")
  console.log(`Wrote ${target}`)
  console.log(`  baseURL: ${resolved}`)
  console.log(`Run the ZeroKey TUI with: zerokey start`)
}

/** Map process.platform/arch to optional package suffix (matches native build artifact names). */
function platformArtifactSuffix(): string {
  const p = process.platform
  const a = process.arch
  const os = p === "win32" ? "windows" : p === "darwin" ? "darwin" : "linux"
  return `${os}-${a}`
}

/**
 * Resolve the native ZeroKey CLI binary from an optional @ronii/zerokey-<platform>-<arch> dependency.
 */
export function resolveNativeZerokeyBinary(): string {
  const direct = process.env.ZEROKEY_BIN_PATH?.trim() || process.env.OPENCODE_BIN_PATH?.trim()
  if (direct && fs.existsSync(direct)) return direct

  const req = createRequire(import.meta.url)
  const suffix = platformArtifactSuffix()
  const scoped = `@ronii/zerokey-${suffix}`
  try {
    const pkgJson = req.resolve(`${scoped}/package.json`)
    const dir = path.dirname(pkgJson)
    const exe = process.platform === "win32" ? "zerokey.exe" : "zerokey"
    const bin = path.join(dir, "bin", exe)
    if (fs.existsSync(bin)) return bin
  } catch {
    // try unscoped legacy layout
  }
  const legacy = `zerokey-${suffix}`
  try {
    const pkgJson = req.resolve(`${legacy}/package.json`)
    const dir = path.dirname(pkgJson)
    const exe = process.platform === "win32" ? "zerokey.exe" : "zerokey"
    const bin = path.join(dir, "bin", exe)
    if (fs.existsSync(bin)) return bin
  } catch {
    // fall through
  }

  throw new Error(
    `Native ZeroKey binary not found for ${suffix}. Install optional deps: npm install @ronii/zerokey\n` +
      `Or set ZEROKEY_BIN_PATH to your built binary (see zerokey/packages/opencode build).`,
  )
}

function runStart(extraArgs: string[]) {
  let bin: string
  try {
    bin = resolveNativeZerokeyBinary()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  }
  const child = spawn(bin, extraArgs, { stdio: "inherit", env: process.env })
  child.on("exit", (code) => process.exit(code ?? 1))
}

function printHelp() {
  console.log(`
🔑 ZeroKey — AdShell proxy, wallet, and OpenCode-based TUI

Usage:
  zerokey              Interactive chat (default)
  zerokey chat         Interactive chat with bundled viem wallet
  zerokey wallet       Show ~/.zerokey/wallet.json
  zerokey init         Write OpenCode global config (~/.config/opencode/opencode.jsonc)
  zerokey start [...]  Launch the ZeroKey terminal UI (native binary from @ronii/zerokey-<platform>)
  zerokey help         Show this help

Environment:
  ZEROKEY_PROXY_URL     Proxy origin for init / default (see package.json zerokey.defaultProxy)
  ZEROKEY_BIN_PATH      Path to native zerokey binary (overrides optional package resolution)
  OPENCODE_BIN_PATH     Same as ZEROKEY_BIN_PATH (compat)
`)
}

export function main(argv: string[]) {
  const first = argv[0]

  if (first === "help" || first === "--help" || first === "-h") {
    printHelp()
    return
  }

  if (first === "init") {
    let proxy: string | null = null
    for (let i = 1; i < argv.length; i++) {
      if (argv[i] === "--proxy" || argv[i] === "-p") {
        proxy = argv[++i] ?? null
        break
      }
    }
    runInit(proxy)
    return
  }

  if (first === "start") {
    runStart(argv.slice(1))
    return
  }

  if (first === "wallet") {
    showWallet()
    return
  }

  if (first === "chat" || first === undefined) {
    startREPL(getOrCreateWallet()).catch((err) => {
      console.error("Fatal error:", err)
      process.exit(1)
    })
    return
  }

  console.error(`Unknown command: ${first}`)
  console.error("Run `zerokey help` for usage.")
  process.exit(1)
}

if (process.argv[1]?.endsWith("cli.js") || process.argv[1]?.endsWith("cli.ts")) {
  main(process.argv.slice(2))
}
