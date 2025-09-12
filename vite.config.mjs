import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  base: './',
  plugins: [react()],
  root: 'src',
  build: {
    outDir: path.resolve(process.cwd(), 'dist'),
    emptyOutDir: true,
  },
})
