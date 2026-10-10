import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// vitest가 globals를 켜지 않아 RTL이 테스트 사이 DOM을 스스로 치우지 않는다(조치 콘솔과 같은 함정).
afterEach(() => cleanup())
