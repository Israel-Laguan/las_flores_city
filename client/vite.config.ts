import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, '../shared'),
      '@las-flores/ui': resolve(__dirname, '../ui/src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
      '/comms': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    chunkFileNames: 'assets/js/[name]-[hash].js',
    entryFileNames: 'assets/js/[name]-[hash].js',
    assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
  esbuild: mode === 'production'
    ? { drop: ['console', 'debugger'], legalComments: 'none' }
    : {},
}))
