/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 시딩 화면의 테스트 설정. 배포물과 개발 서버는 운영 콘솔 공용 틀(shell/app, HP-506)이 이 소스를 불러 만든다(HP-521).
export default defineConfig({
  plugins: [react()],
  test: {
    name: 'seeding', // 루트 vitest.config.ts의 프로젝트 이름(npx vitest --project seeding)
    environment: 'jsdom',
    testTimeout: 20_000, // 화면 테스트는 사용자 입력을 흉내 내 느리다 — 바쁜 머신에서 5초 기본값은 흔들린다
    css: false,
    setupFiles: ['./src/test/setup.ts'],
  },
})
