import { defineConfig } from 'vitest/config'

// 저장소 루트에서 세 폴더의 테스트를 한 번에 돈다(HP-524). 각 폴더의 vite.config.ts가 자기 테스트 환경을 정한다 —
// 공용 틀(shell/app), 조치(moderation/app), 시딩(seeding/app). 한 폴더만: npx vitest --project shell|moderation|seeding.
export default defineConfig({
  test: {
    projects: ['shell/app', 'moderation/app', 'seeding/app'],
  },
})
