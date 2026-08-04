import { describe, expect, it } from 'vitest'
import { effectiveActions } from './actionHistory'
import { makeActionRow } from './test/fixtures'

/** BE는 id DESC(최신 먼저)로 준다 — 픽스처도 그 순서로 만든다. */
const ids = (rows: ReturnType<typeof makeActionRow>[]) => rows.map((r) => r.id)

describe('effectiveActions — 상쇄된 조치 쌍 숨기기(HP-268)', () => {
  it('가림 뒤 가림 해제가 오면 두 행이 함께 사라진다', () => {
    const rows = [
      makeActionRow({ id: 2, action: 'UNBLIND', targetType: 'MESSAGE', targetId: 'msg-1' }),
      makeActionRow({ id: 1, action: 'BLIND', targetType: 'MESSAGE', targetId: 'msg-1' }),
    ]
    // 순효과가 0이라 둘 다 숨긴다 — 한쪽만 남기면 "지금 가려져 있다/없다"를 거꾸로 읽게 된다
    expect(effectiveActions(rows)).toEqual([])
  })

  it('되돌려지지 않은 조치는 남는다', () => {
    const rows = [makeActionRow({ id: 1, action: 'BLIND', targetType: 'MESSAGE', targetId: 'msg-1' })]
    expect(ids(effectiveActions(rows))).toEqual([1])
  })

  it('상쇄 뒤 다시 건 조치는 마지막 것만 남는다', () => {
    const rows = [
      makeActionRow({ id: 3, action: 'BLIND', targetType: 'MESSAGE', targetId: 'msg-1' }),
      makeActionRow({ id: 2, action: 'UNBLIND', targetType: 'MESSAGE', targetId: 'msg-1' }),
      makeActionRow({ id: 1, action: 'BLIND', targetType: 'MESSAGE', targetId: 'msg-1' }),
    ]
    expect(ids(effectiveActions(rows))).toEqual([3])
  })

  it('정지↔해제 · 종결↔재오픈도 같은 규칙이다', () => {
    const rows = [
      makeActionRow({ id: 4, action: 'REOPEN_REPORT', targetType: 'REPORT', targetId: '11' }),
      makeActionRow({ id: 3, action: 'RESOLVE_REPORT', targetType: 'REPORT', targetId: '11' }),
      makeActionRow({ id: 2, action: 'UNSUSPEND', targetType: 'USER', targetId: '9' }),
      makeActionRow({ id: 1, action: 'SUSPEND', targetType: 'USER', targetId: '9' }),
    ]
    expect(effectiveActions(rows)).toEqual([])
  })

  it('대상이 다르면 상쇄되지 않는다', () => {
    const rows = [
      makeActionRow({ id: 2, action: 'UNBLIND', targetType: 'MESSAGE', targetId: 'msg-2' }),
      makeActionRow({ id: 1, action: 'BLIND', targetType: 'MESSAGE', targetId: 'msg-1' }),
    ]
    expect(ids(effectiveActions(rows))).toEqual([2, 1])
  })

  it('역조치가 없는 종류(SCORE_FIX)는 항상 남는다', () => {
    const rows = [
      makeActionRow({ id: 2, action: 'SCORE_FIX', targetType: 'MESSAGE', targetId: 'msg-1' }),
      makeActionRow({ id: 1, action: 'SCORE_FIX', targetType: 'MESSAGE', targetId: 'msg-1' }),
    ]
    expect(ids(effectiveActions(rows))).toEqual([2, 1])
  })

  it('짝이 없는 해제는 남긴다 — 창(50건) 밖으로 밀린 가림일 수 있어 없던 일로 만들지 않는다', () => {
    const rows = [makeActionRow({ id: 1, action: 'UNBLIND', targetType: 'MESSAGE', targetId: 'msg-1' })]
    expect(ids(effectiveActions(rows))).toEqual([1])
  })

  it('입력 순서(최신 먼저)를 그대로 유지한다', () => {
    const rows = [
      makeActionRow({ id: 5, action: 'SUSPEND', targetType: 'USER', targetId: '9' }),
      makeActionRow({ id: 4, action: 'UNBLIND', targetType: 'MESSAGE', targetId: 'msg-1' }),
      makeActionRow({ id: 3, action: 'SCORE_FIX', targetType: 'MESSAGE', targetId: 'msg-9' }),
      makeActionRow({ id: 2, action: 'BLIND', targetType: 'MESSAGE', targetId: 'msg-1' }),
      makeActionRow({ id: 1, action: 'BLIND', targetType: 'MESSAGE', targetId: 'msg-7' }),
    ]
    expect(ids(effectiveActions(rows))).toEqual([5, 3, 1])
  })

  it('빈 목록은 빈 목록이다', () => {
    expect(effectiveActions([])).toEqual([])
  })
})
