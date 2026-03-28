import { randomBytes, createCipheriv, createDecipheriv } from "crypto"
import { createHash } from "crypto"
import { hostname, userInfo } from "os"
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts"
import { AdshellStateStore } from "./state"

// ──────────────────────────────────────────────
//  Key Derivation — machine-local encryption key
// ──────────────────────────────────────────────

function deriveEncryptionKey(salt: Buffer): Buffer {
  // Key derived from machine ID + OS username + salt
  // This means the encrypted key is only decryptable on this machine/user
  const machineId = hostname()
  const username = userInfo().username
  const material = `adshell:${machineId}:${username}:${salt.toString("hex")}`
  return createHash("sha256").update(material).digest()
}

// ──────────────────────────────────────────────
//  AES-256-GCM Encrypt / Decrypt
// ──────────────────────────────────────────────

function encrypt(plaintext: string, key: Buffer): { iv: string; tag: string; ciphertext: string } {
  const iv = randomBytes(12) // 96-bit IV for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  let encrypted = cipher.update(plaintext, "utf8", "hex")
  encrypted += cipher.final("hex")
  const tag = cipher.getAuthTag()
  return {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: encrypted,
  }
}

function decrypt(ciphertext: string, key: Buffer, iv: string, tag: string): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"))
  decipher.setAuthTag(Buffer.from(tag, "hex"))
  let decrypted = decipher.update(ciphertext, "hex", "utf8")
  decrypted += decipher.final("utf8")
  return decrypted
}

// ──────────────────────────────────────────────
//  Wallet Management
// ──────────────────────────────────────────────

function createPrivateKey(): `0x${string}` {
  return `0x${randomBytes(32).toString("hex")}` as `0x${string}`
}

export async function ensureAdshellWallet() {
  const state = await AdshellStateStore.get()

  // If we have an encrypted key, decrypt it
  if (state.walletAddress && state.encryptedKey) {
    try {
      const salt = Buffer.from(state.encryptedKey.salt, "hex")
      const key = deriveEncryptionKey(salt)
      const privateKey = decrypt(
        state.encryptedKey.ciphertext,
        key,
        state.encryptedKey.iv,
        state.encryptedKey.tag,
      ) as `0x${string}`
      return {
        privateKey,
        address: state.walletAddress,
      }
    } catch {
      // Decryption failed (different machine?) — regenerate
    }
  }

  // Legacy: unencrypted key exists — migrate it
  if (state.walletPrivateKey && state.walletAddress) {
    const salt = randomBytes(16)
    const key = deriveEncryptionKey(salt)
    const encrypted = encrypt(state.walletPrivateKey, key)
    await AdshellStateStore.patch({
      encryptedKey: {
        salt: salt.toString("hex"),
        iv: encrypted.iv,
        tag: encrypted.tag,
        ciphertext: encrypted.ciphertext,
      },
      walletPrivateKey: undefined, // Remove plaintext key
    })
    return {
      privateKey: state.walletPrivateKey,
      address: state.walletAddress,
    }
  }

  // Generate new wallet
  const privateKey = createPrivateKey()
  const account = privateKeyToAccount(privateKey)
  const salt = randomBytes(16)
  const key = deriveEncryptionKey(salt)
  const encrypted = encrypt(privateKey, key)

  await AdshellStateStore.patch({
    walletAddress: account.address,
    encryptedKey: {
      salt: salt.toString("hex"),
      iv: encrypted.iv,
      tag: encrypted.tag,
      ciphertext: encrypted.ciphertext,
    },
  })

  return {
    privateKey,
    address: account.address,
  }
}

export async function getAdshellAccount(): Promise<PrivateKeyAccount> {
  const wallet = await ensureAdshellWallet()
  return privateKeyToAccount(wallet.privateKey)
}
