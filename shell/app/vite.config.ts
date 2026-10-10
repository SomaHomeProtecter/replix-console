/// <reference types="vitest/config" />
import { copyFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 운영 콘솔 공용 틀(HP-506). 이 틀이 로그인·환경·화면 틀·홈을 맡고, 시딩(seeding/app/src)과 조치(moderation/app/src)
// 소스를 그대로 불러 자기완결 HTML 한 장으로 빌드한다. GitHub Pages는 빌드 단계가 없어 docs/에 커밋한 산출물이
// 곧 배포물이다(main 머지 = 배포).
const REPO = fileURLToPath(new URL('../..', import.meta.url))
const DOCS = fileURLToPath(new URL('../../docs', import.meta.url))
const MODERATION = fileURLToPath(new URL('../../moderation/app', import.meta.url))

/**
 * 같은 한 장을 도구 경로에도 둔다. 북마크·직접 입력한 /seeding/, /moderation/ 주소가 이 파일로 바로 열리고,
 * 조치의 깊은 주소(/moderation/prod/users/42)는 docs/404.html이 /moderation/?p= 로 넘겨 앱이 되살린다(HP-456).
 */
function copyToToolPaths(): Plugin {
  return {
    name: 'replix-console:copy-to-tool-paths',
    apply: 'build',
    async closeBundle() {
      for (const tool of ['seeding', 'moderation']) {
        await mkdir(`${DOCS}/${tool}`, { recursive: true })
        await copyFile(`${DOCS}/index.html`, `${DOCS}/${tool}/index.html`)
      }
    },
  }
}

export default defineConfig(({ command }) => ({
  base: '/',
  // ⚠️ 싱글파일 플러그인은 base를 './'로 바꾼다 — 경로마다 같은 파일을 두므로 '/'로 되돌린다.
  plugins: [
    react(),
    tailwindcss(),
    ...(command === 'build' ? [viteSingleFile({ overrideConfig: { base: '/' } }), copyToToolPaths()] : []),
  ],
  // 시딩·조치 소스는 각자 node_modules를 갖고 있다. 그 파일들이 자기 폴더의 React를 따로 불러오면 훅이 깨지므로
  // 이 틀의 것 하나로 모은다(tsconfig.json paths와 짝).
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router', 'keycloak-js'],
    // 담당 폴더(HP-456 D3)는 그대로 두고 소스만 불러온다 — 시딩 = 조현빈, 조치 = 김지호.
    alias: { '@seeding': `${REPO}seeding/app/src`, '@moderation': `${REPO}moderation/app/src` },
  },
  // 연결 환경 값(API·Keycloak 주소)은 조치 콘솔의 호스팅 프로필이 정본이다. 개발 서버는 이 폴더의 .env.local.
  envDir: command === 'build' ? `${MODERATION}/hosted-env` : '.',
  // 5173 = Keycloak replix-web에 등록된 개발 서버 주소(조치 개발 서버와 같은 자리). 포트가 밀리면 로그인이 조용히
  // 깨지므로 차라리 기동을 실패시킨다. 시딩·조치 소스가 이 폴더 밖에 있어 저장소 전체를 열어 둔다.
  server: { port: 5173, strictPort: true, fs: { allow: [REPO] } },
  // docs/에는 CNAME·404.html·도구별 보조 파일이 함께 있다 — 비우지 않는다.
  build: { outDir: DOCS, emptyOutDir: false },
  test: {
    environment: 'jsdom',
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
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
