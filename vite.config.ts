import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // 5173 est occupé en permanence par Docker Desktop sur cette machine, et 5174/5175 sont
    // réservés au back office (obsidkey_backoffice) — port dédié pour éviter toute collision.
    port: 5180,
    strictPort: true,
  },
})