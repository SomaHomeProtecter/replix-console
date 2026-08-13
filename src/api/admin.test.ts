import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth', () => ({ getToken: vi.fn(async () => 'test-token') }))
vi.mock('../env', () => ({
  env: { apiBaseUrl: 'http://api.test', kcUrl: '', kcRealm: '', kcClientId: '' },
}))

import {
  blindMessage, decideModerationReview, fixSpoilerScore, listActions, listAuthorMessages,
  listModerationReviews, searchUsers,
} from './admin'

describe('moderation reviews — bounded 표본 조회·판정 계약(HP-302)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('조회 상한을 GET 쿼리에 싣는다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      items: [], pendingTotal: 0, counts: {},
    }), { status: 200 }))

    await listModerationReviews(37)

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://api.test/api/v1/admin/moderation-reviews?size=37')
  })

  it('표본 ID를 경로 인코딩하고 판정 하나만 POST한다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      sampleId: '42:M/1', decision: 'FALSE_POSITIVE', counts: {},
    }), { status: 200 }))

    await decideModerationReview('42:M/1', 'FALSE_POSITIVE')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      'http://api.test/api/v1/admin/moderation-reviews/42%3AM%2F1/decision')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ decision: 'FALSE_POSITIVE' })
  })
})

describe('searchUsers — 상세 진입 검색 계약(HP-301)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValue(new Response('{"rows":[]}', { status: 200 }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GET /api/v1/admin/users/search?q={검색어}로 인코딩해 보낸다', async () => {
    await searchUsers('김 운영+test@example.com')

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.pathname).toBe('/api/v1/admin/users/search')
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: '김 운영+test@example.com' })
  })
})

describe('listActions — 전역 조치 로그 필터·커서 계약(HP-299)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValue(new Response('{"items":[],"nextCursor":null,"admins":[]}', {
      status: 200,
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('선택한 필터와 복합 커서를 GET 쿼리에 그대로 싣는다', async () => {
    await listActions({
      adminUserId: 7,
      action: 'SUSPEND',
      from: '2026-08-09T15:00:00.000Z',
      to: '2026-08-12T14:59:59.999Z',
    }, '1786505640000_31')

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.pathname).toBe('/api/v1/admin/actions')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      adminUserId: '7',
      action: 'SUSPEND',
      from: '2026-08-09T15:00:00.000Z',
      to: '2026-08-12T14:59:59.999Z',
      cursor: '1786505640000_31',
      size: '30',
    })
  })

  /**
   * 빈 값은 "전체"라는 뜻이지 값이 빈 필터가 아니다. URL에 키를 남기면 서버의 기본값이나
   * 타입 바인딩보다 빈 문자열 해석이 먼저 개입해, 전체 조회가 400 또는 빈 결과로 바뀔 수 있다.
   */
  it('전체 조회는 빈 필터와 빈 커서를 URL에서 아예 뺀다', async () => {
    await listActions({ adminUserId: '', action: '', from: '', to: '' }, null)

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(Object.fromEntries(url.searchParams)).toEqual({ size: '30' })
  })
})

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

/**
 * `keep`은 BE의 `withKept()`와 짝을 이루는 계약이다 — 상한에 잘려 신고된 줄이 창 밖으로 밀려도
 * 그 줄만은 되끼워 준다. 화면 쪽 테스트는 admin 모듈을 목으로 두므로 "래퍼를 keep과 함께
 * 불렀다"까지만 보고, <b>그게 실제 쿼리스트링이 되는지</b>는 아무도 안 봤다(2026-08-12 독립
 * 리뷰 — 파라미터를 통째로 지워도 192개가 전부 초록이었다).
 */
describe('listAuthorMessages — BE 계약(HP-298)과 같은 경로·파라미터인가', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValue(new Response('{"rows":[],"total":0}', { status: 200 }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GET /api/v1/admin/messages/{ep}/by-author/{userId}?keep={msgId}', async () => {
    await listAuthorMessages(42, 9, '01FIXTUREMSG0000000000000A')

    expect(fetchMock.mock.calls[0][0]).toBe(
        'http://api.test/api/v1/admin/messages/42/by-author/9'
        + '?keep=01FIXTUREMSG0000000000000A')
  })

  it('keep이 없으면 파라미터 자체를 빼고 부른다(BE의 "미지정 = 없음"과 맞춤)', async () => {
    await listAuthorMessages(42, 9)

    expect(fetchMock.mock.calls[0][0]).toBe(
        'http://api.test/api/v1/admin/messages/42/by-author/9')
  })
})
