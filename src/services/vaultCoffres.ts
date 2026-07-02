import { collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore'
import { db, auth } from './firebase'
import { useVaultStore } from '@/stores/vault'
import { encryptString, decryptString } from '@/crypto/encryption'

export interface VaultCoffre {
  id: string
  name: string
}

function requireUserId(): string {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Non authentifié')
  return uid
}

function requireKey() {
  const key = useVaultStore().encryptionKey
  if (!key) throw new Error('Coffre verrouillé')
  return key
}

function coffresCollection() {
  return collection(db, 'vaults', requireUserId(), 'coffres')
}

export async function getAllCoffres(): Promise<VaultCoffre[]> {
  const key = requireKey()
  const snap = await getDocs(coffresCollection())
  const coffres: VaultCoffre[] = []
  for (const d of snap.docs) {
    try {
      const data = d.data() as { ciphertext: string; iv: string }
      const name = await decryptString(data, key)
      coffres.push({ id: d.id, name })
    } catch {
      console.error(`Impossible de déchiffrer le coffre ${d.id}`)
    }
  }
  return coffres.sort((a, b) => a.name.localeCompare(b.name))
}

export async function addCoffre(name: string): Promise<VaultCoffre> {
  const key = requireKey()
  const payload = await encryptString(name, key)
  const ref = await addDoc(coffresCollection(), payload)
  return { id: ref.id, name }
}

export async function deleteCoffre(id: string): Promise<void> {
  await deleteDoc(doc(db, 'vaults', requireUserId(), 'coffres', id))
}
