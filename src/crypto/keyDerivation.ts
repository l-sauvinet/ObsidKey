import { argon2id } from 'hash-wasm'

const PBKDF2_ITERATIONS = 600_000
const KEY_LENGTH_BITS = 256

async function importPasswordKey(password: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  return crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
}

/**
 * Dérive les bytes bruts de la clé AES-GCM via Argon2id.
 * Argon2id est résistant aux attaques GPU/ASIC grâce à sa consommation mémoire.
 * Paramètres : OWASP 2023 (64 MB, 3 itérations).
 */
export async function deriveEncryptionKeyRaw(
  masterPassword: string,
  salt: Uint8Array,
): Promise<ArrayBuffer> {
  const hash = await argon2id({
    password: masterPassword,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536,
    hashLength: 32,
    outputType: 'binary',
  })
  return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength)
}

/**
 * Hash d'authentification envoyé à Firebase Auth comme "mot de passe".
 * PBKDF2 suffit ici car Firebase re-hash côté serveur — ce hash n'est
 * jamais utilisé pour déchiffrer les données.
 */
export async function deriveAuthHash(
  masterPassword: string,
  authSalt: Uint8Array,
): Promise<string> {
  const baseKey = await importPasswordKey(masterPassword)
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: authSalt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    KEY_LENGTH_BITS,
  )
  return bufferToBase64(bits)
}

export function generateEncryptionSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16))
}

/**
 * Salt déterministe utilisé uniquement pour le hash d'authentification Firebase.
 */
export async function deriveSaltFromEmail(
  email: string,
  context: 'auth',
): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const data = enc.encode(`obsidkey:${context}:${email.trim().toLowerCase()}`)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return new Uint8Array(hash).slice(0, 16)
}

export function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

export function base64ToBuffer(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}
