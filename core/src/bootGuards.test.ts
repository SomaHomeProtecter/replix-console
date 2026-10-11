import { describe, expect, it } from 'vitest'
import { isFramed } from './bootGuards'

describe('프레임 안 실행 차단(HP-456)', () => {
  it('최상위 창이면 부팅한다', () => {
    const win = {} as Window
    expect(isFramed({ top: win, self: win })).toBe(false)
  })

  it('다른 페이지의 프레임 안이면 부팅하지 않는다', () => {
    expect(isFramed({ top: {} as Window, self: {} as Window })).toBe(true)
  })

  it('최상위 창을 읽을 수 없으면 프레임 안으로 본다', () => {
    expect(isFramed({ top: null, self: {} as Window })).toBe(true)
  })
})
