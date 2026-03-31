#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { xdgConfig } from "xdg-basedir";
/** Walk up from this file until we find package.json (works for dist/cli.js or root cli.mjs). */
function findPackageJsonPath() {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 8; i++) {
        const candidate = path.join(dir, "package.json");
        if (fs.existsSync(candidate))
            return candidate;
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return undefined;
}
/** Public adshell-proxy base URL (https origin; /v1 is appended automatically). Set in package.json → zerokey.defaultProxy before npm publish so `npx @ronii/zerokey init` needs no flags. */
function readDefaultProxyFromPackage() {
    try {
        const pkgPath = findPackageJsonPath();
        if (!pkgPath)
            return "";
        const raw = fs.readFileSync(pkgPath, "utf8");
        const pkg = JSON.parse(raw);
        const u = pkg.zerokey?.defaultProxy?.trim();
        if (u)
            return u;
    }
    catch {
        // missing package.json or parse error
    }
    return "";
}
/** OpenCode global config dir — matches packages/opencode Global.Path.config */
export function opencodeConfigDir() {
    const base = xdgConfig ?? path.join(os.homedir(), ".config");
    return path.join(base, "opencode");
}
function normalizeProxyBaseV1(raw) {
    const t = raw.trim().replace(/\/+$/, "");
    if (t.endsWith("/v1"))
        return t;
    return `${t}/v1`;
}
function buildOpenCodeConfig(baseURL) {
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
                        "x-adshell-client": "opencode",
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
    };
}
function parseArgs(argv) {
    let proxy = process.env.ZEROKEY_PROXY_URL?.trim() || null;
    let command = null;
    let help = false;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--help" || a === "-h") {
            help = true;
            continue;
        }
        if (a === "--proxy" || a === "-p") {
            proxy = argv[++i]?.trim() ?? null;
            continue;
        }
        if (!a.startsWith("-") && !command) {
            command = a;
        }
    }
    return { command, proxy, help };
}
function printHelp() {
    console.log(`@ronii/zerokey — write OpenCode global config for AdShell / Zerokey

Usage:
  zerokey init [options]

Options:
  --proxy, -p <url>   Adshell proxy base (OpenAI-compatible /v1). Overrides ZEROKEY_PROXY_URL.
  -h, --help          Show this help

Environment:
  ZEROKEY_PROXY_URL   Overrides the published default (see package.json zerokey.defaultProxy).

Default (no flags, no env): from package.json "zerokey.defaultProxy" after publish, or
  http://127.0.0.1:4021/v1 if that field is empty (local dev).

This overwrites: <XDG_CONFIG_HOME>/opencode/opencode.jsonc
(typically ~/.config/opencode/opencode.jsonc on Linux.)

Requires: OpenCode CLI, a wallet with USDC on Monad testnet for x402-gated chat completions.
`);
}
function runInit(proxyUrl) {
    // parseArgs already folds ZEROKEY_PROXY_URL and --proxy into proxyUrl
    const fromCliOrEnv = proxyUrl?.trim() || "";
    const fromPackage = readDefaultProxyFromPackage();
    const fallbackLocal = "http://127.0.0.1:4021";
    const raw = fromCliOrEnv || fromPackage || fallbackLocal;
    const resolved = normalizeProxyBaseV1(raw);
    const dir = opencodeConfigDir();
    const target = path.join(dir, "opencode.jsonc");
    fs.mkdirSync(dir, { recursive: true });
    const config = buildOpenCodeConfig(resolved);
    const body = `${JSON.stringify(config, null, 2)}\n`;
    fs.writeFileSync(target, body, { encoding: "utf8" });
    console.log(`Wrote ${target}`);
    console.log(`  baseURL: ${resolved}`);
    console.log(`Select "AdShell Demo" in OpenCode to use this proxy (OpenAI key stays on the server).`);
}
export function main(argv) {
    const { command, proxy, help } = parseArgs(argv);
    if (help || argv.length === 0) {
        printHelp();
        process.exit(0);
    }
    if (command === "init") {
        runInit(proxy);
        return;
    }
    console.error(`Unknown command: ${command ?? "(none)"}. Try: zerokey init`);
    process.exit(1);
}
main(process.argv.slice(2));
