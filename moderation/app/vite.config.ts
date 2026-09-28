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
      VITE_DEFAULT_ENVIRONMENT: 'DEV',
      VITE_LOCAL_API_BASE_URL: 'http://localhost:8080',
      VITE_LOCAL_KC_URL: 'http://localhost:8081',
      VITE_LOCAL_KC_REALM: 'replix',
      VITE_LOCAL_KC_CLIENT_ID: 'replix-web',
      VITE_LOCAL_EXPECTED_AUDIENCE: 'account',
      VITE_LOCAL_EXPECTED_AZP: 'replix-web',
      VITE_DEV_API_BASE_URL: 'http://api.test',
      VITE_DEV_KC_URL: 'http://kc.test',
      VITE_DEV_KC_REALM: 'replix',
      VITE_DEV_KC_CLIENT_ID: 'replix-web',
      VITE_DEV_EXPECTED_AUDIENCE: 'account',
      VITE_DEV_EXPECTED_AZP: 'replix-web',
      VITE_PROD_API_BASE_URL: 'http://prod-api.test',
      VITE_PROD_KC_URL: 'http://prod-kc.test',
      VITE_PROD_KC_REALM: 'replix',
      VITE_PROD_KC_CLIENT_ID: 'replix-web',
      VITE_PROD_EXPECTED_AUDIENCE: 'account',
      VITE_PROD_EXPECTED_AZP: 'replix-web',
    },
  },
})
