import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth', () => ({ getToken: vi.fn(async () => 'test-token') }))
vi.mock('../env', () => ({
  env: { apiBaseUrl: 'http://api.test', kcUrl: '', kcRealm: '', kcClientId: '' },
}))

import { blindMessage, fixSpoilerScore } from './admin'

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

/**
 * 취소(HP-298)는 <b>signal이 실제 요청까지 닿아야</b> 성립한다. 화면 쪽 테스트는 admin 모듈을
 * 목으로 두므로 "래퍼를 signal과 함께 불렀다"까지만 보고, 래퍼가 그걸 fetch에 넘기는지는
 * 아무도 안 본다 — 여기서 끊기면 취소 버튼은 눌려도 요청이 안 끊겨 화면이 갇힌 채 남는다.
 */
describe('blindMessage — 취소 signal이 요청까지 닿는가', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('넘겨준 signal이 끊기면 요청도 끊긴다', async () => {
    // 실물 fetch처럼 — 이미 끊긴 signal로 부르면 곧바로 거절한다. 리스너만 달면 abort가
    // fetch 호출보다 먼저 도착했을 때 영영 매달려, 없는 교착을 재현하게 된다.
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_ok, fail) => {
      const abort = () => fail(new DOMException('aborted', 'AbortError'))
      if (init.signal?.aborted) abort()
      else init.signal?.addEventListener('abort', abort, { once: true })
    }))
    const caller = new AbortController()

    const settled = blindMessage(42, 'M-1', caller.signal).catch((e: unknown) => e)
    await Promise.resolve()
    caller.abort()

    expect((await settled as DOMException).name).toBe('AbortError')
  })

  it('POST /api/v1/admin/messages/{ep}/{msgId}/blind 로 간다', async () => {
    fetchMock.mockResolvedValue(new Response('{"blinded":true}', { status: 200 }))

    await blindMessage(42, 'M-1')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://api.test/api/v1/admin/messages/42/M-1/blind')
    expect(init.method).toBe('POST')
  })
})
