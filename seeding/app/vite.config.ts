import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/* 작품 탐색(catalog/app)과 같은 방식 — 자기완결 HTML 한 장으로 빌드해 docs/seeding/index.html 로 커밋한다.
   GitHub Pages 는 빌드 단계가 없으므로 커밋된 산출물이 곧 배포물이다(레포 README '배포 구조'). */
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  server: { port: 5175, strictPort: true }, // Keycloak redirect URI 등록과 맞춘다(로컬 시험용)
  build: {
    outDir: '../../docs/seeding',
    emptyOutDir: false, // silent-check-sso.html 을 지우지 않는다
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
  },
})
