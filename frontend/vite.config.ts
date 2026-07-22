import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/enroll': 'http://127.0.0.1:8000',
      '/recognize': 'http://127.0.0.1:8000',
      '/preview': 'http://127.0.0.1:8000',
      '/identities': 'http://127.0.0.1:8000',
      '/logs': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
      '/media': 'http://127.0.0.1:8000',
      '/docs': 'http://127.0.0.1:8000',
    },
  },
})
