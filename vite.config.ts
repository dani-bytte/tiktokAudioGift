import { defineConfig } from 'vite'
import path from "path"
import { fileURLToPath } from "node:url"
import { builtinModules } from "node:module"
import os from "node:os"
import tailwindcss from "@tailwindcss/vite"
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const externals = [
  'express',
  'ws',
  'bufferutil',
  'utf-8-validate',
  'electron-store',
  'tiktok-live-connector',
  'music-metadata',
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];


export default defineConfig({
  cacheDir: path.join(os.homedir(), ".cache", "tiktokaudiogift-vite"),
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: externals,
            },
          },
        },
      },
      preload: {
        
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      
      renderer: process.env.NODE_ENV === 'test'
        ? undefined
        : {},
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
