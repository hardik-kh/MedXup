import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  build: {
    outDir: 'dist',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/analyze': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/analyze-stream': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/voice-llm': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/stats': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/save-report': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/submit-feedback': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
