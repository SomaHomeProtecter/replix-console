import { describe, expect, it } from 'vitest'
import { BOOT_ERROR_KEY, bootFailureCause, isFramed, routerBasename } from './bootGuards'

describe('부팅 실패 원인(HP-456)', () => {
  // 싱글파일 빌드는 동적 import까지 즉시 평가한다. env.ts가 모듈 평가 중 던진 진짜 원인은 catch에 닿지 않고,
  // 이어서 boot()가 초기화 전 변수를 건드려 ReferenceError로 실패한다(2026-09-28 빌드 결과 실측).
  it('index.html이 남긴 첫 예외를 catch한 예외보다 앞세운다', () => {
    const cause = new Error('지원하지 않는 콘솔 환경입니다: STAGING')
    const win = { [BOOT_ERROR_KEY]: cause }
    expect(bootFailureCause(win, new ReferenceError("Cannot access 'Ly' before initialization")))
        .toBe(cause)
  })

  it('남긴 예외가 없으면 catch한 예외를 그대로 쓴다', () => {
    const caught = new Error('Keycloak 초기화 실패')
    expect(bootFailureCause({}, caught)).toBe(caught)
  })
})

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

describe('라우터 basename(HP-456)', () => {
  it('배포 경로에서 끝 슬래시를 뗀다', () => {
    expect(routerBasename('/moderation/')).toBe('/moderation')
  })

  it('루트에서 돌면 basename이 없다', () => {
    expect(routerBasename('/')).toBe('')
  })
})
