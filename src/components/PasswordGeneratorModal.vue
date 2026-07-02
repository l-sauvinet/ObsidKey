<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import Modal from '@/components/ui/Modal.vue'

const emit = defineEmits<{ use: [password: string]; close: [] }>()

const length = ref(20)
const useSpecial = ref(true)
const generated = ref('')

const CHARS_BASE = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
const CHARS_SPECIAL = '!@#$%^&*()_-+='

function generate() {
  const charset = useSpecial.value ? CHARS_BASE + CHARS_SPECIAL : CHARS_BASE
  const values = crypto.getRandomValues(new Uint32Array(length.value))
  generated.value = Array.from(values, n => charset[n % charset.length]).join('')
}

watch([length, useSpecial], generate)
onMounted(generate)
</script>

<template>
  <Modal title="Générateur de mot de passe" @close="emit('close')">
    <div class="space-y-5">

      <!-- Aperçu du mot de passe -->
      <div class="pwd-preview rounded-xl px-4 py-3 font-[family-name:var(--font-mono)] text-sm text-accent break-all select-all leading-relaxed">
        {{ generated }}
      </div>

      <!-- Longueur -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-text-muted uppercase tracking-wider">Longueur</span>
          <span class="text-sm font-semibold text-text tabular-nums">{{ length }}</span>
        </div>
        <input
          v-model.number="length"
          type="range"
          min="8"
          max="64"
          step="1"
          class="range-input w-full"
        />
        <div class="flex justify-between text-xs text-border">
          <span>8</span>
          <span>64</span>
        </div>
      </div>

      <!-- Caractères spéciaux -->
      <div class="flex items-center justify-between py-1">
        <div>
          <p class="text-sm text-text font-medium">Caractères spéciaux</p>
          <p class="text-xs text-text-muted mt-0.5">{{ '!@#$%^&*()_-+=' }}</p>
        </div>
        <button
          type="button"
          class="toggle shrink-0"
          :class="useSpecial ? 'toggle-on' : 'toggle-off'"
          @click="useSpecial = !useSpecial"
          :aria-pressed="useSpecial"
        >
          <span class="toggle-thumb" :style="{ left: useSpecial ? '1.375rem' : '0.25rem' }" />
        </button>
      </div>

      <!-- Actions -->
      <div class="flex gap-2 pt-1">
        <button
          type="button"
          class="regen-btn flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium"
          @click="generate"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
          Régénérer
        </button>
        <button
          type="button"
          class="use-btn flex-1 py-2.5 rounded-lg text-sm font-semibold"
          @click="emit('use', generated)"
        >
          Utiliser ce mot de passe
        </button>
      </div>

    </div>
  </Modal>
</template>

<style scoped>
.pwd-preview {
  background: rgba(10, 14, 18, 0.8);
  border: 1px solid rgba(167, 139, 250, 0.2);
  min-height: 3.5rem;
  letter-spacing: 0.03em;
}

.range-input {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  background: rgba(31, 42, 53, 0.9);
  border-radius: 999px;
  outline: none;
  cursor: pointer;
}
.range-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #A78BFA;
  box-shadow: 0 0 8px rgba(167, 139, 250, 0.5);
  cursor: pointer;
  transition: box-shadow 0.15s;
}
.range-input::-webkit-slider-thumb:hover {
  box-shadow: 0 0 14px rgba(167, 139, 250, 0.7);
}
.range-input::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #A78BFA;
  border: none;
  box-shadow: 0 0 8px rgba(167, 139, 250, 0.5);
  cursor: pointer;
}

.toggle {
  width: 2.75rem;
  height: 1.5rem;
  border-radius: 999px;
  position: relative;
  transition: background-color 0.2s;
  flex-shrink: 0;
}
.toggle-on  { background: rgba(167, 139, 250, 0.8); }
.toggle-off { background: rgba(31, 42, 53, 0.9); }
.toggle-thumb {
  display: block;
  width: 1.125rem;
  height: 1.125rem;
  border-radius: 50%;
  background: white;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  transition: left 0.2s;
}

.regen-btn {
  background: rgba(18, 24, 31, 0.8);
  border: 1px solid rgba(31, 42, 53, 0.9);
  color: var(--color-text-muted);
  transition: border-color 0.15s, color 0.15s;
}
.regen-btn:hover { border-color: rgba(167, 139, 250, 0.3); color: var(--color-text); }

.use-btn {
  background: linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%);
  color: white;
  box-shadow: 0 0 16px rgba(167, 139, 250, 0.2);
  transition: box-shadow 0.2s;
}
.use-btn:hover { box-shadow: 0 0 24px rgba(167, 139, 250, 0.35); }
</style>
