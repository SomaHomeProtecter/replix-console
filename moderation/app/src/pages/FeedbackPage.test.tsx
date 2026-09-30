import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import type {
  CoveredElement, FeedbackCategory, FeedbackItem, FeedbackSurface, FeedbackTrigger, UninstallReason,
  WantedService,
} from '../api/types'
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

describe('삭제 설문(HP-458) — 사유·후속 선택·설치 후 경과일', () => {
  /**
   * 확장을 지운 뒤 replix.tv 삭제 페이지가 보낸 행. 별점·카테고리·본문 없이 사유만 올 수 있고,
   * 서버는 배열을 설문 순서(enum 선언 순)로 정렬해 준다.
   */
  function uninstallItem(overrides: Partial<FeedbackItem> = {}): FeedbackItem {
    return makeFeedbackItem({
      surface: 'WEB', trigger: 'UNINSTALL', score: null, category: null, body: null,
      appVersion: '0.12.0', platform: null, contentId: null, episodeId: null, user: null,
      reasons: ['BLOCKS_SCREEN', 'NO_MY_OTT'], coveredBy: ['CHAT_PANEL', 'DANMAKU'],
      wantedServices: ['TVING'], installDays: 3,
      ...overrides,
    })
  }

  it('⑥ 목록에서 카테고리 자리에 "삭제 설문", 본문 자리에 고른 사유가 보인다', async () => {
    listFeedback.mockImplementation(async () => ({ items: [uninstallItem()], nextCursor: null }))
    renderPage()

    const row = (await waitFor(() => rows()))[0]
    // 별점·카테고리·본문이 모두 "—"로 늘어서면 왜 지웠는지 목록에서 읽을 수 없다.
    expect(within(row).getByText('삭제 설문')).toBeInTheDocument()
    expect(within(row).getByText('화면을 가려요 · 쓰는 OTT가 없어요')).toBeInTheDocument()
  })

  it('⑥-2 남긴 말이 있으면 사유 뒤에 이어 보인다', async () => {
    listFeedback.mockImplementation(async () => ({
      items: [uninstallItem({
        reasons: ['SLOW_OR_BUGGY'], coveredBy: [], wantedServices: [], body: '자꾸\n멈춰요',
      })],
      nextCursor: null,
    }))
    renderPage()

    const row = (await waitFor(() => rows()))[0]
    expect(within(row).getByText('느리거나 오류가 나요 — 자꾸 멈춰요')).toBeInTheDocument()
  })

  it('⑦ 펼치면 사유마다 후속 선택이, 메타에 설치 후 경과일과 경로가 드러난다', async () => {
    listFeedback.mockImplementation(async () => ({ items: [uninstallItem()], nextCursor: null }))
    const user = userEvent.setup()
    renderPage()

    await user.click((await waitFor(() => rows()))[0])

    const list = screen.getByRole('list', { name: '삭제 사유' })
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '화면을 가려요 — 가린 것: 채팅창, 탄막',
      '쓰는 OTT가 없어요 — 원하는 서비스: 티빙',
    ])
    expect(screen.getByText('3일')).toBeInTheDocument()
    expect(screen.getByText('삭제 설문', { selector: 'dd' })).toBeInTheDocument()
  })

  /**
   * 일반 피드백 행은 두 모양으로 온다 — 새 칸을 모르는 BE는 칸 자체가 없고, 새 BE는 빈 목록·null을 싣는다
   * (Replix-be IT `일반_피드백_행의_사유_칸은_빈_목록이다`). 빈 목록을 "있음"으로 읽으면 모든 일반 행에 빈
   * "삭제 사유" 제목이 붙는다.
   */
  it.each<[string, Partial<FeedbackItem>]>([
    ['새 칸이 없는 BE', {}],
    ['새 BE(빈 목록·null)', { reasons: [], coveredBy: [], wantedServices: [], installDays: null }],
  ])('⑦-2 일반 피드백 상세에는 삭제 사유·설치 후 칸을 두지 않는다 — %s', async (_, shape) => {
    listFeedback.mockImplementation(async () => ({
      items: [makeFeedbackItem({ ...shape })], nextCursor: null,
    }))
    const user = userEvent.setup()
    renderPage()

    await user.click((await waitFor(() => rows()))[0])

    expect(screen.getByText('프롬프트')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '삭제 사유' })).not.toBeInTheDocument()
    expect(screen.queryByText('삭제 사유')).not.toBeInTheDocument()
    expect(screen.queryByText('설치 후')).not.toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument() // `&&` 가드가 빈 목록 길이 0을 그리는 실수
  })

  /** 설치 당일 삭제(0일)가 이 칸이 보여 줘야 할 대표 경우다 — 0을 "없음"으로 읽으면 가장 빠른 이탈이 사라진다. */
  it.each<[number | null, string]>([
    [0, '0일'],
    [null, '—'],
  ])('⑦-3 설치 후 경과일 %s → "%s"', async (installDays, shown) => {
    listFeedback.mockImplementation(async () => ({
      items: [uninstallItem({ installDays })], nextCursor: null,
    }))
    const user = userEvent.setup()
    renderPage()

    await user.click((await waitFor(() => rows()))[0])

    expect(screen.getByText('설치 후').nextElementSibling?.textContent).toBe(shown)
  })

  it('⑦-4 후속 선택을 고르지 않은 사유는 사유 이름만 보인다', async () => {
    listFeedback.mockImplementation(async () => ({
      items: [uninstallItem({ coveredBy: [], wantedServices: [] })], nextCursor: null,
    }))
    const user = userEvent.setup()
    renderPage()

    await user.click((await waitFor(() => rows()))[0])

    const list = screen.getByRole('list', { name: '삭제 사유' })
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent))
        .toEqual(['화면을 가려요', '쓰는 OTT가 없어요'])
  })

  it('⑥-3 사유 없이 한마디만 보낸 삭제 설문도 "삭제 설문"으로 갈라 보인다', async () => {
    listFeedback.mockImplementation(async () => ({
      items: [uninstallItem({ reasons: [], coveredBy: [], wantedServices: [], body: '그냥요' })],
      nextCursor: null,
    }))
    renderPage()

    const row = (await waitFor(() => rows()))[0]
    expect(within(row).getByText('삭제 설문')).toBeInTheDocument()
    expect(within(row).getByText('그냥요')).toBeInTheDocument()
  })

  /**
   * 관리 API는 값을 더하는 쪽으로 바뀌고 콘솔은 서버보다 늦게 나갈 수 있다. 서버가 먼저 늘린 사유·경로가
   * 빈칸으로 그려지면 운영자는 그런 값이 있는 줄도 모른다 — UNINSTALL이 처음 왔을 때 경로 칸이 그랬다.
   */
  it('⑧ 콘솔이 아직 모르는 코드는 비우지 않고 코드 그대로 보인다', async () => {
    listFeedback.mockImplementation(async () => ({
      items: [
        uninstallItem({
          reasons: ['NEW_REASON' as UninstallReason], coveredBy: [], wantedServices: [],
        }),
        makeFeedbackItem({ id: 13, body: '새 경로 피드백', trigger: 'NEW_TRIGGER' as FeedbackTrigger }),
      ],
      nextCursor: null,
    }))
    const user = userEvent.setup()
    renderPage()

    const [uninstallRow, newTriggerRow] = await waitFor(() => rows())
    expect(within(uninstallRow).getByText('NEW_REASON')).toBeInTheDocument()

    await user.click(newTriggerRow)
    expect(screen.getByText('NEW_TRIGGER', { selector: 'dd' })).toBeInTheDocument()
  })

  it('⑧-2 모르는 표면·카테고리·후속 선택 코드도 코드 그대로 보인다', async () => {
    listFeedback.mockImplementation(async () => ({
      items: [uninstallItem({
        surface: 'APP' as FeedbackSurface, category: 'OTHER' as FeedbackCategory,
        coveredBy: ['PIP' as CoveredElement], wantedServices: ['NETFLIX2' as WantedService],
      })],
      nextCursor: null,
    }))
    const user = userEvent.setup()
    renderPage()

    const row = (await waitFor(() => rows()))[0]
    expect(within(row).getByText('APP')).toBeInTheDocument()
    expect(within(row).getByText('OTHER')).toBeInTheDocument()

    await user.click(row)
    const list = screen.getByRole('list', { name: '삭제 사유' })
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '화면을 가려요 — 가린 것: PIP',
      '쓰는 OTT가 없어요 — 원하는 서비스: NETFLIX2',
    ])
  })

  /**
   * 라벨 표는 평범한 객체라 `constructor`·`__proto__` 같은 이름으로 찾으면 상속된 함수·객체가 나온다. 그것을
   * 그리려다 React가 던지면, 에러 경계가 없는 콘솔은 화면 전체가 부팅 오류로 바뀐다(main.tsx).
   */
  it('⑧-3 Object 기본 속성과 이름이 같은 코드도 화면을 깨뜨리지 않고 코드 그대로 보인다', async () => {
    listFeedback.mockImplementation(async () => ({
      items: [uninstallItem({
        reasons: ['constructor' as UninstallReason, '__proto__' as UninstallReason],
        coveredBy: [], wantedServices: [],
      })],
      nextCursor: null,
    }))
    const user = userEvent.setup()
    renderPage()

    const row = (await waitFor(() => rows()))[0]
    expect(within(row).getByText('constructor · __proto__')).toBeInTheDocument()

    await user.click(row)
    const list = screen.getByRole('list', { name: '삭제 사유' })
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent))
        .toEqual(['constructor', '__proto__'])
  })
})

describe('피드백 삭제가 겹칠 때', () => {
  /**
   * "삭제 중" 표시를 행 하나(id 한 칸)로만 들고 있으면, 먼저 끝난 삭제가 다른 행의 "삭제 중"까지 지운다. 그러면
   * 아직 지우는 중인 행의 버튼이 다시 켜져 같은 행에 DELETE가 두 번 나가고, 두 번째가 404("피드백을 찾을 수
   * 없습니다")로 돌아와 이미 성공한 삭제를 실패처럼 알린다.
   */
  it('⑨ 먼저 끝난 삭제가 아직 지우는 중인 다른 행의 버튼을 다시 켜지 않는다', async () => {
    const pending = new Map<number, () => void>()
    deleteFeedback.mockImplementation((id: number) => new Promise<void>((resolve) => {
      pending.set(id, resolve)
    }))
    listFeedback.mockImplementation(async () => ({
      items: [makeFeedbackItem({ id: 1, body: '첫째' }), makeFeedbackItem({ id: 2, body: '둘째' })],
      nextCursor: null,
    }))
    const user = userEvent.setup()
    renderPage()

    await user.click((await waitFor(() => rows()))[0])
    await user.click(screen.getByRole('button', { name: '삭제' }))
    await user.click(screen.getByRole('button', { name: '정말 삭제' })) // 1번 삭제 중

    await user.click(rows()[1]) // 2번을 펼친다(1번 상세는 닫힌다)
    await user.click(screen.getByRole('button', { name: '삭제' }))
    await user.click(screen.getByRole('button', { name: '정말 삭제' })) // 2번 삭제 중
    expect(deleteFeedback.mock.calls).toEqual([[1], [2]])

    await act(async () => { pending.get(1)?.() }) // 1번 응답이 먼저 온다

    await waitFor(() => expect(screen.queryByText('첫째')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled() // 2번은 아직 지우는 중
    await user.click(screen.getByRole('button', { name: '삭제' }))
    expect(deleteFeedback).toHaveBeenCalledTimes(2)
  })
})
