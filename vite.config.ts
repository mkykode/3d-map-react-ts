import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5199,
    // fail instead of silently hopping to another port
    strictPort: true,
    // cloudflare tunnel forwards with the public hostname
    allowedHosts: ['5199.monkeykode.com'],
  },
})
