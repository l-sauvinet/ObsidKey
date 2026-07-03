import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { auth } from './firebase'
import { useVaultStore } from '@/stores/vault'
import {
  deriveAuthHash,
  deriveEncryptionKeyRaw,
  deriveSaltFromEmail,
  generateEncryptionSalt,
} from '@/crypto/keyDerivation'
import { generateVaultKeyRaw, wrapVaultKey, unwrapVaultKey, VaultKeyMismatchError } from '@/crypto/vaultKey'
import {
  fetchUserSaltDoc,
  saveVaultKeyMaterial,
  updateWrappedVaultKey,
  decodeSalt,
} from './userSalt'

export { VaultKeyMismatchError }

/**
 * Dérive la VK (clé de coffre) à partir du mot de passe entré. Migre silencieusement les
 * comptes créés avant le chiffrement en enveloppe (pas de wrappedVaultKey en base) : la VK
 * devient alors la clé déjà utilisée pour chiffrer les entrées existantes, donc rien à
 * rechiffrer. Lève VaultKeyMismatchError si le mot de passe ne correspond pas à la VK existante
 * — dans ce cas, seul l'administrateur peut réinitialiser le mot de passe (back office).
 */
async function resolveVaultKey(masterPassword: string): Promise<ArrayBuffer> {
  const docData = await fetchUserSaltDoc()
  if (!docData) throw new Error('Salt introuvable — compte corrompu ou inexistant.')

  const encryptionSalt = decodeSalt(docData.encryptionSalt)
  const protectionKeyRaw = await deriveEncryptionKeyRaw(masterPassword, encryptionSalt)

  if (!docData.wrappedVaultKey) {
    const vaultKeyRaw = protectionKeyRaw
    const wrappedVaultKey = await wrapVaultKey(vaultKeyRaw, protectionKeyRaw)
    await updateWrappedVaultKey(encryptionSalt, wrappedVaultKey)
    return vaultKeyRaw
  }

  return unwrapVaultKey(docData.wrappedVaultKey, protectionKeyRaw)
}

export async function signUp(email: string, masterPassword: string) {
  const authSalt = await deriveSaltFromEmail(email, 'auth')
  const authHash = await deriveAuthHash(masterPassword, authSalt)
  await createUserWithEmailAndPassword(auth, email, authHash)

  const encryptionSalt = generateEncryptionSalt()
  const vaultKeyRaw = generateVaultKeyRaw()
  const protectionKeyRaw = await deriveEncryptionKeyRaw(masterPassword, encryptionSalt)
  const wrappedVaultKey = await wrapVaultKey(vaultKeyRaw, protectionKeyRaw)
  await saveVaultKeyMaterial(encryptionSalt, wrappedVaultKey)

  await useVaultStore().unlock(vaultKeyRaw)
}

export async function signIn(email: string, masterPassword: string) {
  const authSalt = await deriveSaltFromEmail(email, 'auth')
  const authHash = await deriveAuthHash(masterPassword, authSalt)
  await signInWithEmailAndPassword(auth, email, authHash)

  const vaultKeyRaw = await resolveVaultKey(masterPassword)
  await useVaultStore().unlock(vaultKeyRaw)
}

export async function unlockWithPassword(masterPassword: string): Promise<void> {
  const vaultKeyRaw = await resolveVaultKey(masterPassword)
  await useVaultStore().unlock(vaultKeyRaw)
}

export async function logOut() {
  useVaultStore().lock()
  await signOut(auth)
}
