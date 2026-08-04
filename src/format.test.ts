import { describe, expect, it } from 'vitest'
import { actionLabel, formatKst, formatKstShort, formatKstTime, suspensionChip } from './format'

describe('formatKst 계열', () => {
  it('null은 대시로', () => {
    expect(formatKst(null)).toBe('—')
    expect(formatKstTime(null)).toBe('—')
    expect(formatKstShort(null)).toBe('—')
  })

  it('UTC ISO를 KST(+9)로 표기한다', () => {
    expect(formatKst('2026-08-04T13:00:00Z')).toContain('2026')
    expect(formatKst('2026-08-04T13:00:00Z')).toContain('22:00')
    expect(formatKstTime('2026-08-04T13:00:00Z')).toBe('22:00')          // 시안 큐 행 표기
    expect(formatKstShort('2026-08-04T13:00:00Z')).toBe('08-04 22:00')   // 시안 이력 행 표기
  })
})

describe('suspensionChip — lazy 만료를 화면이 계산해 정직하게 표기(시안 상태 칩)', () => {
  const now = new Date('2026-08-04T12:00:00Z')

  it('정지 아님 → 상태 그대로', () => {
    expect(suspensionChip('ACTIVE', null, now)).toBe('ACTIVE')
    expect(suspensionChip('WITHDRAWN', null, now)).toBe('WITHDRAWN')
  })

  it('until null → 무기한', () => {
    expect(suspensionChip('SUSPENDED', null, now)).toBe('SUSPENDED · 무기한')
  })

  it('만료 지난 정지 → 만료됨(자동 해제 대기)', () => {
    expect(suspensionChip('SUSPENDED', '2026-08-04T11:59:00Z', now))
        .toBe('SUSPENDED · 만료됨(자동 해제 대기)')
  })

  it('미래 만료 → ~MM-DD HH:mm', () => {
    expect(suspensionChip('SUSPENDED', '2026-08-05T13:00:00Z', now))
        .toBe('SUSPENDED · ~08-05 22:00')
  })
})

describe('actionLabel — 신고 종결의 결과까지 드러낸다(HP-268)', () => {
  it('종결은 결과를 함께 붙인다 — "신고 종결"만으론 무엇을 했는지 알 수 없다', () => {
    expect(actionLabel('RESOLVE_REPORT', 'BLIND')).toBe('신고 종결 · 가림')
    expect(actionLabel('RESOLVE_REPORT', 'SUSPEND')).toBe('신고 종결 · 정지')
    expect(actionLabel('RESOLVE_REPORT', 'NONE')).toBe('신고 종결 · 조치 없음')
  })

  it('기각은 "종결"이라는 말을 빼고 그 자체로 읽히게 한다', () => {
    expect(actionLabel('RESOLVE_REPORT', 'REJECTED')).toBe('신고 기각')
  })

  it('결과가 없는 옛 기록은 지어내지 않고 종결로만 둔다', () => {
    // 계측 이전에 쌓인 행 — 모르는 것을 그럴듯하게 채우면 이력을 근거로 한 판단이 틀어진다
    expect(actionLabel('RESOLVE_REPORT', null)).toBe('신고 종결')
  })

  it('종별이 곧 결과인 조치는 종전 라벨 그대로다', () => {
    expect(actionLabel('BLIND', null)).toBe('가림')
    expect(actionLabel('UNSUSPEND', null)).toBe('정지 해제')
    expect(actionLabel('REOPEN_REPORT', null)).toBe('신고 재오픈')
  })
})
