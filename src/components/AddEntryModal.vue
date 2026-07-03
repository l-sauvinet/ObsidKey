<script setup lang="ts">
import { ref } from 'vue'
import Modal from '@/components/ui/Modal.vue'
import PasswordGeneratorModal from '@/components/PasswordGeneratorModal.vue'
import { addEntry, type VaultEntryPlain } from '@/services/vaultEntries'

const props = defineProps<{
  defaultCoffreId: string
  defaultFolderId?: string
}>()

const emit = defineEmits<{ close: []; created: [] }>()

const form = ref<Omit<VaultEntryPlain, 'coffreId' | 'folderId'>>({
  title: '',
  description: '',
  url: '',
  username: '',
  password: '',
})

const isSaving = ref(false)
const errorMessage = ref('')
const showGenerator = ref(false)

function useGeneratedPassword(pwd: string) {
  form.value.password = pwd
  showGenerator.value = false
}

async function handleSubmit() {
  errorMessage.value = ''
  isSaving.value = true
  try {
    await addEntry({
      title: form.value.title,
      password: form.value.password,
      description: form.value.description || undefined,
      url: form.value.url || undefined,
      username: form.value.username || undefined,
      coffreId: props.defaultCoffreId,
      folderId: props.defaultFolderId,
    })
    emit('created')
    emit('close')
  } catch (err) {
    errorMessage.value = "Impossible d'enregistrer l'entrée. Réessaie."
    console.error(err)
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Modal title="Ajouter une entrée" @close="emit('close')">
    <form @submit.prevent="handleSubmit" class="space-y-3">

      <!-- Titre -->
      <div>
        <label for="title" class="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">Titre <span class="text-danger">*</span></label>
        <input id="title" v-model="form.title" required placeholder="Ex : Gmail" class="modal-input w-full px-3 py-2.5 rounded-lg text-sm text-text" />
      </div>

      <!-- Description -->
      <div>
        <label for="description" class="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">Description <span class="normal-case text-text-muted font-normal">(optionnel)</span></label>
        <textarea id="description" v-model="form.description" rows="2" placeholder="Notes, contexte…" class="modal-input w-full px-3 py-2.5 rounded-lg text-sm text-text resize-none" />
      </div>

      <!-- URL -->
      <div>
        <label for="url" class="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">Adresse URL <span class="normal-case text-text-muted font-normal">(optionnel)</span></label>
        <input id="url" v-model="form.url" class="modal-input w-full px-3 py-2.5 rounded-lg text-sm text-text" placeholder="https://…" />
      </div>

      <!-- Identifiant -->
      <div>
        <label for="username" class="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">Identifiant / email <span class="normal-case text-text-muted font-normal">(optionnel)</span></label>
        <input id="username" v-model="form.username" class="modal-input w-full px-3 py-2.5 rounded-lg text-sm text-text" />
      </div>

      <!-- Mot de passe -->
      <div>
        <label for="password" class="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">Mot de passe <span class="text-danger">*</span></label>
        <div class="flex gap-2">
          <input id="password" v-model="form.password" required type="text" class="modal-input flex-1 px-3 py-2.5 rounded-lg text-sm text-text font-[family-name:var(--font-mono)]" />
          <button type="button" class="shrink-0 text-xs text-accent border border-accent-dim rounded-lg px-3 hover:bg-accent/10 transition-colors" @click="showGenerator = true">Générer</button>
        </div>
      </div>

      <p v-if="errorMessage" class="text-danger text-sm">{{ errorMessage }}</p>

      <div class="flex gap-2 pt-1">
        <button type="button" class="flex-1 border border-border text-text-muted rounded-lg py-2.5 text-sm hover:text-text transition-colors" @click="emit('close')">Annuler</button>
        <button type="submit" :disabled="isSaving" class="flex-1 save-btn font-medium rounded-lg py-2.5 text-sm disabled:opacity-50">
          {{ isSaving ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
      </div>
    </form>

    <Teleport to="body">
      <PasswordGeneratorModal
        v-if="showGenerator"
        @use="useGeneratedPassword"
        @close="showGenerator = false"
      />
    </Teleport>
  </Modal>
</template>

<style scoped>
.modal-input {
  background: rgba(10, 14, 18, 0.8);
  border: 1px solid rgba(31, 42, 53, 0.9);
  color: var(--color-text);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.modal-input:focus {
  outline: none;
  border-color: rgba(167, 139, 250, 0.5);
  box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.08);
}
.save-btn {
  background: linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%);
  color: white;
  box-shadow: 0 0 16px rgba(167, 139, 250, 0.2);
  transition: box-shadow 0.2s, opacity 0.2s;
}
.save-btn:not(:disabled):hover { box-shadow: 0 0 24px rgba(167, 139, 250, 0.35); }
</style>
