import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: { port: 5192, fs: { allow: ['..'] } },
  // One copy of Yjs for the runtime's Y.Doc and BlockNote: with two, BlockNote's edits never reach the document.
  resolve: { dedupe: ['react', 'react-dom', 'yjs'] },
  optimizeDeps: { include: ['yjs'] },
  build: { chunkSizeWarningLimit: 8000 }
})
