import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '../api/admin'
import type { IncidentTimeline } from '../api/types'
import IncidentTimelinePage from './IncidentTimelinePage'

vi.mock('../api/admin')

const timeline: IncidentTimeline = {
  incidentReference: 'INC 42/CHAT', environment: 'DEV', jiraReferences: ['HP-343'], sourceCount: 2,
  entries: [
    { sourceType: 'CHANGE_SET', sourceId: 17, sourceTitle: '[프리셋] 채팅 차단',
      sourceStatus: 'SUCCEEDED', eventType: 'APPLIED', reason: '장애 확산 차단', actorUserId: 3,
      occurredAt: '2026-08-24T00:00:00Z', jiraReference: 'HP-343', presetId: 'CHAT_BLOCK',
      linkedChangeSetId: null, revisions: [{ flagKey: 'chat.message.send.enabled',
        expectedRevision: 4, appliedRevision: 5 }] },
    { sourceType: 'NOTICE', sourceId: 8, sourceTitle: '채팅 장애 안내', sourceStatus: 'PUBLISHED',
      eventType: 'PUBLISHED', reason: '사용자 공지 게시', actorUserId: 4,
      occurredAt: '2026-08-24T00:01:00Z', jiraReference: 'HP-343', presetId: 'CHAT_BLOCK',
      linkedChangeSetId: 17, revisions: [] },
  ],
}

beforeEach(() => { vi.clearAllMocks(); vi.mocked(admin.getIncidentTimeline).mockResolvedValue(timeline) })

describe('인시던트 통합 타임라인(HP-343)', () => {
  it('변경 세트와 공지, 프리셋, revision을 하나의 시간순 목록으로 보여준다', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><IncidentTimelinePage /></MemoryRouter>)
    await user.type(screen.getByRole('textbox', { name: '인시던트 참조' }), '  INC 42/CHAT  ')
    await user.click(screen.getByRole('button', { name: '타임라인 조회' }))

    await waitFor(() => expect(admin.getIncidentTimeline).toHaveBeenCalledWith('INC 42/CHAT'))
    const list = screen.getByRole('list')
    expect(within(list).getByText('변경 세트')).toBeInTheDocument()
    expect(within(list).getByText('사용자 공지')).toBeInTheDocument()
    expect(within(list).getAllByText('프리셋 CHAT_BLOCK')).toHaveLength(2)
    expect(within(list).getByText('r4 → r5')).toBeInTheDocument()
    expect(within(list).getAllByRole('link', { name: /변경 세트 #17/ })).toHaveLength(2)
  })

  it('빈 참조는 API를 호출하지 않고 안내한다', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><IncidentTimelinePage /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: '타임라인 조회' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('인시던트 참조를 입력하세요')
    expect(admin.getIncidentTimeline).not.toHaveBeenCalled()
  })
})
