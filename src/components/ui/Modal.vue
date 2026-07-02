<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center px-4">
      <!-- Overlay -->
      <div class="absolute inset-0 bg-black/60" @click="emit('close')" />

      <!-- Contenu -->
      <div class="relative bg-surface border border-border rounded-xl w-full max-w-md p-6 shadow-xl">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-[family-name:var(--font-display)] text-lg text-text">{{ title }}</h2>
          <button
            class="text-text-muted hover:text-text transition-colors"
            aria-label="Fermer"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>
        <slot />
      </div>
    </div>
  </Teleport>
</template>