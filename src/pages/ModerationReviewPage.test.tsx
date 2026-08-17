import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import type { ModerationReviewPage as ReviewPage } from '../api/types'
import ModerationReviewPage from './ModerationReviewPage'

vi.mock('../api/admin')

const page = (): ReviewPage => ({
  pendingTotal: 2,
  viewTotal: 2,
  hasMore: false,
  counts: {
    profanity: { falsePositive: 2, truePositive: 3 },
    hate: { falsePositive: 6, truePositive: 7 },
    evictedPending: 0,
  },
  items: [
    {
      sampleId: '1:rule', episodeId: 1, msgId: 'rule', userId: 4, displayName: '현빈',
      message: '아 시발 눈물 남', stage: 'PROFANITY', category: null, score: null,
      createdAt: '2026-08-13T04:41:00Z', decision: null, reviewerId: null,
      reviewerName: null, decidedAt: null,
    },
    {
      sampleId: '1:model', episodeId: 1, msgId: 'model', userId: 5, displayName: '효봉',
      message: '모델 오탐 후보', stage: 'HATE', category: '기타 혐오', score: 0.91,
      createdAt: '2026-08-13T04:44:00Z', decision: null, reviewerId: null,
      reviewerName: null, decidedAt: null,
    },
  ],
})

const historyPage = (): ReviewPage => ({
  ...page(),
  viewTotal: 1,
  items: [{
    ...page().items[1], decision: 'FALSE_POSITIVE', reviewerId: 91, reviewerName: '김운영',
    decidedAt: '2026-08-17T02:30:00Z',
  }],
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(admin.listModerationReviews).mockResolvedValue(page())
})

it('집계 버튼·단계·실제 모델 점수와 규칙 점수 부재를 함께 보여준다', async () => {
  render(<ModerationReviewPage />)

  const region = await screen.findByRole('region', { name: '클린봇 오탐 검토' })
  const summary = within(region).getByRole('list', { name: '검토 집계' })
  expect(within(summary).getByRole('button', { name: '2 미판정' })).toHaveAttribute('aria-pressed', 'true')
  expect(within(summary).getByRole('button', { name: '8 오탐' })).toBeEnabled()
  expect(within(summary).getByRole('button', { name: '10 정탐' })).toBeEnabled()
  expect(within(region).getByText('0.91')).toBeInTheDocument()
  expect(within(region).getByText('규칙 일치 · 점수 없음')).toBeInTheDocument()
  expect(admin.listModerationReviews).toHaveBeenCalledWith({
    view: 'PENDING', stage: '', offset: 0,
  })
})

it('단계 칩은 서버 필터와 조합해 다시 조회한다', async () => {
  const user = userEvent.setup()
  vi.mocked(admin.listModerationReviews)
    .mockResolvedValueOnce(page())
    .mockResolvedValueOnce({ ...page(), viewTotal: 1, items: [page().items[0]] })
  render(<ModerationReviewPage />)
  await screen.findByText('모델 오탐 후보')

  await user.click(screen.getByRole('button', { name: '1차 비속어' }))

  await waitFor(() => expect(screen.queryByText('모델 오탐 후보')).not.toBeInTheDocument())
  expect(screen.getByText('아 시발 눈물 남')).toBeInTheDocument()
  expect(admin.listModerationReviews).toHaveBeenLastCalledWith({
    view: 'PENDING', stage: 'PROFANITY', offset: 0,
  })
})

it('오탐 집계를 누르면 처리자·판정시각이 있는 최근 상세로 내려간다', async () => {
  const user = userEvent.setup()
  vi.mocked(admin.listModerationReviews)
    .mockResolvedValueOnce(page())
    .mockResolvedValueOnce(historyPage())
  render(<ModerationReviewPage />)
  await screen.findByText('모델 오탐 후보')

  await user.click(screen.getByRole('button', { name: '8 오탐' }))

  expect(await screen.findByText('김운영')).toBeInTheDocument()
  expect(screen.getByText('누적 집계 · 최근 14일 상세 · 최근 판정 순')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '정탐' })).not.toBeInTheDocument()
  expect(admin.listModerationReviews).toHaveBeenLastCalledWith({
    view: 'FALSE_POSITIVE', stage: '', offset: 0,
  })
})

it('오탐 판정 성공은 행을 제거하고 서버가 준 집계로 맞춘다', async () => {
  const user = userEvent.setup()
  vi.mocked(admin.decideModerationReview).mockResolvedValue({
    sampleId: '1:rule', decision: 'FALSE_POSITIVE',
    counts: {
      profanity: { falsePositive: 3, truePositive: 3 },
      hate: { falsePositive: 6, truePositive: 7 }, evictedPending: 0,
    },
  })
  render(<ModerationReviewPage />)
  const row = (await screen.findByText('아 시발 눈물 남')).closest('li')!

  await user.click(within(row).getByRole('button', { name: '오탐' }))

  await waitFor(() => expect(screen.queryByText('아 시발 눈물 남')).not.toBeInTheDocument())
  expect(admin.decideModerationReview).toHaveBeenCalledWith('1:rule', 'FALSE_POSITIVE')
  expect(screen.getByRole('button', { name: '1 미판정' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '9 오탐' })).toBeInTheDocument()
})

it('판정 실패는 목록을 다시 읽어 중복 조치 가능한 낡은 행을 남기지 않는다', async () => {
  const user = userEvent.setup()
  vi.mocked(admin.decideModerationReview).mockRejectedValue(new Error('이미 판정됨'))
  vi.mocked(admin.listModerationReviews)
    .mockResolvedValueOnce(page())
    .mockResolvedValueOnce({
      ...page(), pendingTotal: 1, viewTotal: 1, items: [page().items[1]],
    })
  render(<ModerationReviewPage />)
  const row = (await screen.findByText('아 시발 눈물 남')).closest('li')!

  await user.click(within(row).getByRole('button', { name: '정탐' }))

  await waitFor(() => expect(screen.queryByText('아 시발 눈물 남')).not.toBeInTheDocument())
  expect(admin.listModerationReviews).toHaveBeenCalledTimes(2)
})

it('첫 조회 실패는 정상 0건처럼 그리지 않고 재시도 성공 후에만 집계를 연다', async () => {
  const user = userEvent.setup()
  vi.mocked(admin.listModerationReviews)
    .mockRejectedValueOnce(new Error('게이트웨이 응답 없음'))
    .mockResolvedValueOnce(page())
  render(<ModerationReviewPage />)

  expect(await screen.findByText('오탐 검토 정보를 불러오지 못했습니다.')).toBeInTheDocument()
  expect(screen.queryByRole('list', { name: '검토 집계' })).not.toBeInTheDocument()
  expect(screen.queryByText('검토할 표본이 없습니다')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '다시 시도' }))

  expect(await screen.findByRole('button', { name: '2 미판정' })).toBeInTheDocument()
})

it('정상 조회 뒤 갱신 실패는 마지막 데이터를 보존하고 최신 아님을 표시한다', async () => {
  const user = userEvent.setup()
  vi.mocked(admin.listModerationReviews)
    .mockResolvedValueOnce(page())
    .mockRejectedValueOnce(new Error('일시적 장애'))
  render(<ModerationReviewPage />)
  await screen.findByText('모델 오탐 후보')

  await user.click(screen.getByRole('button', { name: '새로고침' }))

  expect(await screen.findByText(/화면이 최신이 아닐 수 있습니다/)).toBeInTheDocument()
  expect(screen.getByText('모델 오탐 후보')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '2 미판정' })).toBeInTheDocument()
})

it('더 보기는 현재 행 수를 offset으로 보내고 기존 상세 뒤에 붙인다', async () => {
  const user = userEvent.setup()
  vi.mocked(admin.listModerationReviews)
    .mockResolvedValueOnce({ ...page(), viewTotal: 3, hasMore: true })
    .mockResolvedValueOnce({
      ...page(), viewTotal: 3, hasMore: false,
      items: [{ ...page().items[0], sampleId: '1:third', msgId: 'third', message: '세 번째 표본' }],
    })
  render(<ModerationReviewPage />)
  await screen.findByText('모델 오탐 후보')

  await user.click(screen.getByRole('button', { name: '더 보기 (2/3)' }))

  expect(await screen.findByText('세 번째 표본')).toBeInTheDocument()
  expect(screen.getByText('모델 오탐 후보')).toBeInTheDocument()
  expect(admin.listModerationReviews).toHaveBeenLastCalledWith({
    view: 'PENDING', stage: '', offset: 2,
  })
})
