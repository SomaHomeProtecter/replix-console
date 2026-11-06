import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@core/auth', () => ({ getToken: vi.fn(async () => 'test-token') }))
vi.mock('@core/env', () => ({
  env: { environment: 'DEV', apiBaseUrl: 'http://api.test', kcUrl: '', kcRealm: '', kcClientId: '' },
}))

import { applyManualPoster, approvePosterReview, listPosterReviews, rejectPosterReview } from './admin'
import type { PosterReview } from './types'

const review: PosterReview = {
  contentId: 199, platform: 'disney_plus', platformName: 'Disney+', title: '재혼황후',
  contentType: 'SERIES', searchedAt: '2026-11-06T13:00:00Z', modelId: 'global.anthropic.claude-opus-4-6-v1',
  candidates: [{
    tmdbType: 'tv', tmdbId: 279246, name: '재혼 황후', originalName: '재혼 황후', year: 2026,
    posterUrl: 'https://image.tmdb.org/t/p/w342/a.jpg', tmdbUrl: 'https://www.themoviedb.org/tv/279246',
    relation: 'SAME', reason: '띄어 쓴 제목',
  }],
}

const decided = { contentId: 199, tmdbMatchStatus: 'CONFIRMED', tmdbType: 'tv', tmdbId: 279246, posterUrl: null }

describe('poster reviews — TMDB 포스터 검토 계약(HP-826)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(decided), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('대기 목록은 쿼리 없이 GET한다', async () => {
    fetchMock.mockResolvedValueOnce(new Response('[]', { status: 200 }))

    await expect(listPosterReviews()).resolves.toEqual([])

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined]
    expect(url).toBe('http://api.test/api/v1/admin/tmdb/poster-reviews')
    expect(init?.method ?? 'GET').toBe('GET')
  })

  it('승인은 고른 후보의 종류·번호만 POST한다', async () => {
    await approvePosterReview(review, review.candidates[0])

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://api.test/api/v1/admin/tmdb/poster-reviews/199/approve')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ tmdbType: 'tv', tmdbId: 279246 })
  })

  it('직접 입력은 앞뒤 공백을 지운 주소를 tmdbRef로 POST한다', async () => {
    await applyManualPoster(review, '  https://www.themoviedb.org/tv/279246  ')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://api.test/api/v1/admin/tmdb/poster-reviews/199/manual')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ tmdbRef: 'https://www.themoviedb.org/tv/279246' })
  })

  it('거절은 본문 없이 POST한다', async () => {
    await rejectPosterReview(review)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://api.test/api/v1/admin/tmdb/poster-reviews/199/reject')
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
  })

  it('서버 오류 코드를 그대로 실어 화면이 409를 가려낼 수 있게 한다', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      code: 'REVIEW_NOT_PENDING', message: '이미 정해진 작품입니다',
    }), { status: 409 }))

    await expect(rejectPosterReview(review)).rejects.toMatchObject({
      status: 409, code: 'REVIEW_NOT_PENDING', message: '이미 정해진 작품입니다',
    })
  })
})
