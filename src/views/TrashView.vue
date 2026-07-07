<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { logOut } from '@/services/auth'
import { useVaultStore } from '@/stores/vault'
import {
  getTrashedEntries, restoreEntry, permanentlyDeleteEntry,
  restoreCascadeByFolder as restoreEntryCascadeByFolder,
  permanentlyDeleteCascadeByFolder as permanentlyDeleteEntryCascadeByFolder,
  type VaultEntryTrashed,
} from '@/services/vaultEntries'
import {
  getTrashedFolders, restoreFolder, permanentlyDeleteFolder,
  restoreCascadeByFolder as restoreFolderCascadeByFolder,
  permanentlyDeleteCascadeByFolder as permanentlyDeleteFolderCascadeByFolder,
  type VaultFolderTrashed,
} from '@/services/vaultFolders'
import { getAllCoffres, type VaultCoffre } from '@/services/vaultCoffres'

const router = useRouter()
const vault = useVaultStore()

const trashedEntries = ref<VaultEntryTrashed[]>([])
const trashedFolders = ref<VaultFolderTrashed[]>([])
const coffres = ref<VaultCoffre[]>([])
const isLoading = ref(true)

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

// ── Computed ─────────────────────────────────────────────────────────────────

type TrashedItem =
  | { kind: 'entry'; id: string; displayName: string; coffreId: string; deletedAt: number }
  | { kind: 'folder'; id: string; displayName: string; coffreId: string; deletedAt: number }

const allTrashed = computed((): TrashedItem[] => {
  const items: TrashedItem[] = [
    ...trashedFolders.value.map(f => ({
      kind: 'folder' as const,
      id: f.id,
      displayName: f.name,
      coffreId: f.coffreId,
      deletedAt: f.deletedAt,
    })),
    ...trashedEntries.value.map(e => ({
      kind: 'entry' as const,
      id: e.id,
      displayName: e.title,
      coffreId: e.coffreId,
      deletedAt: e.deletedAt,
    })),
  ]
  return items.sort((a, b) => b.deletedAt - a.deletedAt)
})

// ── Multi-sélection ──────────────────────────────────────────────────────────

function rowKey(kind: 'entry' | 'folder', id: string): string {
  return `${kind}-${id}`
}

const selectedKeys = ref<Set<string>>(new Set())

const isAllSelected = computed(() =>
  allTrashed.value.length > 0 && allTrashed.value.every(r => selectedKeys.value.has(rowKey(r.kind, r.id))),
)

const isIndeterminate = computed(() =>
  allTrashed.value.some(r => selectedKeys.value.has(rowKey(r.kind, r.id))) && !isAllSelected.value,
)

function toggleSelectAll() {
  selectedKeys.value = isAllSelected.value
    ? new Set()
    : new Set(allTrashed.value.map(r => rowKey(r.kind, r.id)))
}

function toggleSelect(kind: 'entry' | 'folder', id: string) {
  const key = rowKey(kind, id)
  const s = new Set(selectedKeys.value)
  s.has(key) ? s.delete(key) : s.add(key)
  selectedKeys.value = s
}

function removeFromSelection(kind: 'entry' | 'folder', id: string) {
  const key = rowKey(kind, id)
  if (!selectedKeys.value.has(key)) return
  const s = new Set(selectedKeys.value)
  s.delete(key)
  selectedKeys.value = s
}

function coffreName(coffreId: string): string {
  return coffres.value.find(c => c.id === coffreId)?.name ?? '—'
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function expiresIn(deletedAt: number): string {
  const remaining = deletedAt + THIRTY_DAYS - Date.now()
  if (remaining <= 0) return 'Expiré'
  const days = Math.ceil(remaining / (24 * 60 * 60 * 1000))
  if (days === 1) return '1 jour'
  return `${days} jours`
}

// ── Actions ──────────────────────────────────────────────────────────────────

async function loadAll() {
  isLoading.value = true
  try {
    const [allEntries, allFolders, allCoffres] = await Promise.all([
      getTrashedEntries(),
      getTrashedFolders(),
      getAllCoffres(),
    ])
    coffres.value = allCoffres

    // Auto-purge des éléments expirés (y compris les enfants de cascade)
    const now = Date.now()
    const expiredEntries = allEntries.filter(e => e.deletedAt + THIRTY_DAYS < now)
    const expiredFolders = allFolders.filter(f => f.deletedAt + THIRTY_DAYS < now)
    await Promise.all([
      ...expiredEntries.map(e => permanentlyDeleteEntry(e.id)),
      ...expiredFolders.map(f => permanentlyDeleteFolder(f.id)),
    ])

    // Affiche uniquement les éléments de premier niveau (pas les enfants de cascade)
    trashedEntries.value = allEntries.filter(e => !e.cascadeDeletedBy && e.deletedAt + THIRTY_DAYS >= now)
    trashedFolders.value = allFolders.filter(f => !f.cascadeDeletedBy && f.deletedAt + THIRTY_DAYS >= now)
    selectedKeys.value = new Set()
  } catch (err) {
    console.error('Erreur chargement corbeille :', err)
  } finally {
    isLoading.value = false
  }
}

function handleRestore(kind: 'entry' | 'folder', id: string, name: string) {
  askConfirm(
    'Restaurer cet élément',
    `Restaurer « ${name} » ?${kind === 'folder' ? ' Son contenu (sous-dossiers et mots de passe) sera également restauré.' : ''}`,
    'Restaurer',
    'restore',
    async () => {
      if (kind === 'entry') {
        await restoreEntry(id)
        trashedEntries.value = trashedEntries.value.filter(e => e.id !== id)
      } else {
        await Promise.all([
          restoreFolder(id),
          restoreFolderCascadeByFolder(id),
          restoreEntryCascadeByFolder(id),
        ])
        trashedFolders.value = trashedFolders.value.filter(f => f.id !== id)
      }
      removeFromSelection(kind, id)
    },
  )
}

function handlePermanentDelete(kind: 'entry' | 'folder', id: string, name: string) {
  askConfirm(
    'Suppression définitive',
    `Supprimer définitivement « ${name} » ?${kind === 'folder' ? ' Son contenu sera également supprimé.' : ''} Cette action est irréversible.`,
    'Supprimer définitivement',
    'danger',
    async () => {
      if (kind === 'entry') {
        await permanentlyDeleteEntry(id)
        trashedEntries.value = trashedEntries.value.filter(e => e.id !== id)
      } else {
        await Promise.all([
          permanentlyDeleteFolder(id),
          permanentlyDeleteFolderCascadeByFolder(id),
          permanentlyDeleteEntryCascadeByFolder(id),
        ])
        trashedFolders.value = trashedFolders.value.filter(f => f.id !== id)
      }
      removeFromSelection(kind, id)
    },
  )
}

function handleRestoreSelected() {
  const rows = allTrashed.value.filter(r => selectedKeys.value.has(rowKey(r.kind, r.id)))
  const count = rows.length
  askConfirm(
    'Restaurer les éléments',
    `Restaurer ${count} élément${count > 1 ? 's' : ''} ? Le contenu des dossiers sélectionnés sera également restauré.`,
    'Restaurer',
    'restore',
    async () => {
      await Promise.all(rows.map(row => row.kind === 'entry'
        ? restoreEntry(row.id)
        : Promise.all([restoreFolder(row.id), restoreFolderCascadeByFolder(row.id), restoreEntryCascadeByFolder(row.id)]),
      ))
      const entryIds = new Set(rows.filter(r => r.kind === 'entry').map(r => r.id))
      const folderIds = new Set(rows.filter(r => r.kind === 'folder').map(r => r.id))
      trashedEntries.value = trashedEntries.value.filter(e => !entryIds.has(e.id))
      trashedFolders.value = trashedFolders.value.filter(f => !folderIds.has(f.id))
      selectedKeys.value = new Set()
    },
  )
}

function handlePermanentDeleteSelected() {
  const rows = allTrashed.value.filter(r => selectedKeys.value.has(rowKey(r.kind, r.id)))
  const count = rows.length
  askConfirm(
    'Suppression définitive',
    `Supprimer définitivement ${count} élément${count > 1 ? 's' : ''} ? Cette action est irréversible.`,
    'Supprimer définitivement',
    'danger',
    async () => {
      await Promise.all(rows.map(row => row.kind === 'entry'
        ? permanentlyDeleteEntry(row.id)
        : Promise.all([permanentlyDeleteFolder(row.id), permanentlyDeleteFolderCascadeByFolder(row.id), permanentlyDeleteEntryCascadeByFolder(row.id)]),
      ))
      const entryIds = new Set(rows.filter(r => r.kind === 'entry').map(r => r.id))
      const folderIds = new Set(rows.filter(r => r.kind === 'folder').map(r => r.id))
      trashedEntries.value = trashedEntries.value.filter(e => !entryIds.has(e.id))
      trashedFolders.value = trashedFolders.value.filter(f => !folderIds.has(f.id))
      selectedKeys.value = new Set()
    },
  )
}

function handleLock() { vault.lock(); router.push({ name: 'unlock' }) }
async function handleLogout() { await logOut(); router.push({ name: 'login' }) }

// ── Modale de confirmation ────────────────────────────────────────────────────

type ConfirmVariant = 'danger' | 'restore'
const confirm = ref<{
  title: string
  message: string
  confirmLabel: string
  variant: ConfirmVariant
  action: () => Promise<void>
} | null>(null)
const isConfirming = ref(false)

function askConfirm(
  title: string,
  message: string,
  confirmLabel: string,
  variant: ConfirmVariant,
  action: () => Promise<void>,
) {
  confirm.value = { title, message, confirmLabel, variant, action }
}

async function runConfirm() {
  if (!confirm.value) return
  isConfirming.value = true
  try { await confirm.value.action() } finally {
    isConfirming.value = false
    confirm.value = null
  }
}

onMounted(loadAll)
</script>

<template>
  <div class="min-h-screen bg-bg text-text flex flex-col">

    <!-- Header -->
    <header class="vault-header sticky top-0 z-20 border-b border-border px-6 py-3.5 flex items-center justify-between shrink-0">
      <h1 class="font-[family-name:var(--font-display)] text-lg font-bold">
        Obsid<span class="text-accent">key</span>
      </h1>
      <div class="flex items-center gap-1">
        <button class="header-btn text-text-muted hover:text-accent" @click="handleLock">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span class="text-sm">Verrouiller</span>
        </button>
        <button class="header-btn text-text-muted hover:text-danger" @click="handleLogout">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span class="text-sm">Se déconnecter</span>
        </button>
      </div>
    </header>

    <div class="flex flex-1 overflow-hidden">

      <!-- Sidebar -->
      <aside class="sidebar w-60 shrink-0 border-r border-border flex flex-col">
        <div class="px-3 pt-4 pb-2">
          <RouterLink
            to="/vault"
            class="nav-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-text-muted hover:text-text hover:bg-surface transition-colors w-full text-left"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0">
              <path d="m15 18-6-6 6-6"/>
            </svg>
            Retour au coffre
          </RouterLink>
        </div>
        <div class="px-5 pt-2 pb-1">
          <p class="text-xs text-text-muted uppercase tracking-wider font-medium">Corbeille</p>
        </div>
        <div class="px-5 py-3 text-xs text-text-muted">
          Les éléments supprimés sont conservés 30 jours avant d'être effacés définitivement.
        </div>
      </aside>

      <!-- Contenu principal -->
      <main class="flex-1 overflow-auto px-6 py-6 space-y-4">

        <!-- Titre -->
        <div class="flex items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 text-text-muted shrink-0">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
          <span class="text-xl font-bold text-text">Corbeille</span>
        </div>

        <!-- Barre d'actions groupées -->
        <div v-if="selectedKeys.size > 0" class="bulk-bar flex items-center gap-3 px-4 py-2.5 rounded-lg">
          <span class="text-xs text-text-muted">{{ selectedKeys.size }} sélectionné{{ selectedKeys.size > 1 ? 's' : '' }}</span>
          <div class="flex items-center gap-2 ml-auto">
            <button class="restore-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium" @click="handleRestoreSelected">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
              Restaurer
            </button>
            <button class="delete-selection-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium" @click="handlePermanentDeleteSelected">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
              Supprimer définitivement
            </button>
          </div>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center gap-3 text-text-muted text-sm py-16 justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin w-4 h-4"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          Chargement…
        </div>

        <!-- Tableau -->
        <div v-else-if="allTrashed.length > 0" class="vault-table rounded-xl overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="table-head border-b border-border text-left">
                <th class="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    class="cb"
                    :checked="isAllSelected"
                    :ref="(el) => { if (el) (el as HTMLInputElement).indeterminate = isIndeterminate }"
                    @change="toggleSelectAll"
                  />
                </th>
                <th class="px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider w-8"></th>
                <th class="px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Nom</th>
                <th class="px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Coffre</th>
                <th class="px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Supprimé le</th>
                <th class="px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Expire dans</th>
                <th class="px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in allTrashed"
                :key="row.kind + '-' + row.id"
                class="table-row border-b border-border last:border-0 transition-colors"
                :class="selectedKeys.has(rowKey(row.kind, row.id)) ? 'row-selected' : ''"
              >
                <!-- Case à cocher -->
                <td class="px-4 py-3.5">
                  <input
                    type="checkbox"
                    class="cb"
                    :checked="selectedKeys.has(rowKey(row.kind, row.id))"
                    @change="toggleSelect(row.kind, row.id)"
                  />
                </td>

                <!-- Icône type -->
                <td class="px-4 py-3.5">
                  <div v-if="row.kind === 'folder'" class="folder-icon w-7 h-7 rounded-lg flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5">
                      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
                    </svg>
                  </div>
                  <div v-else class="entry-icon w-7 h-7 rounded-lg flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5">
                      <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </div>
                </td>

                <!-- Nom -->
                <td class="px-4 py-3.5">
                  <span class="font-medium text-text">{{ row.displayName }}</span>
                </td>

                <!-- Coffre -->
                <td class="px-4 py-3.5">
                  <span class="text-text-muted text-xs">{{ coffreName(row.coffreId) }}</span>
                </td>

                <!-- Supprimé le -->
                <td class="px-4 py-3.5">
                  <span class="text-text-muted text-xs">{{ formatDate(row.deletedAt) }}</span>
                </td>

                <!-- Expire dans -->
                <td class="px-4 py-3.5">
                  <span
                    class="text-xs font-medium"
                    :class="expiresIn(row.deletedAt) === 'Expiré' || parseInt(expiresIn(row.deletedAt)) <= 3 ? 'text-danger' : 'text-text-muted'"
                  >{{ expiresIn(row.deletedAt) }}</span>
                </td>

                <!-- Actions -->
                <td class="px-4 py-3.5">
                  <div class="flex items-center justify-end gap-2">
                    <button
                      class="restore-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      @click="handleRestore(row.kind, row.id, row.displayName)"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                        <path d="M3 3v5h5"/>
                      </svg>
                      Restaurer
                    </button>
                    <button
                      class="icon-btn text-text-muted hover:text-danger"
                      title="Supprimer définitivement"
                      @click="handlePermanentDelete(row.kind, row.id, row.displayName)"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Vide -->
        <div v-else class="flex flex-col items-center justify-center py-24 text-center">
          <div class="empty-icon w-16 h-16 rounded-2xl flex items-center justify-center mb-5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 text-text-muted">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </div>
          <p class="text-text font-semibold text-lg mb-2">Corbeille vide</p>
          <p class="text-text-muted text-sm">Les éléments supprimés apparaissent ici pendant 30 jours.</p>
        </div>

      </main>
    </div>

    <!-- Modale de confirmation -->
    <Teleport to="body">
      <div v-if="confirm" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm" @click="confirm = null" />
        <div class="coffre-modal relative w-full max-w-sm rounded-2xl p-6 space-y-4">
          <div class="flex items-center gap-3">
            <!-- Icône variante -->
            <div
              class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              :class="confirm.variant === 'restore' ? 'confirm-icon-restore' : 'confirm-icon-danger'"
            >
              <!-- Restaurer -->
              <svg v-if="confirm.variant === 'restore'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
              <!-- Supprimer -->
              <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </div>
            <div>
              <p class="font-semibold text-text">{{ confirm.title }}</p>
              <p class="text-sm text-text-muted mt-0.5">{{ confirm.message }}</p>
            </div>
          </div>
          <div class="flex gap-2 pt-1">
            <button class="flex-1 border border-border text-text-muted rounded-lg py-2.5 text-sm hover:text-text transition-colors" @click="confirm = null">Annuler</button>
            <button
              class="flex-1 font-medium rounded-lg py-2.5 text-sm disabled:opacity-50"
              :class="confirm.variant === 'restore' ? 'restore-confirm-btn' : 'delete-btn'"
              :disabled="isConfirming"
              @click="runConfirm"
            >
              {{ isConfirming ? (confirm.variant === 'restore' ? 'Restauration…' : 'Suppression…') : confirm.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<style scoped>
.vault-header { background: rgba(10,14,18,0.9); backdrop-filter: blur(12px); }
.header-btn { display:flex; align-items:center; gap:0.375rem; padding: 0.375rem 0.625rem; border-radius:0.5rem; transition: background-color 0.15s, color 0.15s; }
.header-btn:hover { background: rgba(255,255,255,0.05); }
.sidebar { background: rgba(12,16,22,0.6); }
.nav-item { display: flex; }
.icon-btn { display:flex; align-items:center; justify-content:center; width:2rem; height:2rem; border-radius:0.5rem; transition: background-color 0.15s, color 0.15s; }
.icon-btn:hover { background: rgba(255,255,255,0.05); }
.vault-table { background: rgba(18,24,31,0.7); border: 1px solid rgba(31,42,53,0.9); box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
.table-head { background: rgba(10,14,18,0.5); }
.table-row:hover { background: rgba(167,139,250,0.03); }
.folder-icon { background: rgba(167,139,250,0.08); border: 1px solid rgba(167,139,250,0.15); color: var(--color-accent); }
.entry-icon { background: linear-gradient(135deg,rgba(167,139,250,0.15),rgba(124,58,237,0.1)); border: 1px solid rgba(167,139,250,0.2); color: var(--color-accent); }
.restore-btn { background: rgba(167,139,250,0.1); border: 1px solid rgba(167,139,250,0.2); color: var(--color-accent); }
.restore-btn:hover { background: rgba(167,139,250,0.18); }
.empty-icon { background: rgba(18,24,31,0.8); border: 1px solid rgba(31,42,53,0.8); }
.coffre-modal { background: rgba(18,24,31,0.97); border: 1px solid rgba(31,42,53,0.9); box-shadow: 0 16px 48px rgba(0,0,0,0.6); backdrop-filter: blur(16px); }
.delete-btn { background: linear-gradient(135deg,#f87171 0%,#dc2626 100%); color:white; box-shadow: 0 0 16px rgba(220,38,38,0.2); transition: box-shadow 0.2s; }
.delete-btn:not(:disabled):hover { box-shadow: 0 0 24px rgba(220,38,38,0.35); }
.confirm-icon-danger { background: rgba(248,113,113,0.1); border: 1px solid rgba(248,113,113,0.2); color: var(--color-danger); }
.confirm-icon-restore { background: rgba(167,139,250,0.1); border: 1px solid rgba(167,139,250,0.2); color: var(--color-accent); }
.restore-confirm-btn { background: linear-gradient(135deg,#A78BFA 0%,#7C3AED 100%); color:white; box-shadow: 0 0 16px rgba(167,139,250,0.2); transition: box-shadow 0.2s; }
.restore-confirm-btn:not(:disabled):hover { box-shadow: 0 0 24px rgba(167,139,250,0.35); }

/* Checkboxes */
.cb {
  appearance: none;
  -webkit-appearance: none;
  width: 1rem;
  height: 1rem;
  border-radius: 0.25rem;
  border: 1.5px solid rgba(167,139,250,0.3);
  background: transparent;
  cursor: pointer;
  position: relative;
  transition: background 0.15s, border-color 0.15s;
  display: block;
  flex-shrink: 0;
}
.cb:hover { border-color: rgba(167,139,250,0.6); }
.cb:checked { background: #A78BFA; border-color: #A78BFA; }
.cb:checked::after {
  content: '';
  display: block;
  width: 0.35rem;
  height: 0.6rem;
  border: 2px solid white;
  border-top: none;
  border-left: none;
  transform: rotate(45deg) translate(1px, -1px);
  position: absolute;
  top: 50%;
  left: 50%;
  margin-top: -0.38rem;
  margin-left: -0.18rem;
}
.cb:indeterminate { background: rgba(167,139,250,0.4); border-color: #A78BFA; }
.cb:indeterminate::after {
  content: '';
  display: block;
  width: 0.5rem;
  height: 2px;
  background: white;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

/* Ligne sélectionnée */
.row-selected { background: rgba(167,139,250,0.06) !important; }

/* Barre d'actions groupées */
.bulk-bar { background: rgba(167,139,250,0.06); border: 1px solid rgba(167,139,250,0.15); }

/* Bouton supprimer sélection */
.delete-selection-btn {
  background: rgba(248,113,113,0.1);
  border: 1px solid rgba(248,113,113,0.25);
  color: #f87171;
  transition: background 0.15s, border-color 0.15s;
}
.delete-selection-btn:hover { background: rgba(248,113,113,0.18); border-color: rgba(248,113,113,0.4); }
</style>
