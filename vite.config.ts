/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // KC redirect URI가 http://localhost:5173/* 로 등록돼 있다 — 포트가 밀려 5174로 뜨면
  // 로그인이 조용히 깨지므로 차라리 기동을 실패시킨다.
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
