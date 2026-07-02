import { collection, addDoc, getDocs, deleteDoc, updateDoc, doc, deleteField } from 'firebase/firestore'
import { db, auth } from './firebase'
import { useVaultStore } from '@/stores/vault'
import { encryptString, decryptString } from '@/crypto/encryption'

export interface VaultFolder {
  id: string
  name: string
  coffreId: string
  parentId?: string
}

export interface VaultFolderTrashed extends VaultFolder {
  deletedAt: number
  cascadeDeletedBy?: string
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

function foldersCollection() {
  return collection(db, 'vaults', requireUserId(), 'folders')
}

export async function getAllFolders(): Promise<VaultFolder[]> {
  const key = requireKey()
  const snap = await getDocs(foldersCollection())
  const folders: VaultFolder[] = []
  for (const d of snap.docs) {
    const data = d.data() as { ciphertext: string; iv: string; deletedAt?: number }
    if (data.deletedAt) continue
    try {
      const json = await decryptString(data, key)
      const { name, coffreId, parentId } = JSON.parse(json)
      folders.push({ id: d.id, name, coffreId, parentId })
    } catch {
      console.error(`Impossible de déchiffrer le dossier ${d.id}`)
    }
  }
  return folders.sort((a, b) => a.name.localeCompare(b.name))
}

// Retourne TOUS les éléments supprimés, y compris les enfants de cascade
export async function getTrashedFolders(): Promise<VaultFolderTrashed[]> {
  const key = requireKey()
  const snap = await getDocs(foldersCollection())
  const folders: VaultFolderTrashed[] = []
  for (const d of snap.docs) {
    const data = d.data() as { ciphertext: string; iv: string; deletedAt?: number; cascadeDeletedBy?: string }
    if (!data.deletedAt) continue
    try {
      const json = await decryptString(data, key)
      const { name, coffreId, parentId } = JSON.parse(json)
      folders.push({ id: d.id, name, coffreId, parentId, deletedAt: data.deletedAt, cascadeDeletedBy: data.cascadeDeletedBy })
    } catch {
      console.error(`Impossible de déchiffrer le dossier supprimé ${d.id}`)
    }
  }
  return folders
}

export async function updateFolder(id: string, name: string, coffreId: string, parentId?: string): Promise<void> {
  const key = requireKey()
  const payload = await encryptString(JSON.stringify({ name, coffreId, parentId }), key)
  await updateDoc(doc(db, 'vaults', requireUserId(), 'folders', id), payload)
}

export async function addFolder(name: string, coffreId: string, parentId?: string): Promise<VaultFolder> {
  const key = requireKey()
  const payload = await encryptString(JSON.stringify({ name, coffreId, parentId }), key)
  const ref = await addDoc(foldersCollection(), payload)
  return { id: ref.id, name, coffreId, parentId }
}

export async function deleteFolder(id: string, cascadeDeletedBy?: string): Promise<void> {
  const update: Record<string, unknown> = { deletedAt: Date.now() }
  if (cascadeDeletedBy) update.cascadeDeletedBy = cascadeDeletedBy
  await updateDoc(doc(db, 'vaults', requireUserId(), 'folders', id), update)
}

export async function restoreFolder(id: string): Promise<void> {
  await updateDoc(doc(db, 'vaults', requireUserId(), 'folders', id), {
    deletedAt: deleteField(),
    cascadeDeletedBy: deleteField(),
  })
}

// Restaure tous les dossiers enfants de cascade d'un dossier donné
export async function restoreCascadeByFolder(folderId: string): Promise<void> {
  const snap = await getDocs(foldersCollection())
  await Promise.all(
    snap.docs
      .filter(d => { const data = d.data() as any; return data.deletedAt && data.cascadeDeletedBy === folderId })
      .map(d => updateDoc(d.ref, { deletedAt: deleteField(), cascadeDeletedBy: deleteField() })),
  )
}

export async function permanentlyDeleteFolder(id: string): Promise<void> {
  await deleteDoc(doc(db, 'vaults', requireUserId(), 'folders', id))
}

// Supprime définitivement tous les dossiers enfants de cascade d'un dossier donné
export async function permanentlyDeleteCascadeByFolder(folderId: string): Promise<void> {
  const snap = await getDocs(foldersCollection())
  await Promise.all(
    snap.docs
      .filter(d => { const data = d.data() as any; return data.deletedAt && data.cascadeDeletedBy === folderId })
      .map(d => deleteDoc(d.ref)),
  )
}
