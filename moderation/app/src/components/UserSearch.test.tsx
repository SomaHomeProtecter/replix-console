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
})
