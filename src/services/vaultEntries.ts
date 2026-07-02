import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  doc,
  deleteField,
} from 'firebase/firestore'
import { db, auth } from './firebase'
import { useVaultStore } from '@/stores/vault'
import { encryptString, decryptString } from '@/crypto/encryption'

export interface VaultEntryPlain {
  title: string
  password: string
  description?: string
  url?: string
  username?: string
  coffreId: string
  folderId?: string
}

export interface VaultEntry extends VaultEntryPlain {
  id: string
}

export interface VaultEntryTrashed extends VaultEntry {
  deletedAt: number
  cascadeDeletedBy?: string
}

function requireUserId(): string {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Utilisateur non authentifié')
  return uid
}

function requireEncryptionKey(): CryptoKey {
  const key = useVaultStore().encryptionKey
  if (!key) throw new Error('Coffre verrouillé — impossible de chiffrer/déchiffrer')
  return key
}

function entriesCollection() {
  return collection(db, 'vaults', requireUserId(), 'entries')
}

export async function addEntry(entry: VaultEntryPlain): Promise<string> {
  const key = requireEncryptionKey()
  const payload = await encryptString(JSON.stringify(entry), key)
  const docRef = await addDoc(entriesCollection(), payload)
  return docRef.id
}

export async function updateEntry(id: string, entry: VaultEntryPlain): Promise<void> {
  const key = requireEncryptionKey()
  const payload = await encryptString(JSON.stringify(entry), key)
  await updateDoc(doc(db, 'vaults', requireUserId(), 'entries', id), payload as { [key: string]: any })
}

export async function deleteEntry(id: string, cascadeDeletedBy?: string): Promise<void> {
  const update: Record<string, unknown> = { deletedAt: Date.now() }
  if (cascadeDeletedBy) update.cascadeDeletedBy = cascadeDeletedBy
  await updateDoc(doc(db, 'vaults', requireUserId(), 'entries', id), update)
}

export async function restoreEntry(id: string): Promise<void> {
  await updateDoc(doc(db, 'vaults', requireUserId(), 'entries', id), {
    deletedAt: deleteField(),
    cascadeDeletedBy: deleteField(),
  })
}

// Restaure toutes les entrées enfants de cascade d'un dossier donné
export async function restoreCascadeByFolder(folderId: string): Promise<void> {
  const snap = await getDocs(entriesCollection())
  await Promise.all(
    snap.docs
      .filter(d => { const data = d.data() as any; return data.deletedAt && data.cascadeDeletedBy === folderId })
      .map(d => updateDoc(d.ref, { deletedAt: deleteField(), cascadeDeletedBy: deleteField() })),
  )
}

export async function permanentlyDeleteEntry(id: string): Promise<void> {
  await deleteDoc(doc(db, 'vaults', requireUserId(), 'entries', id))
}

// Supprime définitivement toutes les entrées enfants de cascade d'un dossier donné
export async function permanentlyDeleteCascadeByFolder(folderId: string): Promise<void> {
  const snap = await getDocs(entriesCollection())
  await Promise.all(
    snap.docs
      .filter(d => { const data = d.data() as any; return data.deletedAt && data.cascadeDeletedBy === folderId })
      .map(d => deleteDoc(d.ref)),
  )
}

export async function getAllEntries(): Promise<VaultEntry[]> {
  const key = requireEncryptionKey()
  const snapshot = await getDocs(entriesCollection())
  const entries: VaultEntry[] = []
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() as { ciphertext: string; iv: string; deletedAt?: number }
    if (data.deletedAt) continue
    try {
      const decrypted = await decryptString(data, key)
      entries.push({ id: docSnap.id, ...JSON.parse(decrypted) })
    } catch (err) {
      console.error(`Impossible de déchiffrer l'entrée ${docSnap.id}`, err)
    }
  }
  return entries
}

// Retourne TOUS les éléments supprimés, y compris les enfants de cascade
export async function getTrashedEntries(): Promise<VaultEntryTrashed[]> {
  const key = requireEncryptionKey()
  const snapshot = await getDocs(entriesCollection())
  const entries: VaultEntryTrashed[] = []
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() as { ciphertext: string; iv: string; deletedAt?: number; cascadeDeletedBy?: string }
    if (!data.deletedAt) continue
    try {
      const decrypted = await decryptString(data, key)
      entries.push({ id: docSnap.id, ...JSON.parse(decrypted), deletedAt: data.deletedAt, cascadeDeletedBy: data.cascadeDeletedBy })
    } catch (err) {
      console.error(`Impossible de déchiffrer l'entrée supprimée ${docSnap.id}`, err)
    }
  }
  return entries
}
