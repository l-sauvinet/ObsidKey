import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useVaultStore } from './stores/vault'
import { installExtensionBridge } from './services/extensionBridge'
import './style.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

await useVaultStore().restoreFromSession()

// Après restoreFromSession : le pont ne doit jamais répondre "locked" à l'extension
// simplement parce que la clé de session n'a pas encore été relue.
installExtensionBridge()

app.use(router)
app.mount('#app')
