import { describe, expect, it } from 'vitest'
import { mergeSuspendResolve } from './actionHistory'
import { makeActionRow } from './test/fixtures'

/** 콘솔의 정지 종결은 정지 → 종결을 잇달아 호출한다(실측 간격 50ms 안팎). */
const suspendRow = (over = {}) => makeActionRow({
  id: 49, action: 'SUSPEND', targetType: 'USER', targetId: '9', reason: '도배',
  adminName: '지호', createdAt: '2026-08-05T03:48:39.844Z', ...over,
})
const resolveRow = (over = {}) => makeActionRow({
  id: 50, action: 'RESOLVE_REPORT', outcome: 'SUSPEND', targetType: 'REPORT',
  targetId: '26', targetSummary: '욕설 내용', reason: '정지 처리함',
  adminName: '지호', createdAt: '2026-08-05T03:48:39.891Z', ...over,
})

describe('mergeSuspendResolve — 한 번의 정지 종결을 한 줄로(HP-268)', () => {
  it('정지와 종결이 한 사건이면 한 줄로 묶는다', () => {
    const entries = mergeSuspendResolve([resolveRow(), suspendRow()])

    expect(entries).toHaveLength(1)
    expect(entries[0].row.action).toBe('RESOLVE_REPORT') // 대표 = 대상 발췌를 가진 쪽
    expect(entries[0].suspend?.id).toBe(49)             // 정지 사실도 함께 남는다
  })

  it('정지 해제는 그대로 제 줄을 갖는다 — 짝이 없다', () => {
    const entries = mergeSuspendResolve([
      makeActionRow({ id: 51, action: 'UNSUSPEND', targetType: 'USER', targetId: '9' }),
      resolveRow(), suspendRow(),
    ])

    expect(entries).toHaveLength(2)
    expect(entries[0].row.action).toBe('UNSUSPEND')
    expect(entries[0].suspend).toBeNull()
  })

  it('신고 없이 직접 정지한 건은 묶이지 않는다 — 짝이 될 종결이 없다', () => {
    const entries = mergeSuspendResolve([suspendRow()])

    expect(entries).toHaveLength(1)
    expect(entries[0].row.action).toBe('SUSPEND')
    expect(entries[0].suspend).toBeNull()
  })

  it('시간이 멀면 다른 사건이다 — 나중에 따로 종결한 것까지 묶지 않는다', () => {
    const entries = mergeSuspendResolve([
      resolveRow({ createdAt: '2026-08-05T05:00:00.000Z' }),
      suspendRow({ createdAt: '2026-08-05T03:48:39.844Z' }),
    ])

    expect(entries).toHaveLength(2)
    expect(entries[0].suspend).toBeNull()
  })

  it('관리자가 다르면 묶지 않는다 — 서로 다른 사람의 조치다', () => {
    const entries = mergeSuspendResolve([resolveRow(), suspendRow({ adminName: '현빈' })])

    expect(entries).toHaveLength(2)
    expect(entries[0].suspend).toBeNull()
  })

  it('가림으로 종결한 건은 묶을 정지가 없어 그대로다', () => {
    const entries = mergeSuspendResolve([resolveRow({ outcome: 'BLIND' }), suspendRow()])

    expect(entries).toHaveLength(2)
    expect(entries[0].suspend).toBeNull()
  })

  it('정지 두 건이 각각 종결됐으면 짝이 하나씩만 소비된다', () => {
    const entries = mergeSuspendResolve([
      resolveRow({ id: 60, targetId: '30', createdAt: '2026-08-05T04:00:00.100Z' }),
      suspendRow({ id: 59, createdAt: '2026-08-05T04:00:00.000Z' }),
      resolveRow({ id: 50, createdAt: '2026-08-05T03:48:39.891Z' }),
      suspendRow({ id: 49, createdAt: '2026-08-05T03:48:39.844Z' }),
    ])

    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.suspend?.id)).toEqual([59, 49])
  })

  it('빈 목록은 빈 목록이다', () => {
    expect(mergeSuspendResolve([])).toEqual([])
  })
})
