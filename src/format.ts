import type {
  AdminActionType, ReportReason, ReportsSent, ReportStatus, ResolutionAction, ResolveOutcome,
  SuspendDuration, UserStatus,
} from './api/types'

const KST_FULL = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
})

/**
 * 읽을 수 있는 시각이면 Date, 아니면 null.
 *
 * <p>Intl.DateTimeFormat은 Invalid Date에 <b>RangeError를 던진다</b> — 아래 함수들은 큐 행·이력
 * 행 렌더 안에서 불리므로, 깨진 신고 <b>한 건이 그 화면 전체를 날린다</b>. 값 하나가 이상한 것과
 * 화면이 안 뜨는 것은 심각도가 다르다(4차 리뷰).
 */
function kstDate(iso: string | null): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

function kstParts(d: Date): Record<string, string> {
  const parts: Record<string, string> = {}
  for (const p of KST_FULL.formatToParts(d)) {
    parts[p.type] = p.value
  }
  return parts
}

export function formatKst(iso: string | null): string {
  const d = kstDate(iso)
  return d === null ? '—' : KST_FULL.format(d)
}

/** 시안 큐 행 표기 — "13:42". 전체 시각은 title 속성으로 보완한다. */
export function formatKstTime(iso: string | null): string {
  const d = kstDate(iso)
  if (d === null) return '—'
  const p = kstParts(d)
  return `${p.hour}:${p.minute}`
}

/** 시안 이력 행·메타 표기 — "08-04 13:42". */
export function formatKstShort(iso: string | null): string {
  const d = kstDate(iso)
  if (d === null) return '—'
  const p = kstParts(d)
  return `${p.month}-${p.day} ${p.hour}:${p.minute}`
}

/** EXT 신고 사유 칩과 1:1(HP-224). */
export const REASON_LABELS: Record<ReportReason, string> = {
  ABUSE: '욕설·혐오', SPOILER: '스포일러', SPAM: '도배·광고', OTHER: '기타',
}

/** 필터 칩 라벨(시안 툴바 — 열림/처리됨/기각). */
export const STATUS_LABELS: Record<ReportStatus, string> = {
  OPEN: '열림', RESOLVED: '처리됨', REJECTED: '기각',
}

/** 큐 행 상태 표기 — "처리됨"을 무슨 조치였는지로 구분한다(2026-08-05 E2E 피드백). */
export function rowStatusLabel(
  status: ReportStatus, resolvedAction: ResolutionAction | null,
): string {
  if (status === 'OPEN') return '● OPEN'
  if (status === 'REJECTED') return '— 기각'
  if (resolvedAction === 'BLIND') return '✓ 가림'
  if (resolvedAction === 'SUSPEND') return '✓ 정지'
  return '✓ 처리'
}

export const DURATION_LABELS: Record<SuspendDuration, string> = {
  H24: '24시간', H72: '72시간', D7: '7일', PERMANENT: '무기한',
}

export const ACTION_LABELS: Record<AdminActionType, string> = {
  BLIND: '가림', UNBLIND: '가림 해제', SCORE_FIX: '점수 정정',
  // 이력 안에서는 대상이 이미 그 사용자라 "계정"은 군더더기다(HP-268 라벨 통일)
  SUSPEND: '정지', UNSUSPEND: '정지 해제',
  RESOLVE_REPORT: '신고 종결', REOPEN_REPORT: '신고 재오픈',
}

/** 종결 결과를 앞자리에 쓰는 이름 — 라벨은 `<결과> · 신고 종결` 한 규칙으로 읽힌다. */
const OUTCOME_LABELS: Record<ResolveOutcome, string> = {
  BLIND: '가림', SUSPEND: '정지', NONE: '조치 없음', REJECTED: '기각',
}

/**
 * 조치 이력 한 줄의 조치 이름(HP-268). "신고 종결"만으로는 <b>가림인지 정지인지 기각인지</b>
 * 알 수 없어, 이력을 읽는 사람이 신고를 하나씩 열어 봐야 했다 — 결과를 라벨에 붙인다.
 *
 * <p><b>순서는 늘 `<조치> · 신고 종결`</b>이다. 한때 정지만 "계정 정지 · 신고 종결", 가림은
 * "신고 종결 · 가림"으로 앞뒤가 뒤바뀌어 같은 종류의 일이 다르게 읽혔다. 기각도 예외 없이
 * 붙인다 — 기각 역시 신고를 닫는 네 결과 중 하나이고, 이 라벨의 목적이 <b>세로로 훑히는
 * 통일감</b>이라 한 줄만 짧으면 그 자리에서 눈이 걸린다.
 *
 * <p>결과가 없는 종결(결과 칸이 생기기 전 기록)은 그냥 "신고 종결"이다. 모르는 것을 그럴듯하게
 * 지어내는 대신 모른다고 두는 편이, 이력을 근거로 판단하는 사람에게 안전하다.
 */
export function actionLabel(action: AdminActionType, outcome: ResolveOutcome | null): string {
  if (action !== 'RESOLVE_REPORT' || outcome === null) {
    return ACTION_LABELS[action]
  }
  return `${OUTCOME_LABELS[outcome]} · 신고 종결`
}

/**
 * 사용자 상태 칩 문구(시안 — "SUSPENDED · ~08-07 13:45"). 만료 배치가 없는 lazy 설계라
 * DB status는 만료 후에도 SUSPENDED로 남는다 — 화면이 만료를 계산해 정직하게 표기한다.
 */
export function suspensionChip(
  status: UserStatus, suspendedUntil: string | null, now: Date = new Date(),
): string {
  if (status !== 'SUSPENDED') return status
  if (!suspendedUntil) return 'SUSPENDED · 무기한'
  if (new Date(suspendedUntil).getTime() <= now.getTime()) {
    return 'SUSPENDED · 만료됨(자동 해제 대기)'
  }
  return `SUSPENDED · ~${formatKstShort(suspendedUntil)}`
}

/**
 * 지금 실제로 정지가 걸려 있는가 — BE {@code User.isSuspensionActive}와 같은 규칙.
 *
 * <p>정지는 만료 배치가 없는 lazy 설계라 <b>기간이 지나 자동으로 풀려도 DB status는 SUSPENDED로
 * 남고 감사 로그에도 아무 행이 생기지 않는다.</b> 그래서 "해제 행이 있으면 뺀다"는 규칙으로는
 * 만료를 영영 못 잡는다 — 정지가 지금 유효한지는 이 계산으로 판정해야 한다(HP-268).
 */
export function isSuspensionActive(
  status: UserStatus, suspendedUntil: string | null, now: Date = new Date(),
): boolean {
  if (status !== 'SUSPENDED') return false
  return suspendedUntil === null || new Date(suspendedUntil).getTime() > now.getTime()
}

/**
 * 큐 행 경과 뱃지의 톤(HP-296) — 24시간·48시간이 경계다.
 *
 * <p><b>빨강을 쓰지 않는다.</b> 콘솔에서 빨강은 파괴적 조치(정지) 전용이고, 오래 기다린 신고는
 * 급할 뿐 파괴적이지 않다. 톤 이름만 두고 색은 스타일시트가 정한다.
 */
export type ElapsedTone = 'fresh' | 'warm' | 'hot'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/**
 * 접수 이후 경과 — 큐 행의 시각(HH:mm)만으로는 3일 묵은 건과 방금 건이 같아 보인다(HP-296).
 *
 * <p>1시간 미만을 분으로 쪼개지 않는 이유: 큐 판단의 단위가 "지금 급한가"라서 분은 쓰이지 않고,
 * 자리만 차지해 정작 봐야 할 이틀·사흘짜리가 묻힌다.
 *
 * <p>미래 시각은 0으로 눕힌다 — 서버·클라 시계가 어긋나면 음수가 나오는데, "-1시간"은
 * 화면이 거짓말하는 것이고 그 상태에서도 급하지 않다는 사실은 맞다.
 *
 * <p><b>읽을 수 없는 시각은 모른다고 적는다</b>(—). NaN은 모든 비교가 false라 그냥 두면 조용히
 * "방금"으로 떨어지는데, 그건 모르는 것을 <b>급하지 않다고 단언</b>하는 것이라 하필 데이터가
 * 깨진 그 행이 큐에서 가장 안전해 보이게 된다. 톤은 fresh로 둔다 — 모른다는 사실이 급하다는
 * 근거는 아니므로, 없는 급함을 만들어 내지 않는다.
 */
export function elapsedSince(
  iso: string, now: Date = new Date(),
): { label: string; tone: ElapsedTone } {
  const elapsed = now.getTime() - new Date(iso).getTime()
  if (!Number.isFinite(elapsed)) return { label: '—', tone: 'fresh' }
  const ms = Math.max(0, elapsed)
  const tone: ElapsedTone = ms >= 2 * DAY_MS ? 'hot' : ms >= DAY_MS ? 'warm' : 'fresh'
  if (ms >= DAY_MS) return { label: `${Math.floor(ms / DAY_MS)}일`, tone }
  if (ms >= HOUR_MS) return { label: `${Math.floor(ms / HOUR_MS)}시간`, tone }
  return { label: '방금', tone }
}

/**
 * 신고자 신뢰도 한 줄(HP-270) — "이 사람의 신고 중 몇 %가 기각됐나".
 *
 * <p><b>분모는 판정분이지 보낸 전체가 아니다.</b> 아직 아무도 안 본 OPEN을 분모에 넣으면,
 * 막 20건을 쏟아부어 큐에 쌓인 <b>바로 그 순간</b> 기각률이 가장 낮게 나온다 — 지표가 가장
 * 필요한 때 가장 무해해 보이는 셈이라, 이 티켓이 막으려던 "인상에 기댄 정지"를 오히려 부추긴다.
 *
 * <p>같은 이유로 판정 0건은 <b>0%가 아니라 "판정 전"</b>이다. 0%는 "이 사람 신고는 다 타당했다"는
 * 뜻이 되는데 실제로는 "아직 아무도 안 봤다"이고, 둘은 정반대다.
 *
 * <p>분모를 문구에 함께 적는 이유: 같은 "기각 3건"이 판정 3건 중이면 100%, 30건 중이면 10%라
 * 뜻이 정반대인데, 비율만 보이면 읽는 사람이 그걸 알 수 없다.
 */
export function reporterTrustLine(sent: ReportsSent): string {
  if (sent.total === 0) return '보낸 신고 없음'
  if (sent.judged === 0) return `보낸 신고 ${sent.total}건 · 판정 전`
  const rate = Math.round((sent.rejected / sent.judged) * 100)
  return `보낸 신고 ${sent.total}건 · 기각 ${sent.rejected}건`
    + ` (판정 ${sent.judged}건 중 ${rate}%)`
}
