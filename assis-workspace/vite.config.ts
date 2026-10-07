import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
// server.proxy is dev-only: the chat client targets http://127.0.0.1:8789 directly on localhost, so this only matters if VITE_API_ORIGIN is set to the dev origin.
export default defineConfig({base:process.env.VITE_PUBLIC_BASE||'./',plugins:[react(),tailwindcss()],resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},server:{proxy:{'/api':{target:'http://127.0.0.1:8789',changeOrigin:true}}},build:{outDir:'../assis-mvp/workspace',emptyOutDir:true}})
