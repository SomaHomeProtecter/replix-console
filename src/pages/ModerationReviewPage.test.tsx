import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import type { ModerationReviewPage as ReviewPage } from '../api/types'
import ModerationReviewPage from './ModerationReviewPage'

vi.mock('../api/admin')

const page = (): ReviewPage => ({
  pendingTotal: 2,
  counts: {
    profanity: { falsePositive: 2, truePositive: 3 },
    hate: { falsePositive: 6, truePositive: 7 },
    evictedPending: 0,
  },
  items: [
    {
      sampleId: '1:rule', episodeId: 1, msgId: 'rule', userId: 4, displayName: '현빈',
      message: '아 시발 눈물 남', stage: 'PROFANITY', category: null, score: null,
      createdAt: '2026-08-13T04:41:00Z',
    },
    {
      sampleId: '1:model', episodeId: 1, msgId: 'model', userId: 5, displayName: '효봉',
      message: '모델 오탐 후보', stage: 'HATE', category: '기타 혐오', score: 0.91,
      createdAt: '2026-08-13T04:44:00Z',
    },
  ],
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(admin.listModerationReviews).mockResolvedValue(page())
})

it('집계·단계·실제 모델 점수와 규칙 점수 부재를 함께 보여준다', async () => {
  render(<ModerationReviewPage />)

  const region = await screen.findByRole('region', { name: '클린봇 오탐 검토' })
  const summary = within(region).getByRole('list', { name: '검토 집계' })
  const [pending, falsePositive, truePositive] = within(summary).getAllByRole('listitem')
  expect(pending).toHaveTextContent('2 미판정')
  expect(falsePositive).toHaveTextContent('8 오탐')
  expect(truePositive).toHaveTextContent('10 정탐')
  expect(within(region).getByText('0.91')).toBeInTheDocument()
  expect(within(region).getByText('규칙 일치 · 점수 없음')).toBeInTheDocument()
})

it('단계 칩은 현재 받은 bounded 표본 안에서만 행을 거른다', async () => {
  const user = userEvent.setup()
  render(<ModerationReviewPage />)
  await screen.findByText('모델 오탐 후보')

  await user.click(screen.getByRole('button', { name: '1차 비속어' }))

  expect(screen.getByText('아 시발 눈물 남')).toBeInTheDocument()
  expect(screen.queryByText('모델 오탐 후보')).not.toBeInTheDocument()
  expect(admin.listModerationReviews).toHaveBeenCalledTimes(1)
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
  const summary = screen.getByRole('list', { name: '검토 집계' })
  const [pending, falsePositive] = within(summary).getAllByRole('listitem')
  expect(pending).toHaveTextContent('1 미판정')
  expect(falsePositive).toHaveTextContent('9 오탐')
})

it('판정 실패는 목록을 다시 읽어 중복 조치 가능한 낡은 행을 남기지 않는다', async () => {
  const user = userEvent.setup()
  vi.mocked(admin.decideModerationReview).mockRejectedValue(new Error('이미 판정됨'))
  vi.mocked(admin.listModerationReviews)
    .mockResolvedValueOnce(page())
    .mockResolvedValueOnce({ ...page(), pendingTotal: 1, items: [page().items[1]] })
  render(<ModerationReviewPage />)
  const row = (await screen.findByText('아 시발 눈물 남')).closest('li')!

  await user.click(within(row).getByRole('button', { name: '정탐' }))

  await waitFor(() => expect(screen.queryByText('아 시발 눈물 남')).not.toBeInTheDocument())
  expect(admin.listModerationReviews).toHaveBeenCalledTimes(2)
})
