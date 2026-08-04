import { describe, expect, it } from 'vitest'
import { formatKst, suspensionLabel } from './format'

describe('formatKst', () => {
  it('null은 대시로', () => {
    expect(formatKst(null)).toBe('—')
  })

  it('UTC ISO를 KST(+9)로 표기한다', () => {
    const text = formatKst('2026-08-04T13:00:00Z')
    expect(text).toContain('2026')
    expect(text).toContain('22:00')
  })
})

describe('suspensionLabel — lazy 만료를 화면이 계산해 정직하게 표기(정본)', () => {
  const now = new Date('2026-08-04T12:00:00Z')

  it('정지 아님 → null', () => {
    expect(suspensionLabel('ACTIVE', null, now)).toBeNull()
    expect(suspensionLabel('WITHDRAWN', null, now)).toBeNull()
  })

  it('until null → 무기한', () => {
    expect(suspensionLabel('SUSPENDED', null, now)).toBe('무기한 정지')
  })

  it('만료 지난 정지 → 만료됨(자동 해제 대기)', () => {
    expect(suspensionLabel('SUSPENDED', '2026-08-04T11:59:00Z', now))
        .toBe('정지 만료됨(다음 활동 시 자동 해제)')
  })

  it('미래 만료 → 만료 시각까지 정지', () => {
    const label = suspensionLabel('SUSPENDED', '2026-08-05T13:00:00Z', now)
    expect(label).toContain('까지 정지')
    expect(label).toContain('22:00')
  })
})
