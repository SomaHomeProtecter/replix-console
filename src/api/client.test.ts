import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth', () => ({ getToken: vi.fn(async () => 'test-token') }))

import { getToken } from '../auth'
vi.mock('../env', () => ({
  env: { apiBaseUrl: 'http://api.test', kcUrl: '', kcRealm: '', kcClientId: '' },
}))

import { API_TIMEOUT_MS, ApiHttpError, apiFetch, qs } from './client'

describe('apiFetch', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('토큰과 base URL을 붙여 호출하고 JSON을 돌려준다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const body = await apiFetch<{ ok: boolean }>('/api/v1/admin/reports')

    expect(body).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://api.test/api/v1/admin/reports')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token')
  })

  it('body가 있으면 Content-Type을 JSON으로 보낸다', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))

    await apiFetch('/x', { method: 'POST', body: JSON.stringify({ a: 1 }) })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('BE ApiError 본문(code·message)을 ApiHttpError로 옮긴다', async () => {
    fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ code: 'REPORT_NOT_FOUND', message: '신고를 찾을 수 없습니다' }),
        { status: 404 }))

    const error = await apiFetch('/x').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiHttpError)
    expect((error as ApiHttpError).status).toBe(404)
    expect((error as ApiHttpError).code).toBe('REPORT_NOT_FOUND')
    expect((error as ApiHttpError).message).toBe('신고를 찾을 수 없습니다')
  })

  it('본문 없는 403은 권한 안내로 폴백한다(DoD — 서버 판정 표면화)', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }))

    const error = await apiFetch('/x').catch((e: unknown) => e)

    expect((error as ApiHttpError).status).toBe(403)
    expect((error as ApiHttpError).message).toContain('권한')
  })
})

describe('qs', () => {
  it('빈 값(null·undefined·빈 문자열)은 빼고 조립한다', () => {
    expect(qs({ status: 'OPEN', reason: '', cursor: null, size: 20 })).toBe('?status=OPEN&size=20')
  })

  it('전부 비면 빈 문자열', () => {
    expect(qs({ a: null, b: undefined, c: '' })).toBe('')
  })
})

describe('apiFetch 타임아웃(HP-298)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  /**
   * 실제 fetch처럼 — signal이 끊기면 AbortError로 거절하고, 그 전에는 영영 매달린다.
   * <b>이미</b> 끊긴 signal로 부르면 곧바로 거절하는 것까지 흉내 낸다(실물이 그렇다).
   */
  function hangingFetch() {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_ok, fail) => {
      const abort = () => fail(new DOMException('aborted', 'AbortError'))
      if (init.signal?.aborted) abort()
      else init.signal?.addEventListener('abort', abort, { once: true })
    }))
  }

  /**
   * 값 자체를 못박는다. 아래 테스트들은 <b>`API_TIMEOUT_MS`만큼</b> 시계를 돌려 타임아웃을
   * 확인하므로, 상한을 15초에서 15000초로 바꿔도 전부 통과한다 — 검증 대상을 테스트가 스스로
   * 공급하는 꼴이다(2026-08-12 독립 리뷰). 잠금 안전성 논증 전체가 "사람이 견딜 만한 시간"에
   * 걸려 있으므로 숫자를 한 번은 직접 본다.
   */
  it('상한은 15초다 — 사람이 화면 앞에서 견디는 구간', () => {
    expect(API_TIMEOUT_MS).toBe(15_000)
  })

  it('응답이 없으면 정해진 시간 뒤 끊고 TIMEOUT으로 알린다', async () => {
    hangingFetch()

    const settled = apiFetch('/x').catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS)
    const error = await settled

    expect(error).toBeInstanceOf(ApiHttpError)
    expect((error as ApiHttpError).code).toBe('TIMEOUT')
    expect((error as ApiHttpError).status).toBe(0)
  })

  it('시간 전에는 끊지 않는다 — 느린 요청을 성급히 죽이지 않는다', async () => {
    hangingFetch()

    const settled = apiFetch('/x').then(() => 'ok', () => 'failed')
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS - 1)

    expect(await Promise.race([settled, Promise.resolve('pending')])).toBe('pending')
  })

  it('끝난 요청의 타이머는 즉시 지운다 — 남겨두면 나중에 끊는다', async () => {
    fetchMock.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))

    expect(await apiFetch('/x')).toEqual({ ok: true })

    // 시간을 흘려보내고 세면 안 된다 — 안 지웠어도 그때 실행돼 0이 되므로 늘 통과한다.
    // 끝난 <b>직후</b>에 0이어야 "지웠다"가 증명된다.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('실패한 요청의 타이머도 지운다', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }))

    await apiFetch('/x').catch(() => undefined)

    expect(vi.getTimerCount()).toBe(0)
  })

  it('호출자가 중간에 끊은 것은 타임아웃으로 둔갑시키지 않는다', async () => {
    hangingFetch()
    const caller = new AbortController()

    const settled = apiFetch('/x', { signal: caller.signal }).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(1) // 요청이 실제로 나가고 나서 끊는다
    caller.abort()
    const error = await settled

    expect((error as ApiHttpError).code).not.toBe('TIMEOUT')
    expect((error as DOMException).name).toBe('AbortError')
  })

  it('이미 끊긴 signal로 부르면 요청을 보내지 않은 것처럼 곧바로 끝난다', async () => {
    hangingFetch()

    const error = await apiFetch('/x', { signal: AbortSignal.abort() })
        .catch((e: unknown) => e)

    expect((error as DOMException).name).toBe('AbortError')
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('apiFetch — 토큰 갱신도 상한 안에 둔다(HP-298)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.mocked(getToken).mockResolvedValue('test-token')
  })

  /**
   * 토큰 갱신은 fetch보다 <b>앞</b>이라 signal이 닿지 않는다 — 여기서 새면 시간 상한을 걸어도
   * 화면 잠금이 무기한 남는다. keycloak-js는 취소 수단이 없어 밑의 작업은 계속 돌지만,
   * 기다리는 쪽은 상한 안에 반드시 풀려야 한다.
   */
  it('토큰 갱신이 멎어도 상한 안에 TIMEOUT으로 끝난다', async () => {
    vi.mocked(getToken).mockImplementation(() => new Promise(() => {}))

    const settled = apiFetch('/x').catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS)
    const error = await settled

    expect((error as ApiHttpError).code).toBe('TIMEOUT')
    expect(fetchMock).not.toHaveBeenCalled()   // 토큰이 없으니 요청도 안 나갔다
  })
})
