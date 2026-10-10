import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/* 배포물은 운영 콘솔 공용 틀(shell/app, HP-506)이 이 소스를 함께 묶어 docs/에 쓴다. 이 빌드는 시딩만 따로
   확인하는 용도라 dist/에 쓴다 — 예전처럼 docs/seeding/에 쓰면 공용 틀 배포물을 옛 단독 화면으로 덮어쓴다. */
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  server: { port: 5175, strictPort: true }, // Keycloak redirect URI 등록과 맞춘다(로컬 시험용)
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
  },
})
