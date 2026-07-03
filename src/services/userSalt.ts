import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db, auth } from './firebase'
import { bufferToBase64, base64ToBuffer } from '@/crypto/keyDerivation'
import type { EncryptedPayload } from '@/crypto/encryption'

export interface UserSaltDoc {
  encryptionSalt: string
  wrappedVaultKey?: EncryptedPayload
  recoverySalt?: string
  wrappedVaultKeyRecovery?: EncryptedPayload
}

function userSaltDocRef() {
  const uid = auth.currentUser!.uid
  return doc(db, 'userSalts', uid)
}

export async function fetchUserSaltDoc(): Promise<UserSaltDoc | null> {
  const snap = await getDoc(userSaltDocRef())
  return snap.exists() ? (snap.data() as UserSaltDoc) : null
}

/**
 * Création initiale du compte : sel + VK déjà enveloppée par le mot de passe.
 */
export async function saveVaultKeyMaterial(
  encryptionSalt: Uint8Array,
  wrappedVaultKey: EncryptedPayload,
): Promise<void> {
  await setDoc(userSaltDocRef(), {
    encryptionSalt: bufferToBase64(encryptionSalt.buffer as ArrayBuffer),
    wrappedVaultKey,
  })
}

/**
 * Changement de mot de passe (ou migration) : ré-enveloppe la VK avec une nouvelle clé de
 * protection dérivée du mot de passe, sans toucher aux entrées déjà chiffrées avec la VK.
 */
export async function updateWrappedVaultKey(
  encryptionSalt: Uint8Array,
  wrappedVaultKey: EncryptedPayload,
): Promise<void> {
  await setDoc(
    userSaltDocRef(),
    {
      encryptionSalt: bufferToBase64(encryptionSalt.buffer as ArrayBuffer),
      wrappedVaultKey,
    },
    { merge: true },
  )
}

export function decodeSalt(base64Salt: string): Uint8Array {
  return base64ToBuffer(base64Salt)
}
