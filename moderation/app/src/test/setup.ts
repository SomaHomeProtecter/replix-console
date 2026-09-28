import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// globals:false라 RTL의 자동 cleanup(전역 afterEach 의존)이 등록되지 않는다 — 직접 등록.
// 빼면 테스트 간 DOM이 누적돼 중복 매치·stale 컨테이너로 오탐이 난다.
afterEach(() => {
  cleanup()
})
