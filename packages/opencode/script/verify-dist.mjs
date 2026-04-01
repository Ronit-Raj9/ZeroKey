#!/usr/bin/env node
/**
 * Fail if platform packages under dist/ are missing native zerokey binaries.
 * Run after: bun run script/build.ts
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(root, "..", "dist")
const RUNTIME_BUNDLE = "zerokey-runtime-bundle"

let failed = false

if (!fs.existsSync(dist)) {
  console.error(`verify-dist: missing ${dist} — run the opencode build first.`)
  process.exit(1)
}

const entries = fs.readdirSync(dist, { withFileTypes: true })
for (const ent of entries) {
  if (!ent.isDirectory()) continue
  if (ent.name === RUNTIME_BUNDLE) continue

  const pkgPath = path.join(dist, ent.name, "package.json")
  if (!fs.existsSync(pkgPath)) continue

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
  if (!pkg.name?.includes("zerokey")) continue

  const isWin = ent.name.includes("windows")
  const binName = isWin ? "zerokey.exe" : "zerokey"
  const binPath = path.join(dist, ent.name, "bin", binName)

  if (!fs.existsSync(binPath)) {
    console.error(`verify-dist: missing binary ${binPath}`)
    failed = true
  }
}

if (failed) {
  console.error("verify-dist: failed.")
  process.exit(1)
}

console.log("verify-dist: all platform packages under dist/ contain native zerokey binaries.")
