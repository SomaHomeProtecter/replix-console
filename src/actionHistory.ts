import type { AdminActionRow, AdminActionType } from './api/types'

/**
 * 역조치 → 그것이 되돌리는 조치. 여기 없는 종류(SCORE_FIX)는 되돌릴 방법이 없어 항상 유효하다.
 */
const REVERSES: Partial<Record<AdminActionType, AdminActionType>> = {
  UNBLIND: 'BLIND',
  UNSUSPEND: 'SUSPEND',
  REOPEN_REPORT: 'RESOLVE_REPORT',
}

/** 같은 대상에 걸린 같은 계열의 조치끼리만 상쇄한다 — 대상이 다르면 남남이다. */
function pairKey(row: AdminActionRow, forward: AdminActionType): string {
  return `${row.targetType}:${row.targetId}:${forward}`
}

/**
 * 효과가 지금도 살아 있는 조치만 남긴다(HP-268).
 *
 * <p><b>왜 필요한가:</b> 조치 이력은 감사 기록이라 되돌린 조치도 지우지 않고 쌓는다. 그래서 가림 →
 * 가림 해제를 한 번씩만 해도 행이 2개 늘고, 받은 신고 1건에 조치 이력이 2건이 되어 실제 제재보다
 * 길어 보인다(2026-08-05 E2E 지적). 이 함수는 "지금 무엇이 걸려 있나"를 볼 때 쓰는 보조 뷰다 —
 * 기본 화면은 여전히 전량이고, 원본을 바꾸지 않는다.
 *
 * <p><b>규칙:</b> 오래된 것부터 훑어 역조치(UNBLIND·UNSUSPEND·REOPEN_REPORT)를 만나면 같은 대상의
 * 아직 살아 있는 정조치와 짝지어 <b>둘 다</b> 숨긴다(순효과 0). 한쪽만 남기면 "가려져 있다/없다"를
 * 거꾸로 읽게 된다. 짝을 못 찾은 역조치는 남긴다 — 조치 이력 창(50건)이 잘려 정조치가 밖으로
 * 밀렸을 수 있어, 실제로 일어난 일을 없던 것으로 만들면 안 된다.
 *
 * @param rows BE가 준 순서(id DESC, 최신 먼저). 반환도 그 순서를 유지한다.
 */
export function effectiveActions(rows: AdminActionRow[]): AdminActionRow[] {
  const cancelled = new Set<number>()
  /** 아직 되돌려지지 않은 정조치들의 id — 대상+계열별 스택(가장 최근 것부터 짝지운다). */
  const open = new Map<string, number[]>()

  // 상쇄는 시간 순서에 의존하므로 오래된 것부터 본다(입력은 최신 먼저).
  for (const row of [...rows].sort((a, b) => a.id - b.id)) {
    const forward = REVERSES[row.action]
    if (forward === undefined) {
      // 정조치(또는 SCORE_FIX처럼 역이 없는 것) — 되돌릴 대상으로 쌓아 둔다.
      const key = pairKey(row, row.action)
      const stack = open.get(key)
      if (stack) {
        stack.push(row.id)
      } else {
        open.set(key, [row.id])
      }
      continue
    }
    const stack = open.get(pairKey(row, forward))
    const target = stack?.pop()
    if (target !== undefined) {
      cancelled.add(target)
      cancelled.add(row.id)
    }
  }

  return rows.filter((row) => !cancelled.has(row.id))
}
