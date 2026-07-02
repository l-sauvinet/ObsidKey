<script setup lang="ts">
import { ref, computed } from 'vue'
import Modal from '@/components/ui/Modal.vue'
import type { VaultFolder } from '@/services/vaultFolders'

const props = defineProps<{
  label: string
  folders: VaultFolder[]
  coffreId: string
  currentFolderId?: string
  excludeIds?: string[]
}>()

const emit = defineEmits<{ move: [targetFolderId: string | null]; close: [] }>()

const selected = ref<string | null>(props.currentFolderId ?? null)

type FolderNode = VaultFolder & { depth: number }

const tree = computed((): FolderNode[] => {
  const excluded = new Set(props.excludeIds ?? [])
  const eligible = props.folders.filter(f => f.coffreId === props.coffreId && !excluded.has(f.id))
  function build(parentId: string | undefined, depth: number): FolderNode[] {
    return eligible
      .filter(f => f.parentId === parentId)
      .flatMap(f => [{ ...f, depth }, ...build(f.id, depth + 1)])
  }
  return build(undefined, 0)
})

const isCurrentLocation = computed(() =>
  selected.value === (props.currentFolderId ?? null),
)
</script>

<template>
  <Modal :title="`Déplacer « ${label} »`" @close="emit('close')">
    <div class="space-y-3">

      <p class="text-xs text-text-muted">Choisir la destination :</p>

      <!-- Liste de destination -->
      <div class="tree-list rounded-xl overflow-hidden divide-y divide-border">

        <!-- Racine -->
        <button
          type="button"
          class="tree-item w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors"
          :class="selected === null ? 'tree-item-selected' : ''"
          @click="selected = null"
        >
          <div class="tree-icon w-6 h-6 rounded flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5">
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
          </div>
          <span class="font-medium" :class="selected === null ? 'text-accent' : 'text-text'">Racine du coffre</span>
          <svg v-if="selected === null" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-accent ml-auto shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
        </button>

        <!-- Dossiers -->
        <button
          v-for="folder in tree"
          :key="folder.id"
          type="button"
          class="tree-item w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors"
          :class="selected === folder.id ? 'tree-item-selected' : ''"
          :style="{ paddingLeft: `${1 + folder.depth * 1.25}rem` }"
          @click="selected = folder.id"
        >
          <div class="tree-icon w-6 h-6 rounded flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5">
              <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
            </svg>
          </div>
          <span :class="selected === folder.id ? 'text-accent font-medium' : 'text-text'">{{ folder.name }}</span>
          <svg v-if="selected === folder.id" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-accent ml-auto shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
        </button>

        <p v-if="tree.length === 0" class="px-4 py-3 text-sm text-text-muted">Aucun dossier dans ce coffre</p>
      </div>

      <!-- Actions -->
      <div class="flex gap-2 pt-1">
        <button type="button" class="flex-1 border border-border text-text-muted rounded-lg py-2.5 text-sm hover:text-text transition-colors" @click="emit('close')">Annuler</button>
        <button
          type="button"
          class="move-btn flex-1 py-2.5 rounded-lg text-sm font-semibold"
          :disabled="isCurrentLocation"
          @click="emit('move', selected)"
        >
          {{ isCurrentLocation ? 'Déjà ici' : 'Déplacer ici' }}
        </button>
      </div>

    </div>
  </Modal>
</template>

<style scoped>
.tree-list {
  background: rgba(10, 14, 18, 0.6);
  border: 1px solid rgba(31, 42, 53, 0.9);
  max-height: 320px;
  overflow-y: auto;
}
.tree-item { background: transparent; }
.tree-item:hover { background: rgba(167,139,250,0.05); }
.tree-item-selected { background: rgba(167,139,250,0.08); }
.tree-icon { background: rgba(167,139,250,0.08); color: var(--color-accent); }
.move-btn {
  background: linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%);
  color: white;
  box-shadow: 0 0 16px rgba(167,139,250,0.2);
  transition: box-shadow 0.2s, opacity 0.2s;
}
.move-btn:not(:disabled):hover { box-shadow: 0 0 24px rgba(167,139,250,0.35); }
.move-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
