import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// globals:false라 RTL의 자동 cleanup(전역 afterEach 의존)이 등록되지 않는다 — 직접 등록.
// 빼면 테스트 간 DOM이 누적돼 중복 매치·stale 컨테이너로 오탐이 난다.
afterEach(() => {
  cleanup()
})

// findBy·waitFor의 기본 대기(1초)는 바쁜 머신에서 모자라 결과가 흔들렸다(HP-524 — 세 폴더를 한 번에 돌리면 더 그렇다).
// 기다림만 늘리고 판정은 그대로다.
configure({ asyncUtilTimeout: 5000 })
