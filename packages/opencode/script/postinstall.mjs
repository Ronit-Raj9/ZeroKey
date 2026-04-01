#!/usr/bin/env node

import fs from "fs"
import path from "path"
import os from "os"
import { fileURLToPath } from "url"
import { createRequire } from "module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

function detectPlatformAndArch() {
  let platform
  switch (os.platform()) {
    case "darwin":
      platform = "darwin"
      break
    case "linux":
      platform = "linux"
      break
    case "win32":
      platform = "windows"
      break
    default:
      platform = os.platform()
      break
  }

  let arch
  switch (os.arch()) {
    case "x64":
      arch = "x64"
      break
    case "arm64":
      arch = "arm64"
      break
    case "arm":
      arch = "arm"
      break
    default:
      arch = os.arch()
      break
  }

  return { platform, arch }
}

function findBinary() {
  const { platform, arch } = detectPlatformAndArch()
  const suffix = `zerokey-${platform}-${arch}`
  const binaryName = platform === "windows" ? "zerokey.exe" : "zerokey"

  const tryResolve = (spec) => {
    try {
      const packageJsonPath = require.resolve(`${spec}/package.json`)
      const packageDir = path.dirname(packageJsonPath)
      const binaryPath = path.join(packageDir, "bin", binaryName)
      if (fs.existsSync(binaryPath)) return { binaryPath, binaryName }
    } catch {
      // try next
    }
    return null
  }

  const scoped = `@ronii/${suffix}`
  return tryResolve(scoped) ?? tryResolve(suffix)
}

function prepareBinDirectory(binaryName) {
  const binDir = path.join(__dirname, "bin")
  const targetPath = path.join(binDir, binaryName)

  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true })
  }

  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath)
  }

  return { binDir, targetPath }
}

async function main() {
  try {
    if (os.platform() === "win32") {
      console.log("Windows detected: using packaged zerokey.exe from optional dependency")
      return
    }

    const found = findBinary()
    if (!found) {
      throw new Error("Could not resolve @ronii/zerokey-<platform>-<arch> optional package")
    }

    const { binaryPath } = found
    const target = path.join(__dirname, "bin", ".zerokey")
    if (fs.existsSync(target)) fs.unlinkSync(target)
    try {
      fs.linkSync(binaryPath, target)
    } catch {
      fs.copyFileSync(binaryPath, target)
    }
    fs.chmodSync(target, 0o755)
  } catch (error) {
    console.error("Failed to setup zerokey binary:", error.message)
    process.exit(1)
  }
}

try {
  await main()
} catch (error) {
  console.error("Postinstall script error:", error.message)
  process.exit(0)
}
