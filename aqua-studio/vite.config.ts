import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tsconfigPaths from "vite-tsconfig-paths"
import path from "path"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    // @fontsource only exports its package root; the font files are read directly.
    alias: { "@fonts": path.resolve(__dirname, "node_modules/@fontsource") },
  },
  server: { port: 5188 },
})
