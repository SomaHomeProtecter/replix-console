import { describe, expect, it } from 'vitest'
import { formatKst, formatKstShort, formatKstTime, isoToKstInput, kstInputToIso } from './time'

describe('formatKst 계열', () => {
  /**
   * 읽을 수 없는 시각도 던지지 않고 대시로 눕는다(2026-08-11 4차 리뷰). Intl.DateTimeFormat은
   * Invalid Date에 RangeError를 던지는데, 이 함수들은 큐 행 렌더 안에서 불리므로 <b>깨진 신고
   * 한 건이 큐 화면 전체를 날린다</b>. 같은 칸의 경과 뱃지에 넣어 둔 '모르면 —' 가드도 이것
   * 때문에 한 번도 실행되지 않았다 — formatKst가 먼저 평가돼 터진다.
   */
  it('읽을 수 없는 시각도 던지지 않고 대시로 눕는다', () => {
    expect(formatKst('깨진값')).toBe('—')
    expect(formatKstTime('깨진값')).toBe('—')
    expect(formatKstShort('깨진값')).toBe('—')
  })

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

/**
 * 날짜·시각 입력 칸 ↔ 저장값(HP-516). 칸은 <b>한국 시각</b>이다 — 이 콘솔은 모든 시각을 한국 시각으로
 * 보여 주므로 입력도 같은 기준이어야 한다. 브라우저 시간대에 기대지 않으니 테스트 머신의 TZ와도 무관하다.
 */
describe('날짜·시각 입력 칸 변환', () => {
  it('칸의 값을 한국 시각으로 읽어 UTC ISO로 바꾼다', () => {
    expect(kstInputToIso('2026-10-12T10:00')).toBe('2026-10-12T01:00:00.000Z')
  })

  it('저장값을 칸에 넣으면 같은 한국 시각이 보인다', () => {
    expect(isoToKstInput('2026-10-12T01:00:00.000Z')).toBe('2026-10-12T10:00')
    // 날짜 경계 — UTC로는 전날 15시가 한국 시각 자정이다
    expect(isoToKstInput('2026-10-11T15:00:00Z')).toBe('2026-10-12T00:00')
  })

  it('저장 → 표시 → 저장 왕복에서 값이 바뀌지 않는다', () => {
    const saved = '2026-12-31T14:59:00.000Z'
    expect(kstInputToIso(isoToKstInput(saved))).toBe(saved)
  })

  it('빈 값·읽을 수 없는 값은 비운다', () => {
    expect(kstInputToIso('')).toBeNull()
    expect(kstInputToIso('깨진값')).toBeNull()
    expect(isoToKstInput(null)).toBe('')
    expect(isoToKstInput('깨진값')).toBe('')
  })
})
