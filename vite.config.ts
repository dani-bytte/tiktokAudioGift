import { defineConfig } from 'vite'
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'


const externals = [
  'express',
  'ws',
  'bufferutil',
  'utf-8-validate',
  'electron-store',
  'tiktok-live-connector',
];


export default defineConfig({
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
