import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// vitest가 globals를 켜지 않아 RTL이 테스트 사이 DOM을 스스로 치우지 않는다(조치·공용 틀과 같은 함정).
afterEach(() => cleanup())

// findBy·waitFor의 기본 대기(1초)는 바쁜 머신에서 모자라 결과가 흔들렸다(HP-524 — 세 폴더를 한 번에 돌리면 더 그렇다).
// 기다림만 늘리고 판정은 그대로다.
configure({ asyncUtilTimeout: 5000 })
