import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import UserSearch from './UserSearch'

vi.mock('../api/admin')

const result = {
  userId: 42,
  displayName: '검색된 사용자',
  profileImageUrl: null,
  status: 'ACTIVE' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('사용자 검색(HP-301) — 세 검색 축으로 상세에 바로 진입한다', () => {
  it.each([
    ['ID 정확 일치', '42'],
    ['닉네임 부분 일치', '검색된'],
    ['이메일 정확 일치', 'operator@example.com'],
  ])('%s 검색어를 서버에 보내고 결과를 상세 링크로 만든다', async (_axis, query) => {
    const user = userEvent.setup()
    vi.mocked(admin.searchUsers).mockResolvedValue({ rows: [result] })
    render(<MemoryRouter><UserSearch disabled={false} /></MemoryRouter>)

    await user.type(screen.getByRole('searchbox', { name: '사용자 검색' }), query)
    await user.click(screen.getByRole('button', { name: '검색' }))

    expect(admin.searchUsers).toHaveBeenCalledWith(query)
    const link = await screen.findByRole('link', { name: /검색된 사용자/ })
    expect(link).toHaveAttribute('href', '/users/42')
  })

  it('검색 결과가 없으면 빈 상태를 명시한다', async () => {
    const user = userEvent.setup()
    vi.mocked(admin.searchUsers).mockResolvedValue({ rows: [] })
    render(<MemoryRouter><UserSearch disabled={false} /></MemoryRouter>)

    await user.type(screen.getByRole('searchbox', { name: '사용자 검색' }), '없는 사용자')
    await user.click(screen.getByRole('button', { name: '검색' }))

    expect(await screen.findByText('검색 결과가 없습니다')).toBeInTheDocument()
  })

  it('빈 검색어로 전체 회원 목록을 요청하지 않는다', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><UserSearch disabled={false} /></MemoryRouter>)

    const input = screen.getByRole('searchbox', { name: '사용자 검색' })
    await user.type(input, '   ')
    await user.keyboard('{Enter}')

    expect(admin.searchUsers).not.toHaveBeenCalled()
    expect(screen.queryByText('검색 결과가 없습니다')).not.toBeInTheDocument()
  })

  /**
   * 정지는 만료 배치가 없어 기간이 지나도 status가 SUSPENDED로 남는다(HP-598). 배지가 '정지'로만 보이면
   * 운영자는 검색 목록만 보고 이미 풀린 계정을 아직 정지 중이라고 읽는다.
   */
  it('정지 배지는 기간이 지난 정지를 만료됨으로 구분한다', async () => {
    const user = userEvent.setup()
    vi.mocked(admin.searchUsers).mockResolvedValue({
      rows: [
        { ...result, userId: 1, displayName: '지난 정지', status: 'SUSPENDED', suspendedUntil: '2020-01-01T00:00:00Z' },
        { ...result, userId: 2, displayName: '걸린 정지', status: 'SUSPENDED', suspendedUntil: '2126-01-01T00:00:00Z' },
        // 만료 시각을 보내지 않는 서버(HP-598 배포 전) — 만료를 단정하지 않는다
        { ...result, userId: 3, displayName: '옛 서버 정지', status: 'SUSPENDED' },
      ],
    })
    render(<MemoryRouter><UserSearch disabled={false} /></MemoryRouter>)

    await user.type(screen.getByRole('searchbox', { name: '사용자 검색' }), '정지')
    await user.click(screen.getByRole('button', { name: '검색' }))

    const badge = (name: RegExp) => screen.getByRole('link', { name }).querySelector('.user-search-status')
    await screen.findByRole('link', { name: /지난 정지/ })
    expect(badge(/지난 정지/)).toHaveTextContent(/^정지 · 만료됨$/)
    expect(badge(/걸린 정지/)).toHaveTextContent(/^정지$/)
    expect(badge(/옛 서버 정지/)).toHaveTextContent(/^정지$/)
  })
})
