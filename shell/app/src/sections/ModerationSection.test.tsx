import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadProfile } from '@core/env'
import * as admin from '@moderation/api/admin'
import { makeSuspendedRow } from '@moderation/test/fixtures'
import ModerationSection from './ModerationSection'

// 틀의 머리줄(이름·역할·서버 전환·로그아웃)과 조치 화면의 권한 판정이 쓰는 것만 바꾼다 — 나머지 auth는 그대로.
vi.mock('@core/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@core/auth')>()),
  userName: () => '지호', roleLabel: () => 'admin', realmRoles: () => ['admin'],
  logout: vi.fn(), switchEnvironment: vi.fn(),
}))
vi.mock('@moderation/api/admin')

const PATH = '/moderation/dev/suspensions'
const WRITING_TITLE = '조치를 처리하는 중입니다 — 끝나면 이동할 수 있습니다'

beforeEach(() => {
  vi.clearAllMocks()
  loadProfile('DEV')
  window.history.replaceState(null, '', PATH)
  // 이 화면이 부르는 API는 모두 값을 정해 둔다 — 자동 목의 undefined는 잠금과 무관한 이유로 테스트를 흔든다.
  // 신고 큐(listReports)는 잠금이 풀린 채 메뉴를 누르면 열리는 화면이다.
  vi.mocked(admin.listIncidents).mockResolvedValue([])
  vi.mocked(admin.listReports).mockResolvedValue({ items: [], nextCursor: null })
  vi.mocked(admin.listSuspendedUsers).mockResolvedValue({ rows: [makeSuspendedRow({ userId: 9 })], total: 1 })
  vi.mocked(admin.searchUsers).mockResolvedValue({
    rows: [{ userId: 7, displayName: '검색된 사용자', profileImageUrl: null, status: 'ACTIVE' }],
  })
})

/**
 * 조치 쓰기가 도는 동안 틀의 이동 수단을 모두 잠근다(HP-300) — 페이지를 떠나면 조치 성패를 알릴 곳이 사라진다.
 *
 * <p>잠금의 모양은 Shell.test가 본다. 여기서는 조치 화면이 켠 쓰기 표시(useWriting)가 실제로 틀까지 닿는 배선
 * (ModerationFrame → Shell locked·UserSearch disabled)을 본다. 단독 앱 테스트가 지워진 뒤(HP-521) 이 배선을 끊어도
 * 전체 테스트가 통과했다(HP-592).
 */
describe('조치 구역 — 쓰기 중 이동 잠금(HP-300)', () => {
  it('정지 해제가 도는 동안 메뉴·서버 칩·로그아웃·사용자 검색과 열린 검색 결과를 막고, 끝나면 다시 연다', async () => {
    const user = userEvent.setup()
    let release!: () => void
    vi.mocked(admin.unsuspendUser).mockImplementation(() => new Promise((ok) => {
      release = () => ok({ userId: 9, status: 'ACTIVE', suspendedUntil: null, suspendReason: null })
    }))
    render(<ModerationSection path={PATH} />)

    // 검색 결과를 열어 둔 채로 해제를 건다 — 결과 목록은 바깥을 눌러도 닫히지 않아 쓰기 중에도 남는다.
    // 검색 버튼도 칸이 비면 늘 꺼져 있어, 검색어를 넣어 두어야 잠금으로 꺼지는지 볼 수 있다.
    const search = screen.getByRole('searchbox', { name: '사용자 검색' })
    await user.type(search, '스포')
    const searchButton = screen.getByRole('button', { name: '검색' })
    await user.click(searchButton)
    const result = await screen.findByRole('link', { name: /검색된 사용자/ })

    await user.click((await screen.findAllByRole('button', { name: '정지 해제' }))[0])
    await user.click(await screen.findByRole('button', { name: '해제 확인' }))

    const nav = screen.getByRole('navigation', { name: '콘솔 메뉴' })
    const brand = screen.getByRole('link', { name: /Re\s*plix/ })
    const links = [brand, ...within(nav).getAllByRole('link'), result]
    const controls = [
      screen.getByRole('combobox', { name: '연결 서버' }),
      screen.getByRole('button', { name: '로그아웃' }),
      search, searchButton,
    ]
    await waitFor(() => {
      for (const link of links) expect(link).toHaveAttribute('aria-disabled', 'true')
    })
    for (const control of controls) {
      expect(control).toBeDisabled()
      // 꺼진 이유도 함께 닿아야 한다 — 안내가 빠지면 운영자는 이유 없이 죽은 버튼을 본다.
      expect(control).toHaveAttribute('title', WRITING_TITLE)
    }

    // 잠긴 링크를 눌러도 화면과 주소가 그대로다 — aria-disabled만 보면 클릭 차단을 빼도 이 테스트가 초록으로 남는다.
    // 브랜드·메뉴·검색 결과는 클릭을 막는 곳이 서로 달라 하나씩 누른다. 꺼진 버튼은 눌러도 이벤트가 나가지 않으므로
    // 누르지 않고 위의 toBeDisabled로 본다.
    for (const link of [brand, within(nav).getByRole('link', { name: '신고 큐' }), result]) {
      await user.click(link)
      expect(window.location.pathname).toBe(PATH)
    }
    expect(screen.getByRole('region', { name: '정지 현황판' })).toBeInTheDocument()

    release()
    await waitFor(() => {
      for (const link of links) expect(link).not.toHaveAttribute('aria-disabled')
    })
    for (const control of controls) {
      expect(control).toBeEnabled()
      expect(control).not.toHaveAttribute('title', WRITING_TITLE)
    }
  })
})
