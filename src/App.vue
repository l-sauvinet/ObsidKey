<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useVaultStore } from '@/stores/vault'

const vault = useVaultStore()
const router = useRouter()

let timer: ReturnType<typeof setInterval>

onMounted(() => {
  // Vérifie toutes les minutes si les 4h sont écoulées
  timer = setInterval(() => {
    if (vault.isUnlocked) {
      vault.checkTimeout()
      if (!vault.isUnlocked) {
        router.push({ name: 'unlock' })
      }
    }
  }, 60_000)
})

onUnmounted(() => clearInterval(timer))
</script>

<template>
  <router-view />
</template>
