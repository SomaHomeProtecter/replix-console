import type { AdminActionRow, AdminActionType } from './api/types'

/** 한 사건이 여러 감사 행으로 남았을 때, 화면에 한 줄로 보여줄 묶음. */
export interface ActionEntry {
  /** 대표 행 — 대상 발췌를 가진 쪽(신고 종결). 시각·처리자도 여기서 읽는다. */
  row: AdminActionRow
  /** 같은 사건으로 묶인 정지 행. null이면 단독 행이다. */
  suspend: AdminActionRow | null
}

/** 콘솔이 정지→종결을 잇달아 호출하는 간격의 상한. 실측은 50ms 안팎이라 넉넉하다. */
const SAME_OPERATION_MS = 2_000

/**
 * 한 번의 "정지로 종결"이 남긴 두 행을 한 줄로 합친다(HP-268).
 *
 * <p><b>왜 숨기지 않고 합치나:</b> 콘솔의 정지 종결은 API를 두 번 호출한다(정지 → 종결). 둘 다
 * 정당한 감사 기록이라 로그에서 지울 수 없고, 한쪽만 숨기면 그 사실이 화면에서 사라진다.
 * 합치면 <b>두 사실이 한 줄에 다 남는다</b> — 계정을 정지했다는 것과 그것으로 어느 신고를
 * 닫았다는 것.
 *
 * <p><b>짝 판정:</b> 같은 관리자 + {@link SAME_OPERATION_MS} 이내 + 종결 결과가 SUSPEND.
 * 시각 근접에 기대는 판정이지만 <b>틀려도 정보가 사라지지 않는다</b> — 잘못 묶여도 두 사실이
 * 한 줄에 그대로 적히고, 안 묶이면 종전처럼 두 줄로 보일 뿐이다. 그래서 감사 화면에서도
 * 받아들일 수 있다. (서버가 상관 ID를 실어 주면 이 판정을 정확한 것으로 바꿀 수 있다 —
 * 표시 로직만 교체하면 되므로 그때 가서 해도 늦지 않다.)
 *
 * @param rows BE 순서(id DESC, 최신 먼저). 반환도 그 순서를 유지한다.
 */
export function mergeSuspendResolve(rows: AdminActionRow[]): ActionEntry[] {
  const consumed = new Set<number>()
  const entries: ActionEntry[] = []

  for (const row of rows) {
    if (consumed.has(row.id)) continue
    if (row.action !== 'RESOLVE_REPORT' || row.outcome !== 'SUSPEND') {
      entries.push({ row, suspend: null })
      continue
    }
    const pair = rows.find((candidate) => candidate.action === 'SUSPEND'
        && candidate.targetType === 'USER'
        && !consumed.has(candidate.id)
        && (candidate.adminName ?? '') === (row.adminName ?? '')
        && Math.abs(Date.parse(candidate.createdAt) - Date.parse(row.createdAt)) <= SAME_OPERATION_MS)
    if (pair) consumed.add(pair.id)
    entries.push({ row, suspend: pair ?? null })
  }
  return entries
}

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
/** 정지의 지금 효력을 말하는 행들 — 감사 상쇄가 아니라 계정의 현재 상태로 판정한다. */
function isSuspensionRow(row: AdminActionRow): boolean {
  if (row.targetType === 'USER' && (row.action === 'SUSPEND' || row.action === 'UNSUSPEND')) {
    return true
  }
  return row.action === 'RESOLVE_REPORT' && row.outcome === 'SUSPEND'
}

export function effectiveActions(
  rows: AdminActionRow[], suspensionActive: boolean,
): AdminActionRow[] {
  const cancelled = new Set<number>()

  // 정지 계열은 별도 규칙이다(HP-268). 정지는 만료 배치가 없는 lazy 설계라 기간이 지나 자동으로
  // 풀려도 해제 행이 생기지 않는다 — 상쇄만 보면 만료된 정지가 영영 "적용 중"으로 남는다.
  // 그래서 계정이 지금 정지 중인지로 판정한다: 아니면 정지 계열을 전부 빼고, 맞으면 현재 걸린
  // 정지(가장 최근 SUSPEND) 이후만 남긴다 — 그 이전 정지·해제는 이미 지난 일이다.
  const suspensionRows = rows.filter(isSuspensionRow)
  if (!suspensionActive) {
    suspensionRows.forEach((row) => cancelled.add(row.id))
  } else {
    const activeFrom = Math.max(
        ...rows.filter((r) => r.action === 'SUSPEND' && r.targetType === 'USER').map((r) => r.id),
        -Infinity)
    suspensionRows.filter((row) => row.id < activeFrom).forEach((row) => cancelled.add(row.id))
  }
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
