/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 콘솔 공용 기반(로그인·연결 환경·PROD 확인·API 호출·시각 표기·디자인 토큰)의 테스트 설정(HP-522).
// 배포물과 개발 서버는 공용 틀(shell/app)이 이 소스를 불러 만든다.
export default defineConfig({
  plugins: [react()],
  test: {
    name: 'core', // 루트 vitest.config.ts의 프로젝트 이름(npx vitest --project core)
    environment: 'jsdom',
    testTimeout: 20_000, // 화면 테스트는 사용자 입력을 흉내 내 느리다 — 바쁜 머신에서 5초 기본값은 흔들린다
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
