import { bufferToBase64, base64ToBuffer } from './keyDerivation'

export interface EncryptedPayload {
  ciphertext: string // base64
  iv: string // base64
}

/**
 * Chiffre une chaîne (ex: JSON.stringify d'une entrée de mot de passe)
 * avec AES-256-GCM. Un IV (nonce) aléatoire est généré à chaque appel :
 * ne JAMAIS réutiliser un IV avec la même clé.
 */
export async function encryptString(
  plaintext: string,
  key: CryptoKey,
): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12)) // 96 bits, recommandé pour GCM
  const enc = new TextEncoder()
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    enc.encode(plaintext),
  )

  return {
    ciphertext: bufferToBase64(ciphertextBuffer),
    iv: bufferToBase64(iv.buffer as ArrayBuffer),
  }
}

/**
 * Déchiffre un payload produit par encryptString.
 * Lève une exception si la clé est incorrecte ou si les données ont été altérées
 * (GCM inclut une vérification d'intégrité — c'est une propriété de sécurité, pas un bug).
 */
export async function decryptString(
  payload: EncryptedPayload,
  key: CryptoKey,
): Promise<string> {
  const iv = base64ToBuffer(payload.iv)
  const ciphertext = base64ToBuffer(payload.ciphertext)
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource,
  )
  return new TextDecoder().decode(decryptedBuffer)
}
