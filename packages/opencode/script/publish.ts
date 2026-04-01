#!/usr/bin/env bun
/**
 * Publish native packages + @ronii/zerokey-runtime.
 *
 * **2FA / EOTP** — npm will reject publishes unless you use one of:
 * 1. `NPM_OTP` — 6-digit code from your authenticator app (fresh; codes expire quickly).
 * 2. **Automation** granular access token — npmjs.com → Access Tokens → Granular token →
 *    enable "Publish packages", then `npm config set //registry.npmjs.org/:_authToken=TOKEN`
 *    (no OTP per publish; best for scripts/CI).
 *
 * Publishes run **sequentially**. Stale `*.tgz` files under each `dist/*` folder are deleted
 * before `bun pm pack` so we never pack a tarball inside a tarball.
 */
import { $ } from "bun"
import fs from "fs"
import path from "path"
import { spawnSync } from "node:child_process"
import pkg from "../package.json"
import { Script } from "@opencode-ai/script"
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

const npmOtp = process.env.NPM_OTP?.trim()

if (!npmOtp && !process.env.npm_config_otp) {
  console.log(`
npm publish will likely require 2FA. Before it fails with EOTP, either:

  export NPM_OTP=123456    # 6-digit code from your authenticator app
  bun run script/publish.ts

Or configure an Automation token (no OTP): https://docs.npmjs.com/about-access-tokens
`)
}

/** Meta-package: pulls optional native @ronii/zerokey-* tarballs (no bin — avoids clashing with @ronii/zerokey CLI). */
const RUNTIME_BUNDLE_DIR = "zerokey-runtime-bundle"
const RUNTIME_NPM_NAME = "@ronii/zerokey-runtime"

const binaries: Record<string, string> = {}
const distDirs: string[] = []

for (const filepath of new Bun.Glob("*/package.json").scanSync({ cwd: "./dist" })) {
  const dirName = path.dirname(filepath)
  if (dirName === RUNTIME_BUNDLE_DIR) continue
  const pkgJson = await Bun.file(`./dist/${filepath}`).json()
  if (!pkgJson.name || typeof pkgJson.name !== "string") continue
  binaries[pkgJson.name] = pkgJson.version
  distDirs.push(dirName)
}

console.log("binaries", binaries)
const version = Object.values(binaries)[0]
if (!version) {
  console.error("No platform packages found under dist/. Run: bun run script/build.ts")
  process.exit(1)
}

await $`mkdir -p ./dist/${RUNTIME_BUNDLE_DIR}`
await Bun.file(`./dist/${RUNTIME_BUNDLE_DIR}/LICENSE`).write(await Bun.file("../../LICENSE").text())

await Bun.file(`./dist/${RUNTIME_BUNDLE_DIR}/package.json`).write(
  JSON.stringify(
    {
      name: RUNTIME_NPM_NAME,
      description: "Optional native ZeroKey CLI binaries per platform (install with @ronii/zerokey)",
      version,
      license: pkg.license,
      optionalDependencies: binaries,
    },
    null,
    2,
  ),
)

function removeStaleTarballs(absDir: string) {
  if (!fs.existsSync(absDir)) return
  for (const name of fs.readdirSync(absDir)) {
    if (name.endsWith(".tgz")) {
      fs.unlinkSync(path.join(absDir, name))
    }
  }
}

function npmPublishPackedDir(cwdRelative: string) {
  const cwd = path.join(dir, cwdRelative)

  const tgzFiles = fs.existsSync(cwd) ? fs.readdirSync(cwd).filter((f) => f.endsWith(".tgz")) : []
  if (tgzFiles.length !== 1) {
    console.error(`Expected exactly one .tgz in ${cwd} after pack, found: ${tgzFiles.join(", ") || "(none)"}`)
    process.exit(1)
  }
  const tarball = tgzFiles[0]
  const args = ["publish", tarball, "--access", "public", "--tag", Script.channel]
  if (npmOtp) {
    args.push("--otp", npmOtp)
  }

  const result = spawnSync("npm", args, {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      ...(npmOtp ? { npm_config_otp: npmOtp } : {}),
    },
  })

  if (result.status !== 0) {
    if (result.status === 1 && !npmOtp) {
      console.error(`
Publish failed (often EOTP / 2FA). Re-run with a fresh authenticator code:

  NPM_OTP=123456 bun run script/publish.ts

Or set an npm Automation token in ~/.npmrc (see script header comment).
`)
    }
    process.exit(result.status ?? 1)
  }
}

for (const dirName of distDirs) {
  if (process.platform !== "win32") {
    await $`chmod -R 755 .`.cwd(`./dist/${dirName}`)
  }
  removeStaleTarballs(path.join(dir, "dist", dirName))
  await $`bun pm pack`.cwd(`./dist/${dirName}`)
  console.log(`Publishing ${dirName}…`)
  npmPublishPackedDir(`dist/${dirName}`)
}

removeStaleTarballs(path.join(dir, "dist", RUNTIME_BUNDLE_DIR))
await $`bun pm pack`.cwd(`./dist/${RUNTIME_BUNDLE_DIR}`)
console.log(`Publishing ${RUNTIME_NPM_NAME}…`)
npmPublishPackedDir(`dist/${RUNTIME_BUNDLE_DIR}`)

if (process.env.ZEROKEY_PUBLISH_UPSTREAM_EXTRAS === "1") {
  const image = process.env.ZEROKEY_DOCKER_IMAGE || "ghcr.io/anomalyco/opencode"
  const platforms = "linux/amd64,linux/arm64"
  const tags = [`${image}:${version}`, `${image}:${Script.channel}`]
  const tagFlags = tags.flatMap((t) => ["-t", t])
  await $`docker buildx build --platform ${platforms} ${tagFlags} --push .`

  if (!Script.preview) {
    const arm64Sha = await $`sha256sum ./dist/zerokey-linux-arm64.tar.gz | cut -d' ' -f1`
      .text()
      .then((x) => x.trim())
    const x64Sha = await $`sha256sum ./dist/zerokey-linux-x64.tar.gz | cut -d' ' -f1`
      .text()
      .then((x) => x.trim())
    const macX64Sha = await $`sha256sum ./dist/zerokey-darwin-x64.zip | cut -d' ' -f1`
      .text()
      .then((x) => x.trim())
    const macArm64Sha = await $`sha256sum ./dist/zerokey-darwin-arm64.zip | cut -d' ' -f1`
      .text()
      .then((x) => x.trim())

    void arm64Sha
    void x64Sha
    void macX64Sha
    void macArm64Sha
    console.log("ZEROKEY_PUBLISH_UPSTREAM_EXTRAS: release artifact checksums computed (homebrew/AUR skipped; configure separately).")
  }
}
