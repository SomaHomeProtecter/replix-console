import { describe, expect, it } from 'vitest'
import { formatKst, formatKstShort, formatKstTime, suspensionChip } from './format'

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
