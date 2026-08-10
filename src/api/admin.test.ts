import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth', () => ({ getToken: vi.fn(async () => 'test-token') }))
vi.mock('../env', () => ({
  env: { apiBaseUrl: 'http://api.test', kcUrl: '', kcRealm: '', kcClientId: '' },
}))

import { fixSpoilerScore } from './admin'

/**
 * 계약 테스트 — 콘솔이 만드는 요청이 BE가 받는 것과 <b>문자열 단위로</b> 같은지 고정한다.
 *
 * <p>이 자리가 비어 있으면 사슬에 구멍이 남는다: BE 쪽은 `AdminMessageControllerIT`가 같은 경로·본문으로
 * 왕복을 검증하고 화면 쪽은 목으로 래퍼 호출을 검증하는데, <b>둘이 서로 다른 문자열을 말해도</b>
 * 양쪽 다 초록일 수 있다. 여기서 실제 fetch 인자를 본다.
 *
 * <p>`api/types.ts`가 BE DTO를 손으로 베끼는 구조라(레포 주석) 이런 어긋남이 실제로 가능하다.
 */
describe('fixSpoilerScore — BE 계약(HP-226/294)과 같은 경로·본문인가', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('PATCH /api/v1/admin/messages/{ep}/{msgId}/spoiler-score 에 {score}만 싣는다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ spoilerScore: 3 }), { status: 200 }))

    const result = await fixSpoilerScore(42, '01FIXTUREMSG0000000000000A', 3)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://api.test/api/v1/admin/messages/42/01FIXTUREMSG0000000000000A/spoiler-score')
    expect(init.method).toBe('PATCH')
    // 정정 전 점수는 싣지 않는다 — 서버가 직접 읽는다(HP-294 B′). 여기 넣으면 화면이 낡았을 때
    // 틀린 값이 감사 로그에 박힌다.
    expect(JSON.parse(init.body as string)).toEqual({ score: 3 })
    expect(result).toEqual({ spoilerScore: 3 })
  })
})
