import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db, auth } from './firebase'
import { bufferToBase64, base64ToBuffer } from '@/crypto/keyDerivation'

export async function saveEncryptionSalt(salt: Uint8Array): Promise<void> {
  const uid = auth.currentUser!.uid
  await setDoc(doc(db, 'userSalts', uid), {
    encryptionSalt: bufferToBase64(salt.buffer as ArrayBuffer),
  })
}

export async function fetchEncryptionSalt(): Promise<Uint8Array> {
  const uid = auth.currentUser!.uid
  const snap = await getDoc(doc(db, 'userSalts', uid))
  if (!snap.exists()) throw new Error('Salt introuvable — compte corrompu ou inexistant.')
  return base64ToBuffer(snap.data().encryptionSalt)
}
