import { defineConfig } from 'vite'

// Even Hub apps are plain Vite web apps. The dev server must bind to
// 0.0.0.0 so the Even App on a phone (QR sideload) or the desktop
// simulator can reach it during development.
export default defineConfig({
  server: { host: '0.0.0.0', port: 5173 },
  preview: { host: '0.0.0.0', port: 4173 },
})
