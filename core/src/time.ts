/* 한국 시각 표기와 날짜 입력 칸 변환 — 콘솔 전체(공용 틀·조치·시딩)가 같이 쓴다(HP-522). 종전에는 조치 format.ts에
   있었고 시딩은 같은 일을 하는 함수를 따로 들고 있었다. */

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

/**
 * 날짜·시각 입력 칸(datetime-local)의 값 → 저장값(ISO). <b>칸의 값은 한국 시각이다</b>(HP-516).
 *
 * <p>변환을 화면마다 따로 두던 동안 한쪽이 어긋났다 — 변경 세트는 저장할 때는 칸의 값을 UTC로 바꾸면서
 * 칸에 넣을 때는 UTC 문자열의 앞 16자를 그대로 써서, 10:00으로 저장한 만료 시각이 01:00으로 보였고
 * 분만 고쳐 저장하면 9시간 이른 시각이 저장됐다. 그래서 두 방향을 이 한 쌍으로 모은다.
 *
 * <p>브라우저 시간대가 아니라 한국 시각으로 읽는다 — 이 콘솔은 모든 시각을 한국 시각으로 보여 주므로
 * (위 formatKst*), 입력만 브라우저 시간대를 따르면 해외에서 연 운영자에게 보이는 값과 저장되는 값이 갈린다.
 */
export function kstInputToIso(value: string): string | null {
  if (!value) return null
  const d = new Date(`${value}:00+09:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** 저장값(ISO) → 날짜·시각 입력 칸의 값("2026-10-12T10:00", 한국 시각). {@link kstInputToIso}의 반대. */
export function isoToKstInput(iso: string | null): string {
  const d = kstDate(iso)
  if (d === null) return ''
  const p = kstParts(d)
  // 엔진에 따라 hour12:false가 자정을 "24"로 줄 수 있다 — 칸은 00~23만 받는다.
  const hour = p.hour === '24' ? '00' : p.hour
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}`
}
