import { createRouter, createWebHistory } from 'vue-router'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/services/firebase'
import { useVaultStore } from '@/stores/vault'

const routes = [
  {
    path: '/',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/unlock',
    name: 'unlock',
    component: () => import('@/views/UnlockView.vue'),
    meta: { requiresAuth: true, requiresKey: false },
  },
  {
    path: '/vault',
    name: 'vault',
    component: () => import('@/views/VaultView.vue'),
    meta: { requiresAuth: true, requiresKey: true },
  },
  {
    path: '/trash',
    name: 'trash',
    component: () => import('@/views/TrashView.vue'),
    meta: { requiresAuth: true, requiresKey: true },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, _from, next) => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    unsubscribe()
    const authed = !!user
    const unlocked = useVaultStore().isUnlocked

    if (!authed) {
      // Non connecté → uniquement /login
      return to.name === 'login' ? next() : next({ name: 'login' })
    }

    if (!unlocked) {
      // Connecté mais coffre verrouillé → /unlock ou /login uniquement
      return to.name === 'unlock' || to.name === 'login' ? next() : next({ name: 'unlock' })
    }

    // Connecté et déverrouillé → redirige login/unlock vers vault
    if (to.name === 'login' || to.name === 'unlock') {
      return next({ name: 'vault' })
    }

    next()
  })
})

export default router
