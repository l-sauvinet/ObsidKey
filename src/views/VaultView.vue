<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Key } from '@lucide/vue'
import { logOut } from '@/services/auth'
import { useVaultStore } from '@/stores/vault'
import { getAllEntries, addEntry, updateEntry, deleteEntry, permanentlyDeleteEntry, type VaultEntry } from '@/services/vaultEntries'
import { getAllCoffres, addCoffre, deleteCoffre, type VaultCoffre } from '@/services/vaultCoffres'
import { getAllFolders, addFolder, updateFolder, deleteFolder, permanentlyDeleteFolder, type VaultFolder } from '@/services/vaultFolders'
import AddEntryModal from '@/components/AddEntryModal.vue'
import EditEntryModal from '@/components/EditEntryModal.vue'
import MoveModal from '@/components/MoveModal.vue'

const router = useRouter()
const vault = useVaultStore()

const entries  = ref<VaultEntry[]>([])
const coffres  = ref<VaultCoffre[]>([])
const folders  = ref<VaultFolder[]>([])
const isLoading = ref(true)
const showAddModal = ref(false)
const editingEntry = ref<VaultEntry | null>(null)
const movingEntry = ref<VaultEntry | null>(null)
const movingFolder = ref<VaultFolder | null>(null)

function getDescendantFolderIds(id: string): string[] {
  const children = folders.value.filter(f => f.parentId === id).map(f => f.id)
  return [...children, ...children.flatMap(cid => getDescendantFolderIds(cid))]
}

async function handleMoveEntry(targetFolderId: string | null) {
  const entry = movingEntry.value
  if (!entry) return
  await updateEntry(entry.id, { ...entry, folderId: targetFolderId ?? undefined })
  await loadAll()
  movingEntry.value = null
}

async function handleMoveFolder(targetFolderId: string | null) {
  const folder = movingFolder.value
  if (!folder) return
  await updateFolder(folder.id, folder.name, folder.coffreId, targetFolderId ?? undefined)
  await loadAll()
  movingFolder.value = null
}
const revealedIds = ref<Set<string>>(new Set())
const copiedId = ref<string | null>(null)
const search = ref('')

const activeCoffreId = ref<string | null>(sessionStorage.getItem('obsidkey_coffre') ?? null)
const activeFolderId = ref<string | null>(sessionStorage.getItem('obsidkey_folder') ?? null)

watch(activeCoffreId, v => v ? sessionStorage.setItem('obsidkey_coffre', v) : sessionStorage.removeItem('obsidkey_coffre'))
watch(activeFolderId, v => v ? sessionStorage.setItem('obsidkey_folder', v) : sessionStorage.removeItem('obsidkey_folder'))

// ── Computed ─────────────────────────────────────────────────────────────────

const activeCoffre = computed(() => coffres.value.find(c => c.id === activeCoffreId.value))

const coffreFolders = computed(() =>
  folders.value.filter(f => f.coffreId === activeCoffreId.value),
)

type FolderNode = VaultFolder & { depth: number }

function buildFolderTree(parentId: string | undefined, depth: number): FolderNode[] {
  return coffreFolders.value
    .filter(f => f.parentId === parentId)
    .flatMap(f => [{ ...f, depth }, ...buildFolderTree(f.id, depth + 1)])
}

const folderTree = computed(() => buildFolderTree(undefined, 0))

const breadcrumbPath = computed(() => {
  const parts: Array<{ name: string; folderId: string | null }> = []
  if (activeCoffre.value) parts.push({ name: activeCoffre.value.name, folderId: null })
  if (activeFolderId.value) {
    const path: Array<{ name: string; folderId: string }> = []
    let cur: VaultFolder | undefined = folders.value.find(f => f.id === activeFolderId.value)
    while (cur) {
      path.unshift({ name: cur.name, folderId: cur.id })
      cur = cur.parentId ? folders.value.find(f => f.id === cur!.parentId) : undefined
    }
    parts.push(...path)
  }
  return parts
})

function navigateBreadcrumb(folderId: string | null) {
  activeFolderId.value = folderId
}

function goBack() {
  if (!activeFolderId.value) return
  const cur = folders.value.find(f => f.id === activeFolderId.value)
  activeFolderId.value = cur?.parentId ?? null
}

// Dossiers enfants directs de l'emplacement actif
const currentFolders = computed(() => {
  if (!activeCoffreId.value) return []
  return folders.value
    .filter(f =>
      f.coffreId === activeCoffreId.value &&
      f.parentId === (activeFolderId.value ?? undefined),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
})

const filteredEntries = computed(() => {
  if (!activeCoffreId.value) return []
  let result = entries.value.filter(e =>
    e.coffreId === activeCoffreId.value &&
    (activeFolderId.value ? e.folderId === activeFolderId.value : !e.folderId),
  )
  const q = search.value.trim().toLowerCase()
  if (q) {
    result = result.filter(e =>
      e.title.toLowerCase().includes(q) ||
      (e.username ?? '').toLowerCase().includes(q) ||
      (e.url ?? '').toLowerCase().includes(q),
    )
  }
  return result.sort((a, b) => a.title.localeCompare(b.title))
})

// ── Pagination ───────────────────────────────────────────────────────────────

type TableRow = { kind: 'folder'; item: VaultFolder } | { kind: 'entry'; item: VaultEntry }

const pageSize = ref<10 | 25 | 50>(10)
const currentPage = ref(1)

watch([activeFolderId, activeCoffreId, search, pageSize], () => { currentPage.value = 1 })

const allRows = computed((): TableRow[] => [
  ...currentFolders.value.map(item => ({ kind: 'folder' as const, item })),
  ...filteredEntries.value.map(item => ({ kind: 'entry' as const, item })),
])

const totalPages = computed(() => Math.max(1, Math.ceil(allRows.value.length / pageSize.value)))

const paginatedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return allRows.value.slice(start, start + pageSize.value)
})

// Entrées totales dans un coffre (pour le compteur)
const coffreEntryCount = computed(() => {
  const counts: Record<string, number> = {}
  for (const e of entries.value) {
    if (e.coffreId) counts[e.coffreId] = (counts[e.coffreId] ?? 0) + 1
  }
  return counts
})

// ── Actions ──────────────────────────────────────────────────────────────────

async function loadAll() {
  isLoading.value = true
  try {
    ;[entries.value, coffres.value, folders.value] = await Promise.all([
      getAllEntries(), getAllCoffres(), getAllFolders(),
    ])
    if (coffres.value.length > 0) {
      const savedExists = coffres.value.some(c => c.id === activeCoffreId.value)
      if (!savedExists) activeCoffreId.value = coffres.value[0].id
    }
    // Vérifie que le dossier restauré appartient bien au coffre actif
    if (activeFolderId.value && !folders.value.some(f => f.id === activeFolderId.value && f.coffreId === activeCoffreId.value)) {
      activeFolderId.value = null
    }
  } catch (err) {
    console.error('Erreur de chargement :', err)
  } finally {
    isLoading.value = false
  }
}

function selectCoffre(id: string) {
  activeCoffreId.value = id
  activeFolderId.value = null
}

function handleDelete(id: string) {
  const entry = entries.value.find(e => e.id === id)
  askConfirm(
    `Supprimer « ${entry?.title ?? 'cette entrée'} » ?`,
    async () => {
      await deleteEntry(id)
      entries.value = entries.value.filter(e => e.id !== id)
    },
  )
}

function handleDeleteFolder(id: string) {
  const folder = folders.value.find(f => f.id === id)
  const descendantIds = getDescendantFolderIds(id)
  const affectedFolderIds = new Set([id, ...descendantIds])
  const affectedEntries = entries.value.filter(e => e.folderId && affectedFolderIds.has(e.folderId))
  const hasContent = descendantIds.length > 0 || affectedEntries.length > 0

  askConfirm(
    hasContent
      ? `Supprimer le dossier « ${folder?.name ?? 'ce dossier'} » et tout son contenu ?`
      : `Supprimer le dossier « ${folder?.name ?? 'ce dossier'} » ?`,
    async () => {
      await Promise.all([
        deleteFolder(id),
        ...descendantIds.map(fid => deleteFolder(fid, id)),
        ...affectedEntries.map(e => deleteEntry(e.id, id)),
      ])
      folders.value = folders.value.filter(f => !affectedFolderIds.has(f.id))
      entries.value = entries.value.filter(e => !affectedEntries.some(ae => ae.id === e.id))
      if (activeFolderId.value && affectedFolderIds.has(activeFolderId.value)) {
        activeFolderId.value = null
      }
    },
  )
}

function handleDeleteCoffre(id: string) {
  const coffre = coffres.value.find(c => c.id === id)
  const coffreFolders = folders.value.filter(f => f.coffreId === id)
  const coffreEntries = entries.value.filter(e => e.coffreId === id)
  const hasContent = coffreFolders.length > 0 || coffreEntries.length > 0

  askConfirm(
    hasContent
      ? `Supprimer définitivement le coffre « ${coffre?.name ?? 'ce coffre'} » et tout son contenu ? Cette action est irréversible — rien ne sera placé dans la corbeille.`
      : `Supprimer définitivement le coffre « ${coffre?.name ?? 'ce coffre'} » ? Cette action est irréversible.`,
    async () => {
      await Promise.all([
        ...coffreFolders.map(f => permanentlyDeleteFolder(f.id)),
        ...coffreEntries.map(e => permanentlyDeleteEntry(e.id)),
      ])
      await deleteCoffre(id)
      coffres.value = coffres.value.filter(c => c.id !== id)
      folders.value = folders.value.filter(f => f.coffreId !== id)
      entries.value = entries.value.filter(e => e.coffreId !== id)
      if (activeCoffreId.value === id) {
        activeCoffreId.value = coffres.value[0]?.id ?? null
        activeFolderId.value = null
      }
    },
  )
}

function toggleReveal(id: string) {
  const s = new Set(revealedIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  revealedIds.value = s
}

async function copyText(text: string, id: string) {
  await navigator.clipboard.writeText(text)
  copiedId.value = id
  setTimeout(() => (copiedId.value = null), 1500)
}

function avatarLetter(title: string) { return title.trim()[0]?.toUpperCase() ?? '?' }
function handleLock() { vault.lock(); router.push({ name: 'unlock' }) }
async function handleLogout() { await logOut(); router.push({ name: 'login' }) }

// ── Modale coffre ─────────────────────────────────────────────────────────────

const showCoffreForm = ref(false)
const newCoffreName = ref('')
const isSavingCoffre = ref(false)

async function confirmAddCoffre() {
  const name = newCoffreName.value.trim()
  if (!name) return
  isSavingCoffre.value = true
  try {
    const coffre = await addCoffre(name)
    coffres.value = [...coffres.value, coffre].sort((a, b) => a.name.localeCompare(b.name))
    selectCoffre(coffre.id)
  } finally {
    isSavingCoffre.value = false
    showCoffreForm.value = false
    newCoffreName.value = ''
  }
}

// ── Dropdown Ajouter ──────────────────────────────────────────────────────────

const showAddMenu = ref(false)

// ── Modale dossier ────────────────────────────────────────────────────────────

const showFolderForm = ref(false)
const newFolderName = ref('')
const isSavingFolder = ref(false)

const editingFolder = ref<VaultFolder | null>(null)
const editFolderName = ref('')
const isSavingFolderEdit = ref(false)

async function confirmEditFolder() {
  const name = editFolderName.value.trim()
  if (!name || !editingFolder.value) return
  isSavingFolderEdit.value = true
  try {
    await updateFolder(editingFolder.value.id, name, editingFolder.value.coffreId, editingFolder.value.parentId)
    folders.value = folders.value.map(f =>
      f.id === editingFolder.value!.id ? { ...f, name } : f,
    ).sort((a, b) => a.name.localeCompare(b.name))
  } finally {
    isSavingFolderEdit.value = false
    editingFolder.value = null
    editFolderName.value = ''
  }
}

async function confirmAddFolder() {
  const name = newFolderName.value.trim()
  if (!name || !activeCoffreId.value) return
  isSavingFolder.value = true
  try {
    const folder = await addFolder(name, activeCoffreId.value, activeFolderId.value ?? undefined)
    folders.value = [...folders.value, folder].sort((a, b) => a.name.localeCompare(b.name))
    activeFolderId.value = folder.id
  } finally {
    isSavingFolder.value = false
    showFolderForm.value = false
    newFolderName.value = ''
  }
}

// ── Modale de confirmation ────────────────────────────────────────────────────

const confirm = ref<{ message: string; action: () => Promise<void> } | null>(null)
const isConfirming = ref(false)

function askConfirm(message: string, action: () => Promise<void>) {
  confirm.value = { message, action }
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
      <aside class="sidebar w-60 shrink-0 border-r border-border flex flex-col overflow-y-auto">

        <!-- Nouveau coffre -->
        <div class="p-3 pb-2 border-b border-border">
          <button
            class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-muted hover:text-accent hover:bg-surface transition-colors"
            @click="showCoffreForm = true; newCoffreName = ''"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 shrink-0">
              <path d="M5 12h14"/><path d="M12 5v14"/>
            </svg>
            Nouveau coffre
          </button>
        </div>

        <!-- Label -->
        <div class="px-5 pt-3 pb-1">
          <p class="text-xs text-text-muted uppercase tracking-wider font-medium">Coffres</p>
        </div>

        <!-- Liste coffres + dossiers -->
        <nav class="px-3 space-y-0.5 flex-1 pb-4">
          <template v-for="coffre in coffres" :key="coffre.id">

            <!-- Coffre -->
            <div class="group flex items-center gap-0.5">
              <button
                class="nav-item flex-1 flex items-center justify-between px-3 py-2 rounded-lg text-sm min-w-0"
                :class="activeCoffreId === coffre.id ? 'nav-coffre-active' : 'text-text-muted hover:text-text hover:bg-surface'"
                @click="selectCoffre(coffre.id)"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 shrink-0">
                    <rect width="18" height="18" x="3" y="3" rx="2"/>
                    <circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>
                    <path d="m7.9 7.9 2.7 2.7"/>
                    <circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>
                    <path d="m13.4 10.6 2.7-2.7"/>
                    <circle cx="7.5" cy="16.5" r=".5" fill="currentColor"/>
                    <path d="m7.9 16.1 2.7-2.7"/>
                    <circle cx="16.5" cy="16.5" r=".5" fill="currentColor"/>
                    <path d="m13.4 13.4 2.7 2.7"/>
                    <circle cx="12" cy="12" r="2"/>
                  </svg>
                  <span class="truncate font-medium">{{ coffre.name }}</span>
                </div>
                <span class="nav-count shrink-0">{{ coffreEntryCount[coffre.id] ?? 0 }}</span>
              </button>
              <button
                class="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-all text-text-muted hover:text-danger"
                :title="(folders.some(f => f.coffreId === coffre.id) || entries.some(e => e.coffreId === coffre.id)) ? 'Vide le coffre avant de le supprimer' : 'Supprimer'"
                @click.stop="handleDeleteCoffre(coffre.id)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
            </div>


          </template>

          <p v-if="coffres.length === 0 && !isLoading" class="text-xs text-text-muted px-3 py-2">Aucun coffre</p>
        </nav>
      </aside>

      <!-- Contenu principal -->
      <main class="flex-1 flex flex-col overflow-hidden px-6 py-6 gap-4">

        <!-- Onboarding : aucun coffre -->
        <div v-if="coffres.length === 0 && !isLoading" class="flex flex-col items-center justify-center py-24 text-center">
          <div class="empty-icon w-16 h-16 rounded-2xl flex items-center justify-center mb-5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 text-text-muted">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <p class="text-text font-semibold text-lg mb-2">Aucun coffre</p>
          <p class="text-text-muted text-sm mb-6">Crée ton premier coffre pour organiser tes mots de passe.</p>
          <button class="add-btn flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold" @click="showCoffreForm = true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            Créer un coffre
          </button>
        </div>

        <template v-else-if="activeCoffre">

          <!-- Breadcrumb cliquable -->
          <div class="flex items-center gap-2 min-w-0 flex-wrap">
            <template v-for="(part, i) in breadcrumbPath" :key="i">
              <span v-if="i > 0" class="text-border text-sm">/</span>
              <!-- Coffre (index 0) : plus grand + icône -->
              <template v-if="i === 0">
                <div class="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 shrink-0" :class="breadcrumbPath.length === 1 ? 'text-text' : 'text-text-muted'">
                    <rect width="18" height="18" x="3" y="3" rx="2"/>
                    <circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>
                    <path d="m7.9 7.9 2.7 2.7"/>
                    <circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>
                    <path d="m13.4 10.6 2.7-2.7"/>
                    <circle cx="7.5" cy="16.5" r=".5" fill="currentColor"/>
                    <path d="m7.9 16.1 2.7-2.7"/>
                    <circle cx="16.5" cy="16.5" r=".5" fill="currentColor"/>
                    <path d="m13.4 13.4 2.7 2.7"/>
                    <circle cx="12" cy="12" r="2"/>
                  </svg>
                  <button
                    v-if="breadcrumbPath.length > 1"
                    class="text-xl font-bold text-text-muted hover:text-accent transition-colors"
                    @click="navigateBreadcrumb(part.folderId)"
                  >{{ part.name }}</button>
                  <span v-else class="text-xl font-bold text-text">{{ part.name }}</span>
                </div>
              </template>
              <!-- Dossiers (index > 0) : taille normale -->
              <template v-else>
                <button
                  v-if="i < breadcrumbPath.length - 1"
                  class="text-sm text-text-muted hover:text-accent transition-colors"
                  @click="navigateBreadcrumb(part.folderId)"
                >{{ part.name }}</button>
                <span v-else class="text-sm text-text font-semibold">{{ part.name }}</span>
              </template>
            </template>
          </div>

          <!-- Toolbar -->
          <div class="flex items-center gap-3">
            <div class="relative flex-1">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
              </svg>
              <input v-model="search" type="search" placeholder="Rechercher…" class="search-input w-full pl-9 pr-4 py-2.5 rounded-lg text-sm text-text" />
            </div>

            <!-- Dropdown Ajouter -->
            <div class="relative">
              <button class="add-btn flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold" @click="showAddMenu = !showAddMenu">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                Ajouter
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 opacity-70"><polyline points="6 9 12 15 18 9"/></svg>
              </button>

              <div v-if="showAddMenu" class="add-menu absolute right-0 top-full mt-2 w-60 rounded-xl overflow-hidden z-30">
                <button
                  class="add-menu-item w-full flex items-center gap-3 px-4 py-3 text-sm text-left"
                  @click="showAddMenu = false; showAddModal = true"
                >
                  <div class="menu-icon-wrap">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </div>
                  <div>
                    <p class="font-medium text-text">Mot de passe</p>
                    <p class="text-xs text-text-muted">Ajouter ici</p>
                  </div>
                </button>
                <div class="menu-divider" />
                <button
                  class="add-menu-item w-full flex items-center gap-3 px-4 py-3 text-sm text-left"
                  @click="showAddMenu = false; showFolderForm = true; newFolderName = ''"
                >
                  <div class="menu-icon-wrap">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
                  </div>
                  <div>
                    <p class="font-medium text-text">Dossier</p>
                    <p class="text-xs text-text-muted">Créer ici</p>
                  </div>
                </button>
              </div>
            </div>

            <!-- Lien Corbeille -->
            <RouterLink
              to="/trash"
              class="trash-btn flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium"
              title="Corbeille"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
              Corbeille
            </RouterLink>
          </div>

          <!-- Loading -->
          <div v-if="isLoading" class="flex items-center gap-3 text-text-muted text-sm py-16 justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin w-4 h-4"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            Déchiffrement en cours…
          </div>

          <!-- Tableau + Pagination : zone flex-1 pour coller la pagination en bas -->
          <div class="flex-1 flex flex-col min-h-0 gap-3">

          <!-- Tableau explorateur -->
          <div v-if="!isLoading && (activeFolderId || currentFolders.length > 0 || filteredEntries.length > 0)" class="vault-table rounded-xl overflow-hidden shrink-0">
            <table class="w-full text-sm table-fixed">
              <colgroup>
                <col class="w-[28%]" />
                <col class="w-[22%]" />
                <col class="w-[20%]" />
                <col class="w-[22%]" />
                <col class="w-[8%]" />
              </colgroup>
              <thead>
                <tr class="table-head border-b border-border text-left">
                  <th class="pl-[60px] pr-4 py-2 text-xs font-medium text-text-muted uppercase tracking-wider">Nom</th>
                  <th class="px-4 py-2 text-xs font-medium text-text-muted uppercase tracking-wider">Identifiant</th>
                  <th class="px-4 py-2 text-xs font-medium text-text-muted uppercase tracking-wider">Mot de passe</th>
                  <th class="px-4 py-2 text-xs font-medium text-text-muted uppercase tracking-wider">URL</th>
                  <th class="px-4 py-2 text-xs font-medium text-text-muted uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <!-- Ligne retour arrière -->
                <tr v-if="activeFolderId" class="table-row back-row border-b border-border cursor-pointer transition-colors" @click="goBack">
                  <td colspan="5" class="px-4 py-3">
                    <div class="flex items-center gap-2 text-text-muted">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0">
                        <path d="m15 18-6-6 6-6"/>
                      </svg>
                      <span>Retour</span>
                    </div>
                  </td>
                </tr>

                <!-- Dossiers et mots de passe paginés -->
                <template v-for="row in paginatedRows" :key="row.kind + '-' + row.item.id">

                  <!-- Ligne dossier -->
                  <tr v-if="row.kind === 'folder'" class="table-row folder-row border-b border-border cursor-pointer transition-colors" @click="activeFolderId = row.item.id">
                    <td colspan="4" class="px-4 py-2.5">
                      <div class="flex items-center gap-3">
                        <div class="folder-avatar w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
                            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
                          </svg>
                        </div>
                        <span class="font-medium text-text">{{ row.item.name }}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-border ml-auto mr-2 shrink-0"><path d="m9 18 6-6-6-6"/></svg>
                      </div>
                    </td>
                    <td class="px-4 py-2.5">
                      <div class="flex justify-end gap-1">
                        <button class="icon-btn text-text-muted hover:text-accent" title="Déplacer" @click.stop="movingFolder = row.item">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M5 9l-3 3 3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l-3 3-3-3"/><path d="M19 9l3 3-3 3"/><path d="M2 12h20"/><path d="M12 2v20"/></svg>
                        </button>
                        <button class="icon-btn text-text-muted hover:text-accent" title="Renommer" @click.stop="editingFolder = row.item; editFolderName = row.item.name">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="icon-btn text-text-muted hover:text-danger" title="Supprimer" @click.stop="handleDeleteFolder(row.item.id)">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>

                  <!-- Ligne mot de passe -->
                  <tr v-else class="table-row border-b border-border last:border-0 transition-colors">
                    <td class="px-4 py-2.5">
                      <div class="flex items-center gap-3">
                        <div class="entry-avatar w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
                          <Key :size="16" />
                        </div>
                        <p class="font-medium text-text truncate">{{ row.item.title }}</p>
                      </div>
                    </td>
                    <td class="px-2 py-2.5">
                      <button v-if="row.item.username" class="copy-chip text-xs cursor-pointer px-4 py-2 rounded-md transition-all truncate max-w-full" :class="copiedId === row.item.id+'_user' ? 'copy-chip-copied' : 'copy-chip-default'" @click="copyText(row.item.username, row.item.id+'_user')">
                        <span v-if="copiedId === row.item.id+'_user'">✓ Copié</span>
                        <span v-else>{{ row.item.username }}</span>
                      </button>
                      <span v-else class="px-4 text-border">—</span>
                    </td>
                    <td class="px-2 py-2.5">
                      <button class="copy-chip font-[family-name:var(--font-mono)] text-xs cursor-pointer px-4 py-2 rounded-md transition-all" :class="copiedId === row.item.id+'_pwd' ? 'copy-chip-copied' : 'copy-chip-default'" @click="copyText(row.item.password, row.item.id+'_pwd')">
                        <span v-if="copiedId === row.item.id+'_pwd'">✓ Copié</span>
                        <span v-else>••••••••••</span>
                      </button>
                    </td>
                    <td class="px-2 py-2.5">
                      <button v-if="row.item.url" class="copy-chip text-xs cursor-pointer px-4 py-2 rounded-md transition-all truncate max-w-full" :class="copiedId === row.item.id+'_url' ? 'copy-chip-copied' : 'copy-chip-default'" @click="copyText(row.item.url, row.item.id+'_url')">
                        <span v-if="copiedId === row.item.id+'_url'">✓ Copié</span>
                        <span v-else>{{ row.item.url }}</span>
                      </button>
                      <span v-else class="px-4 text-border">—</span>
                    </td>
                    <td class="px-4 py-2.5">
                      <div class="flex justify-end gap-1">
                        <button class="icon-btn text-text-muted hover:text-accent" title="Déplacer" @click="movingEntry = row.item">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M5 9l-3 3 3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l-3 3-3-3"/><path d="M19 9l3 3-3 3"/><path d="M2 12h20"/><path d="M12 2v20"/></svg>
                        </button>
                        <button class="icon-btn text-text-muted hover:text-accent" title="Modifier" @click="editingEntry = row.item">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="icon-btn text-text-muted hover:text-danger" title="Supprimer" @click="handleDelete(row.item.id)">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>

                </template>
              </tbody>
            </table>
          </div>

          <!-- Spacer : pousse la pagination en bas -->
          <div class="flex-1" />

          <!-- Pagination -->
          <div v-if="!isLoading && allRows.length > 0" class="grid grid-cols-3 items-center px-1 shrink-0">
            <!-- Gauche : total -->
            <span class="text-xs text-text-muted">{{ allRows.length }} élément{{ allRows.length > 1 ? 's' : '' }}</span>
            <!-- Centre : navigation -->
            <div class="flex items-center justify-center gap-2">
              <button
                class="icon-btn text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
                :disabled="currentPage === 1"
                @click="currentPage--"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="m15 18-6-6 6-6"/></svg>
              </button>
              <span class="text-xs text-text-muted tabular-nums">{{ currentPage }} / {{ totalPages }}</span>
              <button
                class="icon-btn text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
                :disabled="currentPage === totalPages"
                @click="currentPage++"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="m9 18 6-6-6-6"/></svg>
              </button>
            </div>
            <!-- Droite : taille de page -->
            <div class="flex items-center justify-end gap-2 text-xs text-text-muted">
              <select
                :value="pageSize"
                class="page-size-select px-2 py-1 rounded text-xs"
                @change="pageSize = Number(($event.target as HTMLSelectElement).value) as 10 | 25 | 50"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
              <span>/ page</span>
            </div>
          </div>
          </div><!-- /wrapper flex-1 tableau+pagination -->

          <!-- Vide (hors du wrapper table, affiché à la place du tableau) -->
          <div v-if="!isLoading && !activeFolderId && currentFolders.length === 0 && filteredEntries.length === 0" class="flex-1 flex flex-col items-center justify-center py-20 rounded-xl border border-dashed border-border text-center">
            <div class="empty-icon w-14 h-14 rounded-2xl flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7 text-text-muted"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <p class="text-text font-medium mb-1">Aucun contenu</p>
            <p class="text-text-muted text-sm">Rien dans <span class="text-text">{{ breadcrumbPath.at(-1)?.name }}</span> pour l'instant.</p>
          </div>

        </template>

      </main>
    </div>

    <!-- Overlay dropdown -->
    <div v-if="showAddMenu" class="fixed inset-0 z-20" @click="showAddMenu = false" />

    <!-- Modale création coffre -->
    <Teleport to="body">
      <div v-if="showCoffreForm" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm" @click="showCoffreForm = false" />
        <div class="coffre-modal relative w-full max-w-sm rounded-2xl p-6 space-y-4">
          <p class="font-semibold text-text text-base">Nouveau coffre</p>
          <div>
            <label class="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">Nom</label>
            <input
              v-model="newCoffreName"
              autofocus
              placeholder="Ex : Travail, Personnel…"
              class="folder-input w-full px-3 py-2.5 rounded-lg text-sm text-text"
              @keyup.enter="confirmAddCoffre"
              @keyup.escape="showCoffreForm = false"
            />
          </div>
          <div class="flex gap-2 pt-1">
            <button class="flex-1 border border-border text-text-muted rounded-lg py-2.5 text-sm hover:text-text transition-colors" @click="showCoffreForm = false">Annuler</button>
            <button class="flex-1 add-btn rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50" :disabled="isSavingCoffre || !newCoffreName.trim()" @click="confirmAddCoffre">
              {{ isSavingCoffre ? 'Création…' : 'Créer' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Modale création dossier -->
    <Teleport to="body">
      <div v-if="showFolderForm" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm" @click="showFolderForm = false" />
        <div class="coffre-modal relative w-full max-w-sm rounded-2xl p-6 space-y-4">
          <p class="font-semibold text-text text-base">Nouveau dossier</p>
          <p class="text-xs text-text-muted -mt-2">Dans : {{ breadcrumbPath.map(p => p.name).join(' / ') }}</p>
          <div>
            <label class="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">Nom</label>
            <input
              v-model="newFolderName"
              autofocus
              placeholder="Ex : RH, Serveurs…"
              class="folder-input w-full px-3 py-2.5 rounded-lg text-sm text-text"
              @keyup.enter="confirmAddFolder"
              @keyup.escape="showFolderForm = false"
            />
          </div>
          <div class="flex gap-2 pt-1">
            <button class="flex-1 border border-border text-text-muted rounded-lg py-2.5 text-sm hover:text-text transition-colors" @click="showFolderForm = false">Annuler</button>
            <button class="flex-1 add-btn rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50" :disabled="isSavingFolder || !newFolderName.trim()" @click="confirmAddFolder">
              {{ isSavingFolder ? 'Création…' : 'Créer' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Modale édition dossier -->
    <Teleport to="body">
      <div v-if="editingFolder" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm" @click="editingFolder = null" />
        <div class="coffre-modal relative w-full max-w-sm rounded-2xl p-6 space-y-4">
          <p class="font-semibold text-text text-base">Renommer le dossier</p>
          <div>
            <label class="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">Nom</label>
            <input
              v-model="editFolderName"
              autofocus
              class="folder-input w-full px-3 py-2.5 rounded-lg text-sm text-text"
              @keyup.enter="confirmEditFolder"
              @keyup.escape="editingFolder = null"
            />
          </div>
          <div class="flex gap-2 pt-1">
            <button class="flex-1 border border-border text-text-muted rounded-lg py-2.5 text-sm hover:text-text transition-colors" @click="editingFolder = null">Annuler</button>
            <button class="flex-1 add-btn rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50" :disabled="isSavingFolderEdit || !editFolderName.trim()" @click="confirmEditFolder">
              {{ isSavingFolderEdit ? 'Enregistrement…' : 'Renommer' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Modale de confirmation suppression -->
    <Teleport to="body">
      <div v-if="confirm" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm" @click="confirm = null" />
        <div class="coffre-modal relative w-full max-w-sm rounded-2xl p-6 space-y-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-danger/10 border border-danger/20 flex items-center justify-center shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 text-danger">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </div>
            <div>
              <p class="font-semibold text-text">Confirmer la suppression</p>
              <p class="text-sm text-text-muted mt-0.5">{{ confirm.message }}</p>
            </div>
          </div>
          <div class="flex gap-2 pt-1">
            <button
              class="flex-1 border border-border text-text-muted rounded-lg py-2.5 text-sm hover:text-text transition-colors"
              @click="confirm = null"
            >Annuler</button>
            <button
              class="flex-1 delete-btn font-medium rounded-lg py-2.5 text-sm disabled:opacity-50"
              :disabled="isConfirming"
              @click="runConfirm"
            >{{ isConfirming ? 'Suppression…' : 'Supprimer' }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <AddEntryModal
      v-if="showAddModal && activeCoffreId"
      :coffres="coffres"
      :folders="folders"
      :default-coffre-id="activeCoffreId"
      :default-folder-id="activeFolderId ?? undefined"
      @close="showAddModal = false"
      @created="loadAll"
    />
    <EditEntryModal
      v-if="editingEntry"
      :entry="editingEntry"
      :folders="folders"
      @close="editingEntry = null"
      @updated="loadAll"
    />
    <MoveModal
      v-if="movingEntry && activeCoffreId"
      :label="movingEntry.title"
      :folders="folders"
      :coffre-id="activeCoffreId"
      :current-folder-id="movingEntry.folderId"
      @move="handleMoveEntry"
      @close="movingEntry = null"
    />
    <MoveModal
      v-if="movingFolder && activeCoffreId"
      :label="movingFolder.name"
      :folders="folders"
      :coffre-id="activeCoffreId"
      :current-folder-id="movingFolder.parentId"
      :exclude-ids="[movingFolder.id, ...getDescendantFolderIds(movingFolder.id)]"
      @move="handleMoveFolder"
      @close="movingFolder = null"
    />
  </div>
</template>

<style scoped>
.vault-header { background: rgba(10,14,18,0.9); backdrop-filter: blur(12px); }
.header-btn { display:flex; align-items:center; gap:0.375rem; padding: 0.375rem 0.625rem; border-radius:0.5rem; transition: background-color 0.15s, color 0.15s; }
.header-btn:hover { background: rgba(255,255,255,0.05); }
.sidebar { background: rgba(12,16,22,0.6); }
.nav-item { text-align: left; transition: background-color 0.15s, color 0.15s; }
.nav-coffre-active { background: rgba(167,139,250,0.12); color: var(--color-accent); }
.nav-folder-active { background: rgba(167,139,250,0.07); color: var(--color-accent); }
.nav-count { background: rgba(255,255,255,0.06); padding: 1px 6px; border-radius: 999px; color: var(--color-text-muted); font-size: 0.7rem; }
.subfolder-chip { background: rgba(18,24,31,0.7); border: 1px solid rgba(31,42,53,0.9); }
.subfolder-chip:hover { background: rgba(167,139,250,0.06); border-color: rgba(167,139,250,0.2); }
.folder-input { background: rgba(10,14,18,0.8); border: 1px solid rgba(167,139,250,0.3); }
.folder-input:focus { outline: none; border-color: rgba(167,139,250,0.5); }
.icon-btn { display:flex; align-items:center; justify-content:center; width:2.25rem; height:2.25rem; border-radius:0.5rem; transition: background-color 0.15s, color 0.15s; }
.icon-btn:hover { background: rgba(255,255,255,0.05); }
.search-input { background: rgba(18,24,31,0.8); border: 1px solid rgba(31,42,53,0.9); }
.search-input::placeholder { color: var(--color-text-muted); opacity: 0.6; }
.search-input:focus { outline: none; border-color: rgba(167,139,250,0.4); box-shadow: 0 0 0 3px rgba(167,139,250,0.07); }
.add-btn { background: linear-gradient(135deg,#A78BFA 0%,#7C3AED 100%); color:white; box-shadow: 0 0 16px rgba(167,139,250,0.2); white-space:nowrap; transition: box-shadow 0.2s, transform 0.2s; }
.add-btn:hover:not(:disabled) { box-shadow: 0 0 24px rgba(167,139,250,0.35); transform: translateY(-1px); }
.add-menu { background: rgba(18,24,31,0.97); border: 1px solid rgba(31,42,53,0.9); box-shadow: 0 8px 32px rgba(0,0,0,0.5); backdrop-filter: blur(12px); }
.add-menu-item { transition: background-color 0.15s; }
.add-menu-item:hover { background: rgba(167,139,250,0.06); }
.menu-icon-wrap { width:2rem; height:2rem; border-radius:0.5rem; display:flex; align-items:center; justify-content:center; background: rgba(167,139,250,0.1); border: 1px solid rgba(167,139,250,0.15); color: var(--color-accent); flex-shrink:0; }
.menu-divider { height:1px; background: rgba(31,42,53,0.8); }
.vault-table { background: rgba(18,24,31,0.7); border: 1px solid rgba(31,42,53,0.9); box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
.table-head { background: rgba(10,14,18,0.5); }
.table-row:hover { background: rgba(167,139,250,0.03); }
.back-row:hover { background: rgba(255,255,255,0.03); }
.folder-row:hover { background: rgba(167,139,250,0.04); }
.folder-avatar { background: rgba(167,139,250,0.08); border: 1px solid rgba(167,139,250,0.15); color: var(--color-accent); }
.entry-avatar { background: linear-gradient(135deg,rgba(167,139,250,0.15),rgba(124,58,237,0.1)); border: 1px solid rgba(167,139,250,0.2); color: var(--color-accent); }
.copy-btn { opacity:0; transition: opacity 0.15s, color 0.15s; }
tr:hover .copy-btn { opacity:1; }
.empty-icon { background: rgba(18,24,31,0.8); border: 1px solid rgba(31,42,53,0.8); }
.coffre-modal { background: rgba(18,24,31,0.97); border: 1px solid rgba(31,42,53,0.9); box-shadow: 0 16px 48px rgba(0,0,0,0.6); backdrop-filter: blur(16px); }
.delete-btn { background: linear-gradient(135deg,#f87171 0%,#dc2626 100%); color:white; box-shadow: 0 0 16px rgba(220,38,38,0.2); transition: box-shadow 0.2s; }
.delete-btn:not(:disabled):hover { box-shadow: 0 0 24px rgba(220,38,38,0.35); }
.copy-chip { border: 1px solid transparent; display: inline-block; }
.copy-chip-default { background: transparent; border-color: transparent; color: var(--color-text-muted); }
.copy-chip-default:hover { background: rgba(167,139,250,0.1); border-color: rgba(167,139,250,0.25); color: var(--color-accent); }
.copy-chip-copied { background: rgba(167,139,250,0.15); border-color: rgba(167,139,250,0.4); color: var(--color-accent); }
.trash-btn { background: rgba(18,24,31,0.8); border: 1px solid rgba(31,42,53,0.9); color: var(--color-text-muted); white-space: nowrap; transition: border-color 0.15s, color 0.15s, background-color 0.15s; }
.trash-btn:hover { border-color: rgba(167,139,250,0.3); color: var(--color-text); background: rgba(167,139,250,0.05); }
.page-size-select {
  background: rgba(18,24,31,0.8);
  border: 1px solid rgba(31,42,53,0.9);
  color: var(--color-text-muted);
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.page-size-select:hover, .page-size-select:focus { border-color: rgba(167,139,250,0.3); color: var(--color-text); }
</style>
