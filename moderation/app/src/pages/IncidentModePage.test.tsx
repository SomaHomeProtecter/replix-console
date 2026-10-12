import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import type { Incident } from '../api/types'
import { WritingProvider } from '@core/writing'
import IncidentModePage from './IncidentModePage'

vi.mock('../api/admin')
vi.mock('@core/auth', () => ({ realmRoles: () => ['admin'] }))

const incident: Incident = { id: 9, environment: 'DEV', reference: 'INC-9', title: '채팅 지연', severity: 'SEV2',
  status: 'INVESTIGATING', primary: true, impactSummary: '다수 사용자의 채팅이 지연되고 있습니다', ownerUserId: 77,
  nextUpdateAt: '2026-08-25T02:00:00Z', observationMetrics: null, successCriteria: null, monitoringEndsAt: null,
  recoveryRevisions: null, impactEndedAt: null, residualRisk: null, followUpJira: null, version: 2,
  createdByUserId: 3, createdAt: '2026-08-25T00:00:00Z', updatedAt: '2026-08-25T00:01:00Z',
  events: [{ id: 1, type: 'DECLARED', actorUserId: 3, summary: '지표를 확인해 장애를 선언합니다',
    sourceType: null, sourceId: null, structuredPayload: '{}', requestId: 'r1', occurredAt: '2026-08-25T00:00:00Z' }] }

beforeEach(() => { vi.clearAllMocks(); vi.mocked(admin.listIncidents).mockResolvedValue([{ ...incident, events: [] }]);
  vi.mocked(admin.getIncident).mockResolvedValue(incident) })

describe('Incident Mode 화면(HP-343)', () => {
  it('목록에서 primary 인시던트 상세와 불변 이벤트를 연다', async () => {
    const user = userEvent.setup(); render(<MemoryRouter><WritingProvider><IncidentModePage /></WritingProvider></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: '기능 제어 · 인시던트' })).toBeInTheDocument()
    await user.click(await screen.findByText('채팅 지연'))
    const detail = await screen.findByRole('complementary', { name: '인시던트 INC-9 상세' })
    expect(within(detail).getByText('다수 사용자의 채팅이 지연되고 있습니다')).toBeInTheDocument()
    expect(within(detail).getByText('선언', { selector: '.change-events strong' })).toBeInTheDocument() // 서버 값 DECLARED(HP-527)
  })

  it('현재 환경과 영향·사유를 확인하고 인시던트를 선언한다', async () => {
    const user = userEvent.setup(); vi.mocked(admin.declareIncident).mockResolvedValue(incident)
    render(<MemoryRouter><WritingProvider><IncidentModePage /></WritingProvider></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '인시던트 선언' }))
    const dialog = screen.getByRole('dialog'); await user.type(within(dialog).getByRole('textbox', { name: '인시던트 참조' }), 'INC-9')
    await user.type(within(dialog).getByRole('textbox', { name: '제목' }), '채팅 지연')
    await user.type(within(dialog).getByRole('textbox', { name: '현재 영향' }), '다수 사용자의 채팅이 지연되고 있습니다')
    await user.type(within(dialog).getByRole('textbox', { name: '선언 사유' }), '지표를 확인해 장애를 선언합니다')
    await user.click(within(dialog).getByRole('checkbox')); await user.click(within(dialog).getByRole('button', { name: '인시던트 선언' }))
    await waitFor(() => expect(admin.declareIncident).toHaveBeenCalledWith(expect.objectContaining({
      reference: 'INC-9', severity: 'SEV3', primary: true, impactSummary: '다수 사용자의 채팅이 지연되고 있습니다' })))
  })

  it('상태 전이 모달에서 관찰 지표와 성공 기준을 보낸다', async () => {
    const user = userEvent.setup(); const mitigating = { ...incident, status: 'MITIGATING' as const }
    vi.mocked(admin.listIncidents).mockResolvedValue([mitigating]); vi.mocked(admin.getIncident).mockResolvedValue(mitigating)
    vi.mocked(admin.transitionIncident).mockResolvedValue({ ...incident, status: 'MONITORING' })
    render(<MemoryRouter initialEntries={['/feature-control/incident-mode?selected=9']}><WritingProvider><IncidentModePage /></WritingProvider></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '상태 변경' })); const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: '관찰 지표' }), '채팅 오류율과 Ready 수')
    await user.type(within(dialog).getByRole('textbox', { name: '성공 기준' }), '오류율 1퍼센트 미만 유지')
    await user.type(within(dialog).getByLabelText('관찰 종료'), '2026-08-25T03:00')
    await user.type(within(dialog).getByRole('textbox', { name: '전이 사유' }), '완화 결과가 안정적인지 관찰합니다')
    await user.click(within(dialog).getByRole('button', { name: '상태 변경' }))
    await waitFor(() => expect(admin.transitionIncident).toHaveBeenCalledWith(9, expect.objectContaining({
      expectedVersion: 2, targetStatus: 'MONITORING', observationMetrics: '채팅 오류율과 Ready 수' })))
  })

  it('현재 상태에서 허용된 다음 단계만 보이고 완화 리소스를 연결한다', async () => {
    const user = userEvent.setup(); vi.mocked(admin.addIncidentEvent).mockResolvedValue({ ...incident, version: 3 })
    render(<MemoryRouter initialEntries={['/feature-control/incident-mode?selected=9']}><WritingProvider><IncidentModePage /></WritingProvider></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '상태 변경' })); let dialog = screen.getByRole('dialog')
    const options = within(dialog).getByRole('combobox', { name: '다음 상태' }).querySelectorAll('option')
    expect([...options].map((option) => option.textContent)).toEqual(['완화', '취소'])
    await user.click(within(dialog).getByRole('button', { name: '닫기' }))

    await user.click(screen.getByRole('button', { name: '리소스 연결' })); dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: '리소스 유형' }), 'PRESET')
    const presetSelect = within(dialog).getByRole('combobox', { name: '리소스 ID' })
    expect([...presetSelect.querySelectorAll('option')].map((option) => option.textContent))
      .toEqual(expect.arrayContaining([
        '외부 공개 콘텐츠 중지', '개인정보 전송 중지', '비디오 오버레이 최소화', 'Disney+ 격리',
      ]))
    await user.selectOptions(presetSelect, 'DISNEY_PLUS_ISOLATION')
    await user.type(within(dialog).getByRole('textbox', { name: '연결 사유' }), 'Disney+ 격리 프리셋을 완화 근거로 연결합니다')
    await user.click(within(dialog).getByRole('button', { name: '리소스 연결' }))
    await waitFor(() => expect(admin.addIncidentEvent).toHaveBeenCalledWith(9, expect.objectContaining({
      expectedVersion: 2, sourceType: 'PRESET', sourceId: 'DISNEY_PLUS_ISOLATION' })))
  })

  // 서버는 수정 요청의 nextUpdateAt을 그대로 덮어쓴다(Incident.update) — 칸이 비어 열리면 제목만 고쳐도 지워진다(HP-558).
  // 칸은 분 단위라 되돌려 만들면 초가 잘리므로, 손대지 않았으면 원래 값을 그대로 보내는지까지 본다.
  it('정보 수정 창은 다음 업데이트 시각을 지금 값으로 채워, 손대지 않고 저장하면 그 값을 바꾸지 않는다', async () => {
    const user = userEvent.setup(); vi.mocked(admin.updateIncident).mockResolvedValue({ ...incident, version: 3 })
    vi.mocked(admin.getIncident).mockResolvedValue({ ...incident, nextUpdateAt: '2026-08-25T02:00:45Z' })
    render(<MemoryRouter initialEntries={['/feature-control/incident-mode?selected=9']}><WritingProvider><IncidentModePage /></WritingProvider></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '정보 수정' })); const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText('다음 업데이트')).toHaveValue('2026-08-25T11:00') // 02:00Z = 한국 11:00
    await user.type(within(dialog).getByRole('textbox', { name: '수정 사유' }), '제목 오타만 고칩니다 — 영향은 그대로')
    await user.click(within(dialog).getByRole('button', { name: '정보 수정' }))
    await waitFor(() => expect(admin.updateIncident).toHaveBeenCalledWith(9, expect.objectContaining({
      nextUpdateAt: '2026-08-25T02:00:45Z' })))
  })
})

describe('인시던트 다이얼로그 — 처리 중 잠금(HP-528)', () => {
  async function openDeclareFilled(user: ReturnType<typeof userEvent.setup>) {
    render(<MemoryRouter><WritingProvider><IncidentModePage /></WritingProvider></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '인시던트 선언' }))
    const dialog = screen.getByRole('dialog', { name: '인시던트 선언' })
    await user.type(within(dialog).getByRole('textbox', { name: '인시던트 참조' }), 'INC-9')
    await user.type(within(dialog).getByRole('textbox', { name: '제목' }), '채팅 지연')
    await user.type(within(dialog).getByRole('textbox', { name: '현재 영향' }), '다수 사용자의 채팅이 지연되고 있습니다')
    await user.type(within(dialog).getByRole('textbox', { name: '선언 사유' }), '지표를 확인해 장애를 선언합니다')
    return dialog
  }

  it('보내는 동안 다시 눌러도 한 번만 보내고, Esc·취소로 닫히지 않는다', async () => {
    const user = userEvent.setup()
    let finish: (row: Incident) => void = () => {}
    vi.mocked(admin.declareIncident).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const dialog = await openDeclareFilled(user)
    const submit = within(dialog).getByRole('button', { name: '인시던트 선언' })
    await user.click(submit)
    await user.click(within(dialog).getByRole('button', { name: '선언 중…' }))
    await user.keyboard('{Escape}')
    expect(admin.declareIncident).toHaveBeenCalledTimes(1)
    expect(within(dialog).getByRole('button', { name: '취소' })).toBeDisabled()
    expect(screen.getByRole('dialog', { name: '인시던트 선언' })).toBeInTheDocument()
    finish(incident)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('실패 뒤 다시 보내도 같은 창의 요청은 같은 requestId로 남는다', async () => {
    const user = userEvent.setup()
    vi.mocked(admin.declareIncident).mockRejectedValueOnce(new Error('잠시 뒤 다시 시도하세요')).mockResolvedValueOnce(incident)
    const dialog = await openDeclareFilled(user)
    await user.click(within(dialog).getByRole('button', { name: '인시던트 선언' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('잠시 뒤 다시 시도하세요')
    await user.click(within(dialog).getByRole('button', { name: '인시던트 선언' }))
    await waitFor(() => expect(admin.declareIncident).toHaveBeenCalledTimes(2))
    const [first, second] = vi.mocked(admin.declareIncident).mock.calls.map(([request]) => request.requestId)
    expect(first).toBeTruthy()
    expect(second).toBe(first)
  })
})
