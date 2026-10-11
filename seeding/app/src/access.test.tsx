import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/*
 * 권한 없음 안내의 역할 목록은 콘솔 역할 표(core/roles.ts CAPABILITIES.view)에서 만든다(HP-523에서 넘어온 항목, HP-525).
 * 표에 시험용 역할을 하나 더해, 안내가 표를 따라가는지 본다 — 글자로 적어 두면 이 역할이 안내에 나오지 않는다.
 * 들어올 수 있는지의 판정(can)은 실제 표 그대로다.
 */
vi.mock('@core/roles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/roles')>()
  const view = { ...actual.CAPABILITIES.view, roles: [...actual.CAPABILITIES.view.roles, 'seeding_test_viewer'] }
  return { ...actual, CAPABILITIES: { ...actual.CAPABILITIES, view } }
})

import { SeedingWorkspace } from './App'
import { bindHost } from './host'

describe('시딩 권한 없음 안내 — 역할 목록은 콘솔 역할 표에서 만든다', () => {
  it('보기 역할이 없는 계정에 표의 보기 역할을 모두 안내한다', () => {
    bindHost({ user: { name: '조현빈', sub: 'u-1', roles: ['feature_flag_operator'] }, token: async () => 'console-token', logout: vi.fn(), confirmProductionWrite: vi.fn(async () => undefined) })
    render(<SeedingWorkspace view="work" />)

    expect(screen.getByRole('heading', { name: '이 계정에는 시딩 권한이 없습니다' })).toBeInTheDocument()
    expect(screen.getByText(/관리자 역할\(admin, moderation_operator, admin_console_viewer, seeding_test_viewer 중 하나\)이 없습니다/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다른 계정으로 로그인' })).toBeInTheDocument()
  })
})
