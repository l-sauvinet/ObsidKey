import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useVaultStore } from './stores/vault'
import './style.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

await useVaultStore().restoreFromSession()

app.use(router)
app.mount('#app')
