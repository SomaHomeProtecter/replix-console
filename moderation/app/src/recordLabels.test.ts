import { describe, expect, it } from 'vitest'
import { caseEventLabel, changeSetEventLabel, incidentEventLabel, noticeEventLabel } from './recordLabels'

describe('기록 이름 한글 표(HP-527)', () => {
  it('서버 enum 값을 한글로 바꾼다', () => {
    expect(changeSetEventLabel('AUTO_ROLLBACK_TRIGGERED')).toBe('자동 롤백 시작')
    expect(noticeEventLabel('PUBLISHED')).toBe('게시')
    expect(incidentEventLabel('RESOURCE_LINKED')).toBe('리소스 연결')
    expect(caseEventLabel('HANDOFF_ADDED')).toBe('인수인계')
  })

  it('모르는 값은 원문을 그대로 보인다 — 서버가 먼저 늘려도 화면이 깨지지 않는다', () => {
    expect(incidentEventLabel('ESCALATED')).toBe('ESCALATED')
  })
})
