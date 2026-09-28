/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// console.replix.tv/moderation/ 아래에서 돈다(HP-456). 라우터 basename과 환경 전환 복귀 경로가
// 이 값 하나를 따른다(import.meta.env.BASE_URL). 깊은 주소 복원은 docs/404.html + index.html.
const BASE = '/moderation/'

export default defineConfig(({ command }) => ({
  base: BASE,
  // 시딩 도구(seeding/app)와 같은 방식 — 자기완결 HTML 한 장으로 빌드해 docs/moderation/index.html을
  // 커밋한다. GitHub Pages는 빌드 단계가 없어 커밋한 산출물이 곧 배포물이다. 여러 파일로 나누면 Pages
  // 캐시(max-age=600) 동안 옛 index.html이 이미 지워진 옛 청크를 불러 화면이 깨질 수 있다.
  // ⚠️ 이 플러그인은 빌드 때 base를 './'로 바꾼다 — 그러면 BASE_URL이 './'가 되어 라우터와 환경 전환
  // 복귀 경로가 깨진다. overrideConfig로 base를 되돌린다(2026-09-28 빌드 결과로 확인).
  plugins: [react(), ...(command === 'build' ? [viteSingleFile({ overrideConfig: { base: BASE } })] : [])],
  build: { outDir: '../../docs/moderation', emptyOutDir: true },
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
