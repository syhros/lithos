import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'exclude-api-folder',
      resolveId(id) {
        if (id.startsWith('/api/') || id.includes('api/live') || id.includes('api/history')) {
          return { id, external: true };
        }
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  optimizeDeps: {
    entries: ['index.tsx', 'src/**/*.tsx', 'src/**/*.ts'],
    exclude: ['yahoo-finance2', '@vercel/node'],
  },
  build: {
    rollupOptions: {
      external: ['yahoo-finance2', '@vercel/node'],
    },
  },
})
