import { describe, expect, it } from 'vitest'
import {
  actionLabel, elapsedSince, formatKst, formatKstShort, formatKstTime, reporterTrustLine,
  suspensionChip,
} from './format'

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

describe('reporterTrustLine — 신고자 신뢰도 한 줄(HP-270)', () => {
  it('판정분을 분모로 기각률을 낸다 — 분모를 문구에 함께 적는다', () => {
    expect(reporterTrustLine({ total: 12, judged: 10, rejected: 3 }))
        .toBe('보낸 신고 12건 · 기각 3건 (판정 10건 중 30%)')
  })

  /**
   * 판정이 0건이면 기각률은 <b>모르는 것</b>이지 0%가 아니다. 0%로 적으면 "이 사람 신고는
   * 다 타당하다"는 뜻이 되는데, 실제로는 아직 아무도 안 봤다는 뜻이다 — 정반대다.
   * 막 20건을 쏟아부어 큐에 쌓인 신고자가 여기 해당한다.
   */
  it('판정 전이면 0%가 아니라 판정 전이라고 말한다', () => {
    expect(reporterTrustLine({ total: 20, judged: 0, rejected: 0 }))
        .toBe('보낸 신고 20건 · 판정 전')
  })

  it('보낸 적이 없으면 비율을 만들지 않는다', () => {
    expect(reporterTrustLine({ total: 0, judged: 0, rejected: 0 })).toBe('보낸 신고 없음')
  })

  it('전부 타당했으면 0%로 적는다 — 판정이 있었으므로 아는 값이다', () => {
    expect(reporterTrustLine({ total: 5, judged: 5, rejected: 0 }))
        .toBe('보낸 신고 5건 · 기각 0건 (판정 5건 중 0%)')
  })

  /**
   * admin-ui는 BE와 따로 배포되고 main.tsx에 에러 경계가 없다 — 구버전 BE 응답에 이 칸이
   * 없으면 TypeError가 사용자 상세 화면을 통째로 날린다(2026-08-11 자체 리뷰).
   */
  it('집계가 아예 없어도 화면을 죽이지 않는다', () => {
    expect(reporterTrustLine(undefined)).toBe('보낸 신고 —')
  })

  it('나누어떨어지지 않으면 반올림한다', () => {
    expect(reporterTrustLine({ total: 3, judged: 3, rejected: 1 }))
        .toBe('보낸 신고 3건 · 기각 1건 (판정 3건 중 33%)')
  })
})
