import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import type { Incident } from '../api/types'
import IncidentPrimaryBanner from './IncidentPrimaryBanner'

vi.mock('../api/admin')
const incident = { id: 9, reference: 'INC-9', title: '채팅 지연', severity: 'SEV2', status: 'MITIGATING', primary: true } as Incident
beforeEach(() => { vi.clearAllMocks(); vi.mocked(admin.listIncidents).mockResolvedValue([incident]) })

it('활성 primary 인시던트를 모든 화면에서 열 수 있는 배너로 표시한다', async () => {
  render(<MemoryRouter><IncidentPrimaryBanner /></MemoryRouter>)
  expect(await screen.findByText('SEV2 · INC-9')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '인시던트 열기' }))
    .toHaveAttribute('href', '/feature-control/incident-mode?selected=9')
})
