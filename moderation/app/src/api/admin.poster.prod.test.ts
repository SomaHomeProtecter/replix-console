import { describe, expect, it, vi } from 'vitest'

const apiFetchMock = vi.hoisted(() => vi.fn())
vi.mock('@core/api/client', () => ({ apiFetch: apiFetchMock, qs: vi.fn() }))

import { applyManualPoster, approvePosterReview, rejectPosterReview } from './admin'
import type { PosterReview } from './types'

const review: PosterReview = {
  contentId: 199, platform: 'disney_plus', platformName: 'Disney+', title: '재혼황후',
  contentType: 'SERIES', searchedAt: '2026-11-06T13:00:00Z', modelId: null,
  candidates: [{
    tmdbType: 'tv', tmdbId: 279246, name: '재혼 황후', originalName: null, year: null,
    posterUrl: null, tmdbUrl: 'https://www.themoviedb.org/tv/279246', relation: 'SAME', reason: null,
  }],
}

// 세 쓰기 모두 apiFetch에 PROD 확인 설명을 넘겨야 콘솔 하나뿐인 'PROD' 확인 창을 거친다 — 빠지면 apiFetch가 PROD에서 막는다.
describe('포스터 검토 쓰기 — PROD 확인 설명(HP-826)', () => {
  it('승인은 작품 제목과 고른 TMDB 작품을 보여 준다', async () => {
    apiFetchMock.mockResolvedValue({})
    await approvePosterReview(review, review.candidates[0])
    expect(apiFetchMock).toHaveBeenLastCalledWith(
      '/api/v1/admin/tmdb/poster-reviews/199/approve',
      { method: 'POST', body: JSON.stringify({ tmdbType: 'tv', tmdbId: 279246 }) },
      {
        target: '작품 #199 재혼황후 (Disney+)',
        change: '포스터 없음 → TMDB tv/279246 (재혼 황후)',
        reason: '운영자가 AI 후보 중 선택',
      },
    )
  })

  it('직접 입력은 넣은 주소를 보여 준다', async () => {
    apiFetchMock.mockResolvedValue({})
    await applyManualPoster(review, 'movie/123')
    expect(apiFetchMock.mock.lastCall?.[2]).toMatchObject({
      target: '작품 #199 재혼황후 (Disney+)', change: '포스터 없음 → TMDB movie/123 (직접 입력)',
    })
  })

  it('거절은 되돌릴 수 없다는 사실을 확인 문구에 싣는다', async () => {
    apiFetchMock.mockResolvedValue({})
    await rejectPosterReview(review)
    expect(apiFetchMock.mock.lastCall?.[2]).toMatchObject({
      target: '작품 #199 재혼황후 (Disney+)', change: expect.stringContaining('되돌릴 수 없음'),
    })
  })
})
