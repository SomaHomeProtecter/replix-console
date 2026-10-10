/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// console.replix.tv/moderation/ 아래에서 돈다(HP-456). 라우터 basename과 환경 전환 복귀 경로는
// src/environment.ts의 MODERATION_BASE_PATH(같은 값)를 따른다 — 공용 틀(shell/app, HP-506)은 base '/'로
// 빌드하므로 BASE_URL에 기대지 않는다. 이 값은 조치만 따로 띄우는 개발 서버의 기준 경로다.
const BASE = '/moderation/'

export default defineConfig(({ command }) => ({
  base: BASE,
  // 자기완결 HTML 한 장으로 빌드한다. ⚠️ 이 플러그인은 빌드 때 base를 './'로 바꾼다 — overrideConfig로
  // base를 되돌린다(2026-09-28 빌드 결과로 확인).
  plugins: [react(), ...(command === 'build' ? [viteSingleFile({ overrideConfig: { base: BASE } })] : [])],
  // 배포물은 운영 콘솔 공용 틀(shell/app, HP-506)이 이 소스를 함께 묶어 docs/에 쓴다. 이 빌드는 조치만 따로
  // 확인하는 용도라 dist/에 쓴다 — 예전처럼 docs/moderation/에 쓰면 공용 틀 배포물을 옛 단독 화면으로 덮어쓴다.
  build: { outDir: 'dist', emptyOutDir: true },
  // 공개 산출물은 커밋된 호스팅 프로필(hosted-env/.env.production)만 읽는다. 루트의 .env.local(개발 서버용)을
  // 빌드가 함께 읽으면 만든 사람의 PC 설정이 공개 번들에 섞이고, 누가 빌드하느냐에 따라 결과가 달라진다
  // (HP-456 코드 리뷰). 셸에서 export한 VITE_* 는 여전히 가장 앞선다 — 빌드 전에 비워 둘 것.
  envDir: command === 'build' ? 'hosted-env' : '.',
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
}))
