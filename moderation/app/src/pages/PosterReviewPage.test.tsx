import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import { ApiHttpError } from '@core/api/client'
import { realmRoles } from '@core/auth'
import type { PosterDecisionResult, PosterReview } from '../api/types'
import PosterReviewPage from './PosterReviewPage'

vi.mock('../api/admin')

const withCandidates = (): PosterReview => ({
  contentId: 199, platform: 'disney_plus', platformName: 'Disney+', title: '재혼황후',
  contentType: 'SERIES', searchedAt: '2026-11-06T13:00:00Z', modelId: 'global.anthropic.claude-opus-4-6-v1',
  candidates: [
    {
      tmdbType: 'tv', tmdbId: 279246, name: '재혼 황후', originalName: 'The Remarried Empress', year: 2026,
      posterUrl: 'https://image.tmdb.org/t/p/w342/same.jpg', tmdbUrl: 'https://www.themoviedb.org/tv/279246',
      relation: 'SAME', reason: "TMDB 제목이 띄어 쓴 '재혼 황후'다",
    },
    {
      tmdbType: 'movie', tmdbId: 555, name: '재혼황후 극장판', originalName: null, year: null,
      posterUrl: 'https://image.tmdb.org/t/p/w342/close.jpg', tmdbUrl: 'https://www.themoviedb.org/movie/555',
      relation: 'CLOSEST', reason: null,
    },
  ],
})

const noCandidates = (): PosterReview => ({
  contentId: 200, platform: 'netflix', platformName: '넷플릭스', title: '흑백요리사 감독판',
  contentType: 'MOVIE', searchedAt: '2026-11-06T12:00:00Z', modelId: null, candidates: [],
})

const confirmed: PosterDecisionResult = {
  contentId: 199, tmdbMatchStatus: 'CONFIRMED', tmdbType: 'tv', tmdbId: 279246,
  posterUrl: 'https://image.tmdb.org/t/p/w342/same.jpg',
}

const card = async (title: string) => screen.findByRole('listitem', { name: title })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(admin.listPosterReviews).mockResolvedValue([withCandidates(), noCandidates()])
})

it('작품마다 플랫폼·종류·검색 시각과 후보의 포스터·이름·관계·이유·TMDB 링크를 보인다', async () => {
  render(<PosterReviewPage />)
  const work = await card('재혼황후')

  expect(within(work).getByText('Disney+ · 시리즈')).toBeInTheDocument()
  expect(within(work).getByText('AI 검색 11-06 22:00')).toBeInTheDocument()
  const candidates = within(within(work).getByRole('list', { name: '재혼황후 후보' })).getAllByRole('listitem')
  expect(candidates).toHaveLength(2)

  const [same, closest] = candidates
  expect(within(same).getByRole('img', { name: '재혼 황후 포스터' }))
    .toHaveAttribute('src', 'https://image.tmdb.org/t/p/w342/same.jpg')
  expect(within(same).getByText('The Remarried Empress')).toBeInTheDocument()
  expect(within(same).getByText('2026')).toBeInTheDocument()
  expect(within(same).getByText('같은 작품')).toBeInTheDocument()
  expect(within(same).getByText("TMDB 제목이 띄어 쓴 '재혼 황후'다")).toBeInTheDocument()
  const link = within(same).getByRole('link', { name: 'TMDB에서 보기' })
  expect(link).toHaveAttribute('href', 'https://www.themoviedb.org/tv/279246')
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  expect(within(closest).getByText('가까운 작품')).toBeInTheDocument()
  expect(within(closest).getByRole('button', { name: '승인' })).toBeEnabled()
})

it('후보가 없는 작품은 승인 없이 직접 입력과 거절만 남긴다', async () => {
  render(<PosterReviewPage />)
  const work = await card('흑백요리사 감독판')

  expect(within(work).getByText('넷플릭스 · 영화')).toBeInTheDocument()
  expect(within(work).getByText(/AI가 맞는 후보를 찾지 못했습니다/)).toBeInTheDocument()
  expect(within(work).queryByRole('button', { name: '승인' })).not.toBeInTheDocument()
  expect(within(work).getByRole('textbox', { name: '흑백요리사 감독판 TMDB 주소' })).toBeEnabled()
  expect(within(work).getByRole('button', { name: '거절' })).toBeEnabled()
})

it('기다리는 작품이 없으면 빈 상태를 보인다', async () => {
  vi.mocked(admin.listPosterReviews).mockResolvedValue([])
  render(<PosterReviewPage />)
  expect(await screen.findByText('포스터를 기다리는 작품이 없습니다')).toBeInTheDocument()
})

it('승인은 고른 후보로 보내고 성공하면 그 작품을 목록에서 뺀다', async () => {
  const user = userEvent.setup()
  vi.mocked(admin.approvePosterReview).mockResolvedValue(confirmed)
  render(<PosterReviewPage />)
  const work = await card('재혼황후')
  const closest = within(work).getAllByRole('listitem')[1]

  await user.click(within(closest).getByRole('button', { name: '승인' }))

  await waitFor(() => expect(screen.queryByRole('listitem', { name: '재혼황후' })).not.toBeInTheDocument())
  expect(admin.approvePosterReview).toHaveBeenCalledWith(withCandidates(), withCandidates().candidates[1])
  expect(screen.getByRole('status')).toHaveTextContent('재혼황후 — 승인했습니다')
  expect(screen.getByRole('listitem', { name: '흑백요리사 감독판' })).toBeInTheDocument()
})

it('직접 입력은 넣은 주소로 보내고, 주소 오류는 그 작품 카드에 보이며 행을 남긴다', async () => {
  const user = userEvent.setup()
  vi.mocked(admin.applyManualPoster)
    .mockRejectedValueOnce(new ApiHttpError(400, 'INVALID_TMDB_REF', 'TMDB 주소 형식이 아닙니다'))
    .mockResolvedValueOnce({ ...confirmed, contentId: 200 })
  render(<PosterReviewPage />)
  const work = await card('흑백요리사 감독판')
  const input = within(work).getByRole('textbox', { name: '흑백요리사 감독판 TMDB 주소' })
  const apply = within(work).getByRole('button', { name: '적용' })
  expect(apply).toBeDisabled()

  await user.type(input, 'tv/abc')
  await user.click(apply)

  expect(await within(work).findByRole('alert')).toHaveTextContent('TMDB 주소 형식이 아닙니다')
  expect(admin.applyManualPoster).toHaveBeenLastCalledWith(noCandidates(), 'tv/abc')
  expect(admin.listPosterReviews).toHaveBeenCalledTimes(1)

  await user.clear(input)
  await user.type(input, 'movie/123{Enter}')

  await waitFor(() => expect(screen.queryByRole('listitem', { name: '흑백요리사 감독판' })).not.toBeInTheDocument())
  expect(admin.applyManualPoster).toHaveBeenLastCalledWith(noCandidates(), 'movie/123')
})

it('거절은 확인을 한 번 더 받은 뒤에만 보내고, 취소하면 보내지 않는다', async () => {
  const user = userEvent.setup()
  vi.mocked(admin.rejectPosterReview).mockResolvedValue({
    contentId: 199, tmdbMatchStatus: 'REJECTED', tmdbType: null, tmdbId: null, posterUrl: null,
  })
  render(<PosterReviewPage />)
  const work = await card('재혼황후')

  await user.click(within(work).getByRole('button', { name: '거절' }))
  expect(within(work).getByText('포스터 없이 둡니다. 콘솔에서 되돌릴 수 없습니다.')).toBeInTheDocument()
  await user.click(within(work).getByRole('button', { name: '취소' }))
  expect(within(work).getByRole('button', { name: '거절' })).toBeInTheDocument()
  expect(admin.rejectPosterReview).not.toHaveBeenCalled()

  await user.click(within(work).getByRole('button', { name: '거절' }))
  await user.click(within(work).getByRole('button', { name: '거절 확인' }))

  await waitFor(() => expect(screen.queryByRole('listitem', { name: '재혼황후' })).not.toBeInTheDocument())
  expect(admin.rejectPosterReview).toHaveBeenCalledWith(withCandidates())
})

it('그사이 정해진 작품(409 REVIEW_NOT_PENDING)은 짧게 알리고 목록을 다시 읽는다', async () => {
  const user = userEvent.setup()
  vi.mocked(admin.approvePosterReview)
    .mockRejectedValue(new ApiHttpError(409, 'REVIEW_NOT_PENDING', '검토 대기 상태가 아닙니다'))
  vi.mocked(admin.listPosterReviews)
    .mockResolvedValueOnce([withCandidates(), noCandidates()])
    .mockResolvedValueOnce([noCandidates()])
  render(<PosterReviewPage />)
  const work = await card('재혼황후')

  await user.click(within(work).getAllByRole('button', { name: '승인' })[0])

  await waitFor(() => expect(screen.queryByRole('listitem', { name: '재혼황후' })).not.toBeInTheDocument())
  expect(admin.listPosterReviews).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('status')).toHaveTextContent('그사이 포스터가 이미 정해져 목록을 새로 불러왔습니다')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('첫 조회 실패는 빈 상태로 그리지 않고 다시 시도로 연다', async () => {
  const user = userEvent.setup()
  vi.mocked(admin.listPosterReviews)
    .mockRejectedValueOnce(new Error('게이트웨이 응답 없음'))
    .mockResolvedValueOnce([withCandidates()])
  render(<PosterReviewPage />)

  expect(await screen.findByText('포스터 검토 목록을 불러오지 못했습니다.')).toBeInTheDocument()
  expect(screen.queryByText('포스터를 기다리는 작품이 없습니다')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '다시 시도' }))

  expect(await card('재혼황후')).toBeInTheDocument()
})

describe('조회 전용 계정(HP-529)', () => {
  it('후보와 링크는 보이지만 승인·적용·거절과 주소 칸이 꺼지고 이유를 보인다', async () => {
    vi.mocked(realmRoles).mockReturnValue(['admin_console_viewer'])
    render(<PosterReviewPage />)
    const work = await card('재혼황후')

    expect(within(work).getByRole('img', { name: '재혼 황후 포스터' })).toBeInTheDocument()
    expect(within(work).getAllByRole('link', { name: 'TMDB에서 보기' })).toHaveLength(2)
    const approves = within(work).getAllByRole('button', { name: '승인' })
    expect(approves).toHaveLength(2)
    for (const button of approves) expect(button).toBeDisabled()
    expect(within(work).getByRole('button', { name: '거절' })).toBeDisabled()
    expect(within(work).getByRole('button', { name: '적용' })).toBeDisabled()
    expect(within(work).getByRole('textbox', { name: '재혼황후 TMDB 주소' })).toBeDisabled()
    expect(screen.getByText('조치 권한이 없습니다 — admin 또는 moderation_operator 역할이 필요합니다',
      { selector: '.readonly-note' })).toBeInTheDocument()
  })
})
