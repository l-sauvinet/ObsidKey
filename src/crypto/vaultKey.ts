import { bufferToBase64, base64ToBuffer } from './keyDerivation'
import { encryptString, decryptString, type EncryptedPayload } from './encryption'

/**
 * Chiffrement en enveloppe : la clé de coffre (VK) chiffre réellement les entrées et ne
 * change jamais. Elle est elle-même chiffrée ("enveloppée") par une clé de protection dérivée
 * soit du mot de passe maître, soit d'un code de récupération — changer l'un ou l'autre ne fait
 * que ré-envelopper la même VK, les entrées existantes restent donc toujours lisibles.
 */

export class VaultKeyMismatchError extends Error {
  constructor() {
    super("Ce mot de passe ne correspond pas au coffre de ce compte.")
  }
}

export function generateVaultKeyRaw(): ArrayBuffer {
  return crypto.getRandomValues(new Uint8Array(32)).buffer
}

async function importAesKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function wrapVaultKey(
  vaultKeyRaw: ArrayBuffer,
  protectionKeyRaw: ArrayBuffer,
): Promise<EncryptedPayload> {
  const protectionKey = await importAesKey(protectionKeyRaw)
  return encryptString(bufferToBase64(vaultKeyRaw), protectionKey)
}

export async function unwrapVaultKey(
  payload: EncryptedPayload,
  protectionKeyRaw: ArrayBuffer,
): Promise<ArrayBuffer> {
  const protectionKey = await importAesKey(protectionKeyRaw)
  try {
    const decoded = await decryptString(payload, protectionKey)
    return base64ToBuffer(decoded).buffer as ArrayBuffer
  } catch {
    throw new VaultKeyMismatchError()
  }
}
