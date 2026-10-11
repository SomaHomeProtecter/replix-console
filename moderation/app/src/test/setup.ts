import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { realmRoles } from '@core/auth'

// globals:false라 RTL의 자동 cleanup(전역 afterEach 의존)이 등록되지 않는다 — 직접 등록.
// 빼면 테스트 간 DOM이 누적돼 중복 매치·stale 컨테이너로 오탐이 난다.
afterEach(() => {
  cleanup()
})

// findBy·waitFor의 기본 대기(1초)는 바쁜 머신에서 모자라 결과가 흔들렸다(HP-524 — 세 폴더를 한 번에 돌리면 더 그렇다).
// 기다림만 늘리고 판정은 그대로다.
configure({ asyncUtilTimeout: 5000 })

// 화면 테스트의 기본 사용자는 admin이다 — 버튼이 역할을 보게 되면서(HP-529) 토큰 없는 테스트에서는 모든 조치가 꺼진다.
// 다른 역할은 테스트에서 vi.mocked(realmRoles).mockReturnValue([...])로 바꾼다. 나머지 auth 함수는 그대로 둔다.
vi.mock('@core/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@core/auth')>()),
  realmRoles: vi.fn(() => ['admin']),
}))
// 테스트마다 admin으로 되돌린다 — clearAllMocks만 쓰는 파일에서는 앞 테스트가 바꾼 역할이 뒤 테스트로 새기 때문이다.
beforeEach(() => {
  vi.mocked(realmRoles).mockImplementation(() => ['admin'])
})
