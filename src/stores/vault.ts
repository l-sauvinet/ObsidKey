import { defineStore } from 'pinia'

const SESSION_KEY = 'obsidkey_vault_key'
const SESSION_TS_KEY = 'obsidkey_vault_ts'
const LOCK_TIMEOUT_MS = 4 * 60 * 60 * 1000 // 4 heures

interface VaultState {
  encryptionKey: CryptoKey | null
  // Octets bruts de la VK, gardés en mémoire pour pouvoir la ré-envelopper (changement de mot
  // de passe, configuration de la récupération) sans changer la CryptoKey non-extractable
  // utilisée pour chiffrer/déchiffrer les entrées. Déjà présents en base64 dans sessionStorage
  // ci-dessous, donc ça n'ajoute pas de surface d'exposition supplémentaire.
  rawKeyMaterial: ArrayBuffer | null
  isUnlocked: boolean
}

async function importRawKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export const useVaultStore = defineStore('vault', {
  state: (): VaultState => ({
    encryptionKey: null,
    rawKeyMaterial: null,
    isUnlocked: false,
  }),
  actions: {
    async unlock(rawKeyMaterial: ArrayBuffer) {
      this.encryptionKey = await importRawKey(rawKeyMaterial)
      this.rawKeyMaterial = rawKeyMaterial
      this.isUnlocked = true
      sessionStorage.setItem(SESSION_KEY, bufToBase64(rawKeyMaterial))
      sessionStorage.setItem(SESSION_TS_KEY, Date.now().toString())
    },
    lock() {
      this.encryptionKey = null
      this.rawKeyMaterial = null
      this.isUnlocked = false
      sessionStorage.removeItem(SESSION_KEY)
      sessionStorage.removeItem(SESSION_TS_KEY)
    },
    async restoreFromSession() {
      const raw = sessionStorage.getItem(SESSION_KEY)
      const ts = sessionStorage.getItem(SESSION_TS_KEY)
      if (!raw || !ts) return

      const elapsed = Date.now() - parseInt(ts)
      if (elapsed > LOCK_TIMEOUT_MS) {
        this.lock()
        return
      }

      try {
        const keyBytes = base64ToBuf(raw)
        this.encryptionKey = await importRawKey(keyBytes)
        this.rawKeyMaterial = keyBytes
        this.isUnlocked = true
      } catch {
        this.lock()
      }
    },
    checkTimeout() {
      const ts = sessionStorage.getItem(SESSION_TS_KEY)
      if (!ts) return
      if (Date.now() - parseInt(ts) > LOCK_TIMEOUT_MS) {
        this.lock()
      }
    },
  },
})

function bufToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function base64ToBuf(b64: string): ArrayBuffer {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer
}
