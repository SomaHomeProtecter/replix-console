import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { logout } from '@core/auth'
import { loadProfile } from '@core/env'
import * as admin from '@moderation/api/admin'
import { makeSuspendedRow } from '@moderation/test/fixtures'
import ModerationSection from './ModerationSection'

// 틀의 머리줄(이름·역할·로그아웃·서버 전환)과 조치 화면의 권한 판정이 쓰는 것만 바꾼다 — 나머지 auth는 그대로.
vi.mock('@core/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@core/auth')>()),
  userName: () => '지호', roleLabel: () => 'admin', realmRoles: () => ['admin'],
  logout: vi.fn(), switchEnvironment: vi.fn(),
}))
vi.mock('@moderation/api/admin')

const PATH = '/moderation/dev/suspensions'

beforeEach(() => {
  vi.clearAllMocks()
  loadProfile('DEV')
  window.history.replaceState(null, '', PATH)
})

/**
 * 조치 쓰기가 도는 동안 틀의 이동 수단을 모두 잠근다(HP-300) — 페이지를 떠나면 조치 성패를 알릴 곳이 사라진다.
 *
 * <p>잠금의 모양은 Shell.test가 본다. 여기서는 조치 화면이 켠 쓰기 표시(useWriting)가 실제로 틀까지 닿는 배선
 * (ModerationFrame → Shell locked·UserSearch disabled)을 본다. 단독 앱 테스트가 지워진 뒤(HP-521) 이 배선을 끊어도
 * 전체 테스트가 통과했다(HP-592).
 */
describe('조치 구역 — 쓰기 중 이동 잠금(HP-300)', () => {
  it('정지 해제가 도는 동안 메뉴·서버 칩·로그아웃·사용자 검색을 막고, 끝나면 다시 연다', async () => {
    const user = userEvent.setup()
    let release!: () => void
    vi.mocked(admin.listSuspendedUsers).mockResolvedValue({ rows: [makeSuspendedRow({ userId: 9 })], total: 1 })
    vi.mocked(admin.unsuspendUser).mockImplementation(() => new Promise((ok) => {
      release = () => ok({ userId: 9, status: 'ACTIVE', suspendedUntil: null, suspendReason: null })
    }))
    render(<ModerationSection path={PATH} />)

    // 검색 버튼은 칸이 비면 늘 꺼져 있다 — 검색어를 넣어 켜 두어야 잠금으로 꺼지는지 볼 수 있다.
    const search = screen.getByRole('searchbox', { name: '사용자 검색' })
    await user.type(search, '스포')
    const searchButton = screen.getByRole('button', { name: '검색' })
    expect(searchButton).toBeEnabled()

    await user.click((await screen.findAllByRole('button', { name: '정지 해제' }))[0])
    await user.click(await screen.findByRole('button', { name: '해제 확인' }))

    const nav = screen.getByRole('navigation', { name: '콘솔 메뉴' })
    const links = [screen.getByRole('link', { name: /Re\s*plix/ }), ...within(nav).getAllByRole('link')]
    const serverChip = screen.getByRole('combobox', { name: '연결 서버' })
    const logoutButton = screen.getByRole('button', { name: '로그아웃' })
    await waitFor(() => {
      for (const link of links) expect(link).toHaveAttribute('aria-disabled', 'true')
    })
    expect(serverChip).toBeDisabled()
    expect(logoutButton).toBeDisabled()
    expect(search).toBeDisabled()
    expect(searchButton).toBeDisabled()

    // 잠긴 링크를 눌러도 화면이 그대로다 — aria-disabled만 보면 클릭 차단을 빼도 이 테스트가 초록으로 남는다.
    await user.click(within(nav).getByRole('link', { name: '신고 큐' }))
    await user.click(logoutButton)
    expect(window.location.pathname).toBe(PATH)
    expect(screen.getByRole('region', { name: '정지 현황판' })).toBeInTheDocument()
    expect(logout).not.toHaveBeenCalled()

    release()
    await waitFor(() => {
      for (const link of links) expect(link).not.toHaveAttribute('aria-disabled')
    })
    expect(serverChip).toBeEnabled()
    expect(logoutButton).toBeEnabled()
    expect(search).toBeEnabled()
    expect(searchButton).toBeEnabled()
  })
})
