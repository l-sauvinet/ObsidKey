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
import { saveEncryptionSalt, fetchEncryptionSalt } from './userSalt'

export async function signUp(email: string, masterPassword: string) {
  const authSalt = await deriveSaltFromEmail(email, 'auth')
  const encryptionSalt = generateEncryptionSalt()

  const authHash = await deriveAuthHash(masterPassword, authSalt)
  await createUserWithEmailAndPassword(auth, email, authHash)

  await saveEncryptionSalt(encryptionSalt)

  const rawKey = await deriveEncryptionKeyRaw(masterPassword, encryptionSalt)
  await useVaultStore().unlock(rawKey)
}

export async function signIn(email: string, masterPassword: string) {
  const authSalt = await deriveSaltFromEmail(email, 'auth')
  const authHash = await deriveAuthHash(masterPassword, authSalt)
  await signInWithEmailAndPassword(auth, email, authHash)

  const encryptionSalt = await fetchEncryptionSalt()
  const rawKey = await deriveEncryptionKeyRaw(masterPassword, encryptionSalt)
  await useVaultStore().unlock(rawKey)
}

export async function unlockWithPassword(masterPassword: string): Promise<void> {
  const encryptionSalt = await fetchEncryptionSalt()
  const rawKey = await deriveEncryptionKeyRaw(masterPassword, encryptionSalt)
  await useVaultStore().unlock(rawKey)
}

export async function logOut() {
  useVaultStore().lock()
  await signOut(auth)
}
