import { describe, expect, it } from 'vitest'
import {
  actionLabel, elapsedSince, formatKst, formatKstShort, formatKstTime, suspensionChip,
} from './format'

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
    expect(actionLabel('RESOLVE_REPORT', 'BLIND')).toBe('가림 · 신고 종결')
    expect(actionLabel('RESOLVE_REPORT', 'SUSPEND')).toBe('정지 · 신고 종결')
    expect(actionLabel('RESOLVE_REPORT', 'NONE')).toBe('조치 없음 · 신고 종결')
  })

  it('기각도 예외 없이 붙인다 — 네 결과가 같은 모양이라야 세로로 훑힌다', () => {
    expect(actionLabel('RESOLVE_REPORT', 'REJECTED')).toBe('기각 · 신고 종결')
  })

  it('결과가 없는 옛 기록은 지어내지 않고 종결로만 둔다', () => {
    // 계측 이전에 쌓인 행 — 모르는 것을 그럴듯하게 채우면 이력을 근거로 한 판단이 틀어진다
    expect(actionLabel('RESOLVE_REPORT', null)).toBe('신고 종결')
  })

  it('종별이 곧 결과인 조치는 종전 라벨 그대로다', () => {
    expect(actionLabel('BLIND', null)).toBe('가림')
    expect(actionLabel('SUSPEND', null)).toBe('정지') // 이력 안에선 대상이 이미 그 사용자
    expect(actionLabel('UNSUSPEND', null)).toBe('정지 해제')
    expect(actionLabel('REOPEN_REPORT', null)).toBe('신고 재오픈')
  })
})

/**
 * 큐 행의 시각이 HH:mm뿐이라 3일 묵은 건과 방금 건이 같아 보인다(HP-296). 경과를 뱃지로 세워
 * 목록만 보고 급한 것을 고르게 한다. 톤 경계는 24시간·48시간이다.
 */
describe('elapsedSince — 큐 행의 대기 시간 뱃지(HP-296)', () => {
  const now = new Date('2026-08-11T12:00:00Z')

  it('1시간 미만은 방금으로 뭉갠다 — 분 단위는 큐 판단에 쓰이지 않는다', () => {
    expect(elapsedSince('2026-08-11T11:30:00Z', now)).toEqual({ label: '방금', tone: 'fresh' })
  })

  it('하루 안쪽은 시간 단위', () => {
    expect(elapsedSince('2026-08-11T09:00:00Z', now)).toEqual({ label: '3시간', tone: 'fresh' })
  })

  it('23:59는 아직 fresh — 경계 바로 앞', () => {
    expect(elapsedSince('2026-08-10T12:01:00Z', now)).toEqual({ label: '23시간', tone: 'fresh' })
  })

  it('24:00부터 warm — 하루를 넘긴 신고는 눈에 걸려야 한다', () => {
    expect(elapsedSince('2026-08-10T12:00:00Z', now)).toEqual({ label: '1일', tone: 'warm' })
  })

  it('48:00부터 hot', () => {
    expect(elapsedSince('2026-08-09T12:00:00Z', now)).toEqual({ label: '2일', tone: 'hot' })
  })

  it('미래 시각(시계 어긋남)도 음수로 새지 않는다 — 방금으로 둔다', () => {
    expect(elapsedSince('2026-08-11T12:30:00Z', now)).toEqual({ label: '방금', tone: 'fresh' })
  })

  /**
   * 읽을 수 없는 시각은 <b>모른다고 말한다</b>. NaN은 모든 비교가 false라 조용히 '방금'으로
   * 떨어지는데, 그건 "방금 들어온 급하지 않은 건"이라는 <b>틀린 사실을 단언</b>하는 것이다 —
   * 하필 데이터가 깨진 그 행이 큐에서 가장 안전해 보이게 된다. 모르면 모른다고 적는다.
   */
  it('읽을 수 없는 시각은 모른다고 말한다 — 방금이라고 하지 않는다', () => {
    expect(elapsedSince('깨진값', now)).toEqual({ label: '—', tone: 'fresh' })
    expect(elapsedSince('', now)).toEqual({ label: '—', tone: 'fresh' })
  })
})
