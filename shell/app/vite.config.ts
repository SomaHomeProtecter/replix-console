/// <reference types="vitest/config" />
import { existsSync } from 'node:fs'
import { copyFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 운영 콘솔 공용 틀(HP-506). 이 틀이 로그인·환경·화면 틀·홈을 맡고, 시딩(seeding/app/src)과 조치(moderation/app/src)
// 소스를 그대로 불러 자기완결 HTML 한 장으로 빌드한다. GitHub Pages는 빌드 단계가 없어 docs/에 커밋한 산출물이
// 곧 배포물이다(main 머지 = 배포).
const ROOT = fileURLToPath(new URL('.', import.meta.url))
const REPO = fileURLToPath(new URL('../..', import.meta.url))
const DOCS = fileURLToPath(new URL('../../docs', import.meta.url))

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

/**
 * 옛 폴더별 설치(shell/app·moderation/app·seeding/app·core의 node_modules)가 남아 있으면 배포 빌드를 멈춘다.
 *
 * <p>의존성을 루트 한 벌로 합치기 전(HP-524)에는 폴더마다 npm install을 했다. 그 폴더가 gitignore된 채 남은 클론에서
 * 루트 빌드를 돌리면 소스마다 가까운 node_modules를 불러와 라이브러리가 두 벌 번들된다 — React가 두 벌이면 첫 훅에서
 * 콘솔이 통째로 멈추는데, 빌드·타입 검사·테스트는 모두 통과해 docs/에 그대로 커밋될 수 있다(2026-10-12 리뷰 재현).
 * dedupe가 React 계열은 한 벌로 모으지만, 그 밖의 라이브러리까지 막으려면 원인을 지우는 편이 확실하다.
 */
function singleInstallOnly(): Plugin {
  return {
    name: 'replix-console:single-install-only',
    apply: 'build',
    buildStart() {
      const stale = ['shell/app', 'moderation/app', 'seeding/app', 'core']
        .filter((dir) => existsSync(`${REPO}${dir}/node_modules`))
      if (stale.length) {
        this.error(`옛 폴더별 node_modules가 남아 있습니다: ${stale.join(', ')} — 의존성은 저장소 루트 한 벌입니다(HP-524). `
          + `그 폴더의 node_modules를 지우고 루트에서 npm ci 뒤 다시 빌드하세요. 그대로 빌드하면 라이브러리가 두 벌 실려 콘솔이 멈출 수 있습니다.`)
      }
    },
  }
}

export default defineConfig(({ command }) => ({
  // 의존성은 저장소 루트에 한 벌이고(HP-524) 명령도 루트에서 돈다(npm run dev·build) — 이 폴더를 앱 뿌리로 못박는다.
  root: ROOT,
  base: '/',
  // ⚠️ 싱글파일 플러그인은 base를 './'로 바꾼다 — 경로마다 같은 파일을 두므로 '/'로 되돌린다.
  plugins: [
    react(),
    tailwindcss(),
    ...(command === 'build' ? [singleInstallOnly(), viteSingleFile({ overrideConfig: { base: '/' } }), copyToToolPaths()] : []),
  ],
  // 담당 폴더(HP-456 D3)는 그대로 두고 소스만 불러온다 — 시딩 = 조현빈, 조치 = 김지호.
  // dedupe: 의존성은 루트 한 벌이지만(HP-524) 옛 폴더별 node_modules가 남은 클론에서는 소스마다 다른 React를 불러와
  // 훅이 깨진다. 설치가 한 벌이면 아무 일도 하지 않으므로 안전장치로 둔다(singleInstallOnly와 짝).
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router', 'keycloak-js'],
    alias: { '@core': `${REPO}core/src`, '@seeding': `${REPO}seeding/app/src`, '@moderation': `${REPO}moderation/app/src` },
  },
  // 연결 환경 값(API·Keycloak 주소)은 공용 기반의 호스팅 프로필(core/hosted-env)이 정본이다. 개발 서버는 이 폴더의 .env.local.
  envDir: command === 'build' ? `${REPO}core/hosted-env` : '.',
  // 5173 = Keycloak replix-web에 등록된 개발 서버 주소(조치 개발 서버와 같은 자리). 포트가 밀리면 로그인이 조용히
  // 깨지므로 차라리 기동을 실패시킨다. 시딩·조치 소스가 이 폴더 밖에 있어 저장소 전체를 열어 둔다.
  server: { port: 5173, strictPort: true, fs: { allow: [REPO] } },
  // docs/에는 CNAME·404.html·도구별 보조 파일이 함께 있다 — 비우지 않는다.
  build: { outDir: DOCS, emptyOutDir: false },
  test: {
    name: 'shell', // 루트 vitest.config.ts의 프로젝트 이름(npx vitest --project shell)
    environment: 'jsdom',
    testTimeout: 20_000, // 화면 테스트는 사용자 입력을 흉내 내 느리다 — 바쁜 머신에서 5초 기본값은 흔들린다
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
