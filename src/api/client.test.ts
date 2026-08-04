import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth', () => ({ getToken: vi.fn(async () => 'test-token') }))
vi.mock('../env', () => ({
  env: { apiBaseUrl: 'http://api.test', kcUrl: '', kcRealm: '', kcClientId: '' },
}))

import { ApiHttpError, apiFetch, qs } from './client'

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
