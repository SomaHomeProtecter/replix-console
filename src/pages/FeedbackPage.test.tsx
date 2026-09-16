import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import { makeFeedbackItem } from '../test/fixtures'
import FeedbackPage from './FeedbackPage'

vi.mock('../api/admin')

const listFeedback = vi.mocked(admin.listFeedback)
const deleteFeedback = vi.mocked(admin.deleteFeedback)

function renderPage() {
  return render(<MemoryRouter><FeedbackPage /></MemoryRouter>)
}

/** 목록 행(헤더 제외)만 고른다 — 펼친 상세도 <tr>이라 인덱스로 세면 어긋난다. */
function rows() {
  return screen.getAllByRole('row').filter((row) => row.classList.contains('feedback-row'))
}

beforeEach(() => {
  vi.clearAllMocks()
  // 호출마다 새 객체를 만든다(한 객체를 재사용하면 setItems가 bail-out 해 재렌더가 일어나지 않아
  // "필터를 바꾼 뒤" 화면을 검증할 수 없다 — ReportQueuePage.test와 같은 이유).
  listFeedback.mockImplementation(async () => ({ items: [makeFeedbackItem()], nextCursor: null }))
  deleteFeedback.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('피드백 탭(HP-426) — 목록·필터·상세·삭제', () => {
  it('① 초기 로드는 필터 없이 전체를 묻고 행을 그린다', async () => {
    renderPage()
    await screen.findByText('자막이 한 박자 늦게 떠요')

    expect(listFeedback).toHaveBeenCalledWith({ surface: '', category: '', score: '' }, null)
    const row = rows()[0]
    expect(within(row).getByText('확장')).toBeInTheDocument()
    expect(within(row).getByText('★4')).toBeInTheDocument()
    expect(within(row).getByText('이런 게 있으면')).toBeInTheDocument()
    expect(within(row).getByText('리플러')).toBeInTheDocument()
  })

  it('② 표면·카테고리·점수 필터를 바꾸면 커서 없이 처음부터 다시 묻는다', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('자막이 한 박자 늦게 떠요')

    await user.selectOptions(screen.getByRole('combobox', { name: '표면' }), 'WEB')
    expect(listFeedback).toHaveBeenLastCalledWith({ surface: 'WEB', category: '', score: '' }, null)

    await user.selectOptions(screen.getByRole('combobox', { name: '카테고리' }), 'BUG')
    expect(listFeedback)
        .toHaveBeenLastCalledWith({ surface: 'WEB', category: 'BUG', score: '' }, null)

    // 점수는 숫자로 보낸다 — select의 문자열 값을 그대로 흘리면 BE가 문자열 "2"를 받는다.
    await user.selectOptions(screen.getByRole('combobox', { name: '점수' }), '2')
    expect(listFeedback)
        .toHaveBeenLastCalledWith({ surface: 'WEB', category: 'BUG', score: 2 }, null)
  })

  /**
   * 목록은 앞 60자만 보여주므로, 뒤가 잘린 본문을 읽을 유일한 길이 상세다. 본문은 사용자가 쓴
   * 글이라 HTML로 해석하면 안 되고(태그가 글자 그대로 보여야 한다) 줄바꿈은 보존해야 한다.
   */
  it('③ 행을 펼치면 본문 전문과 버전·플랫폼·회차·경로가 드러난다', async () => {
    const body = `앞줄 <b>굵게</b>\n${'가'.repeat(70)}\n끝줄`
    listFeedback.mockImplementation(async () => ({
      items: [makeFeedbackItem({ body })], nextCursor: null,
    }))
    const user = userEvent.setup()
    renderPage()

    const row = (await waitFor(() => rows()))[0]
    expect(within(row).queryByText(/끝줄/)).not.toBeInTheDocument()
    expect(within(row).getByText(/…$/)).toBeInTheDocument()

    await user.click(row)

    // 기본 정규화는 줄바꿈을 공백으로 접는다 — 전문이 <b>원문 그대로</b>인지 보려면 끈다.
    const full = await screen.findByText(body, { normalizer: (text) => text })
    expect(full).toHaveClass('feedback-body')          // .feedback-body { white-space: pre-wrap }
    expect(full.innerHTML).not.toContain('<b>')        // 본문은 절대 HTML로 렌더하지 않는다
    expect(screen.getByText('1.2.3')).toBeInTheDocument()
    expect(screen.getByText('chrome')).toBeInTheDocument()
    expect(screen.getByText('101')).toBeInTheDocument()
    expect(screen.getByText('202')).toBeInTheDocument()
    expect(screen.getByText('프롬프트')).toBeInTheDocument()
  })

  /**
   * 삭제는 되돌릴 수 없는데 상세 안에 있어 잘못 눌리기 쉽다. window.confirm은 jsdom·실사용
   * 모두에서 화면 밖 장치라 쓰지 않고, 같은 버튼을 두 번 누르게 해 안쪽에서 확인을 받는다.
   */
  it('④ 삭제는 두 번 눌러야 나가고, 성공하면 행이 사라진다', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click((await waitFor(() => rows()))[0])
    await user.click(screen.getByRole('button', { name: '삭제' }))

    expect(deleteFeedback).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '정말 삭제' }))

    await waitFor(() => expect(deleteFeedback).toHaveBeenCalledWith(12))
    await waitFor(() =>
        expect(screen.queryByText('자막이 한 박자 늦게 떠요')).not.toBeInTheDocument())
  })

  it('④-2 확인은 3초가 지나면 저절로 원복된다', async () => {
    renderPage()
    // 첫 로드는 진짜 타이머로 끝낸 뒤 시계를 세운다 — 로드까지 가짜 시계 안에 두면 응답을
    // 기다리는 waitFor가 스스로 시간을 못 밀어 테스트가 멎는다.
    await waitFor(() => expect(rows()).toHaveLength(1))
    vi.useFakeTimers()

    fireEvent.click(rows()[0])
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    expect(screen.getByRole('button', { name: '정말 삭제' })).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(3_000) })

    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
    expect(deleteFeedback).not.toHaveBeenCalled()
  })

  it('⑤ 로그인 없이 보낸 피드백은 사용자 칸이 익명이다', async () => {
    listFeedback.mockImplementation(async () => ({
      items: [makeFeedbackItem({ user: null, score: null, category: null })], nextCursor: null,
    }))
    renderPage()

    const row = (await waitFor(() => rows()))[0]
    expect(within(row).getByText('익명')).toBeInTheDocument()
    // 점수·카테고리는 선택 입력이라 비어 올 수 있다 — 빈 칸이 아니라 없음 표시로 채운다.
    expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(2)
  })

  it('nextCursor가 있으면 "더 보기"가 다음 페이지를 이어붙인다', async () => {
    listFeedback
        .mockImplementationOnce(async () => ({ items: [makeFeedbackItem()], nextCursor: '12' }))
        .mockImplementationOnce(async () => ({
          items: [makeFeedbackItem({ id: 9, body: '두 번째 페이지 본문' })], nextCursor: null,
        }))
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('자막이 한 박자 늦게 떠요')

    await user.click(screen.getByRole('button', { name: '더 보기' }))

    expect(listFeedback).toHaveBeenLastCalledWith({ surface: '', category: '', score: '' }, '12')
    expect(await screen.findByText('두 번째 페이지 본문')).toBeInTheDocument()
    expect(screen.getByText('자막이 한 박자 늦게 떠요')).toBeInTheDocument()
  })

  it('목록 호출이 실패하면 오류를 화면에 드러낸다', async () => {
    listFeedback.mockRejectedValue(new Error('관리자 권한이 없습니다'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('관리자 권한이 없습니다')
  })
})
