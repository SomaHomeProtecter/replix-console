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
    // env.ts가 부트스트랩에서 누락을 throw 하므로(모듈 평가 시점) 테스트 전역에 채워 둔다.
    env: {
      VITE_API_BASE_URL: 'http://api.test',
      VITE_KC_URL: 'http://kc.test',
      VITE_KC_REALM: 'replix',
      VITE_KC_CLIENT_ID: 'replix-web',
    },
  },
})
