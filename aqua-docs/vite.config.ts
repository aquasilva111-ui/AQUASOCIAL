import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
  // Uma única cópia do Yjs: sem isso o pré-empacotamento embute outra dentro do chunk do BlockNote e
  // as edições do editor nunca chegam ao Y.Doc ("Unexpected content type in insert operation").
  resolve: {dedupe: ['yjs']},
  optimizeDeps: {include: ['yjs']},
})
