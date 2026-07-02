<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '@/services/firebase'
import { unlockWithPassword, logOut } from '@/services/auth'

const router = useRouter()

const masterPassword = ref('')
const isLoading = ref(false)
const errorMessage = ref('')

const userEmail = auth.currentUser?.email ?? ''

async function handleUnlock() {
  errorMessage.value = ''
  isLoading.value = true
  try {
    await unlockWithPassword(masterPassword.value)
    router.push({ name: 'vault' })
  } catch {
    errorMessage.value = 'Mot de passe maître incorrect.'
  } finally {
    isLoading.value = false
  }
}

async function handleLogout() {
  await logOut()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-bg">
    <div class="absolute inset-0 pointer-events-none">
      <div class="glow-orb absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full" />
    </div>
    <div class="grid-overlay absolute inset-0 pointer-events-none" />

    <div class="w-full max-w-md relative z-10">
      <div class="login-card rounded-2xl p-10">
        <!-- Brand -->
        <div class="text-center mb-10">
          <div class="flex justify-center mb-5">
            <div class="logo-icon w-16 h-16 rounded-2xl flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 text-accent">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
          </div>
          <h1 class="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-text">
            Coffre verrouillé
          </h1>
          <p class="text-text-muted text-sm mt-2 leading-relaxed">
            Connecté en tant que <span class="text-text">{{ userEmail }}</span>
          </p>
        </div>

        <form @submit.prevent="handleUnlock" class="space-y-5">
          <div class="space-y-1.5">
            <label for="master-password" class="block text-xs font-medium text-text-muted uppercase tracking-wider">
              Mot de passe
            </label>
            <div class="relative">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="input-icon absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                id="master-password"
                v-model="masterPassword"
                type="password"
                required
                autofocus
                class="login-input w-full pl-9 pr-3 py-2.5 rounded-lg text-text font-[family-name:var(--font-mono)] text-sm transition-all duration-200"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          <div v-if="errorMessage" class="error-box flex items-start gap-2.5 p-3 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-danger mt-0.5 shrink-0">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
            <p class="text-danger text-sm leading-snug">{{ errorMessage }}</p>
          </div>

          <button
            type="submit"
            :disabled="isLoading"
            class="submit-btn w-full font-semibold rounded-lg py-3 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <svg v-if="isLoading" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin w-4 h-4">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span>{{ isLoading ? 'Déverrouillage...' : 'Déverrouiller le coffre' }}</span>
          </button>

          <p class="text-center text-sm text-text-muted pt-1">
            <button type="button" class="mode-link font-medium" @click="handleLogout">
              Se déconnecter
            </button>
          </p>
        </form>

        <div class="flex items-center justify-center gap-2 mt-8 pt-6 border-t border-border text-text-muted text-xs">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
          </svg>
          <span>Clé dérivée localement · Jamais transmise</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.glow-orb {
  background: radial-gradient(circle, rgba(167, 139, 250, 0.08) 0%, transparent 65%);
}

.grid-overlay {
  background-image:
    linear-gradient(rgba(167, 139, 250, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(167, 139, 250, 0.04) 1px, transparent 1px);
  background-size: 44px 44px;
}

.logo-icon {
  background: linear-gradient(135deg, rgba(167, 139, 250, 0.12) 0%, rgba(124, 58, 237, 0.08) 100%);
  border: 1px solid rgba(167, 139, 250, 0.2);
  box-shadow: 0 0 30px rgba(167, 139, 250, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.login-card {
  background: rgba(18, 24, 31, 0.85);
  border: 1px solid rgba(31, 42, 53, 0.9);
  backdrop-filter: blur(16px);
  box-shadow:
    0 0 0 1px rgba(167, 139, 250, 0.04),
    0 24px 64px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.login-input {
  background: rgba(10, 14, 18, 0.8);
  border: 1px solid rgba(31, 42, 53, 0.9);
  color: var(--color-text);
}

.login-input::placeholder {
  color: var(--color-text-muted);
  opacity: 0.6;
}

.login-input:focus {
  outline: none;
  border-color: rgba(167, 139, 250, 0.5);
  box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.08);
}

.input-icon {
  color: var(--color-text-muted);
  opacity: 0.6;
}

.error-box {
  background: rgba(255, 107, 107, 0.07);
  border: 1px solid rgba(255, 107, 107, 0.2);
}

.submit-btn {
  background: linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%);
  color: white;
  box-shadow: 0 0 20px rgba(167, 139, 250, 0.25), 0 4px 12px rgba(0, 0, 0, 0.3);
}

.submit-btn:not(:disabled):hover {
  box-shadow: 0 0 28px rgba(167, 139, 250, 0.4), 0 4px 16px rgba(0, 0, 0, 0.3);
  transform: translateY(-1px);
}

.submit-btn:not(:disabled):active {
  transform: translateY(0);
}

.mode-link {
  color: var(--color-text-muted);
  transition: color 0.15s;
}

.mode-link:hover {
  color: var(--color-danger);
}
</style>
