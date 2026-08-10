import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { listReports, type ReportFilters } from '../api/admin'
import type { ReportItem } from '../api/types'
import FilterBar from '../components/FilterBar'
import ReportDetailPanel from '../components/ReportDetailPanel'
import ReportTable from '../components/ReportTable'
import { isTypingTarget, nextOpenId } from '../queueKeys'

/**
 * 신고 큐(정본 ①) — 테이블 + 상세 <b>모달</b>. 행 선택 시 상세·조치가 가운데 팝업으로 열리고,
 * 바깥(백드롭) 클릭·Esc·✕로 목록에 돌아온다(2026-08-05 김지호 E2E 피드백 — 우측 고정 패널을
 * 정지 다이얼로그와 같은 팝업 방식으로 교체). 초기 필터는 열림(OPEN)만.
 */
export default function ReportQueuePage() {
  const [filters, setFilters] = useState<ReportFilters>({ status: 'OPEN', reason: '' })
  const [items, setItems] = useState<ReportItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadSeq = useRef(0)
  /** 조치 뒤 재조회에서 되돌릴 스크롤 위치. null = 되돌리지 않음(필터 변경·최초 로드). */
  const restoreScroll = useRef<number | null>(null)
  /** 지금까지 펼친 페이지 수("더 불러오기" 횟수 + 1) — 조치 뒤 같은 만큼 다시 읽는다. */
  const pagesLoaded = useRef(1)

  const load = useCallback(async (target: ReportFilters, cursor: string | null) => {
    // 경합 가드(리뷰 M1): 필터 변경과 "더 불러오기"가 겹치면 뒤늦은 응답이 새 목록을
    // 오염시키고 커서를 되덮는다 — 최신 요청의 응답만 커밋한다.
    const seq = ++loadSeq.current
    setLoading(true)
    setError(null)
    try {
      const page = await listReports(target, cursor)
      if (seq !== loadSeq.current) return
      // 커서 없음 = 첫 페이지(리셋), 있음 = 이어붙임
      setItems((prev) => (cursor ? [...prev, ...page.items] : page.items))
      setNextCursor(page.nextCursor)
      pagesLoaded.current = cursor ? pagesLoaded.current + 1 : 1
    } catch (e) {
      if (seq === loadSeq.current) {
        setError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void load(filters, null)
  }, [filters, load])

  /**
   * 조치 뒤 목록 재조회 — 보던 위치를 지킨다(HP-268 이월 1번).
   *
   * <p>큐는 위에서부터 순서대로 처리하는 동선이라, 한 건 조치할 때마다 맨 위로 튀면 매번 보던
   * 자리까지 다시 스크롤해 내려와야 한다. 큐가 길수록 손해가 커진다. 재조회 자체는 유지한다 —
   * 조치 결과(상태·처리 종별)는 서버가 정본이고, 화면에서 낙관적으로 고쳐 쓰면 실패했을 때
   * 화면과 서버가 갈린다.
   *
   * <p><b>펼친 페이지 수만큼 다시 읽는다.</b> 첫 페이지만 읽으면 "더 불러오기"로 펼친 아래쪽이
   * 통째로 사라져, 스크롤 위치를 지켜도 <i>그 자리에 아무것도 없다</i>. 조치는 목록 아래쪽에서
   * 일어나는 일이 많아(위에서부터 처리하니 남는 건 아래다) 이 경우가 오히려 흔하다.
   * 커서 페이징이라 페이지는 순차로 이어 읽고, 다 모은 뒤 한 번에 커밋한다(중간 깜빡임 방지).
   */
  const reloadKeepingPlace = useCallback(async () => {
    // 맨 위(0)면 되돌릴 것이 없다 — 불필요한 scrollTo를 만들지 않는다.
    restoreScroll.current = window.scrollY > 0 ? window.scrollY : null
    const seq = ++loadSeq.current
    setLoading(true)
    setError(null)
    try {
      const merged: ReportItem[] = []
      let cursor: string | null = null
      let next: string | null = null
      for (let page = 0; page < pagesLoaded.current; page++) {
        const res = await listReports(filters, cursor)
        if (seq !== loadSeq.current) return
        merged.push(...res.items)
        next = res.nextCursor
        if (next === null) break // 마지막 페이지 — 더 읽을 것이 없다
        cursor = next
      }
      setItems(merged)
      setNextCursor(next)
    } catch (e) {
      if (seq === loadSeq.current) {
        setError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false)
      }
    }
  }, [filters])

  // 목록이 다시 그려진 직후(페인트 전)에 되돌려야 깜빡임이 안 보인다.
  useLayoutEffect(() => {
    const y = restoreScroll.current
    if (y === null) return
    restoreScroll.current = null
    window.scrollTo(0, y)
  }, [items])

  const selected = items.find((item) => item.id === selectedId) ?? null

  /**
   * 조치가 끝났다(HP-295). 신고를 <b>닫은</b> 조치였다면 모달을 유지한 채 다음 열림 건으로 넘긴다.
   *
   * <p><b>함정 ①</b>: 다음 대상을 <i>재조회 전에</i> 잡는다. 필터가 OPEN인 한 재조회는 방금 처리한
   * 건을 목록에서 빼므로, 읽고 난 뒤에는 "다음이 무엇이었는지"를 알 방법이 없다. 뒤에 열림 건이
   * 없으면 null이 되어 모달이 닫힌다 — 이어갈 곳이 없다는 뜻이다.
   */
  const handleActionDone = (closed: boolean) => {
    if (closed && selectedId !== null) {
      setSelectedId(nextOpenId(items, selectedId))
    }
    void reloadKeepingPlace()
  }

  /** 모달을 연 채 앞뒤 건으로(J/K). 목록 밖으로는 나가지 않는다. */
  const navigate = (delta: number) => {
    const at = items.findIndex((item) => item.id === selectedId)
    const to = at + delta
    if (at < 0 || to < 0 || to >= items.length) return
    setSelectedId(items[to].id)
  }

  /**
   * 모달이 닫혀 있을 때 J/K는 <b>행 포커스</b>를 옮긴다(HP-295) — 여는 것은 기존 Enter가 한다.
   *
   * <p>선택 상태를 따로 두지 않고 DOM 포커스를 쓰는 이유: 행은 이미 {@code tabIndex}로 포커스를
   * 받고 Enter로 열린다. 같은 일을 하는 상태를 하나 더 만들면 둘이 어긋날 자리가 생긴다.
   * 모달이 열려 있는 동안은 상세 패널이 J/K를 가져간다(그쪽은 건 자체를 옮긴다).
   */
  useEffect(() => {
    if (selectedId !== null) return
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      const key = e.key.toLowerCase()
      if (key !== 'j' && key !== 'k') return
      e.preventDefault()
      const rows = Array.from(
          document.querySelectorAll<HTMLElement>('.report-table tbody tr'))
      if (rows.length === 0) return
      const at = rows.indexOf(document.activeElement as HTMLElement)
      // 아직 아무 행에도 포커스가 없으면 첫 행부터 — 어디서 시작할지 묻지 않는다
      const to = at < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, at + (key === 'j' ? 1 : -1)))
      rows[to].focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedId])

  // 모달 열림 동안 Esc = 닫기. 정지 다이얼로그가 위에 떠 있으면 그쪽 핸들러가
  // stopPropagation으로 먼저 소비해 다이얼로그만 닫힌다(겹 순서 보존).
  useEffect(() => {
    if (selectedId === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedId])

  return (
    <section className="queue-layout" aria-label="신고 큐">
      <FilterBar
          filters={filters}
          onChange={(next) => {
            setSelectedId(null) // 필터가 바뀌면 목록이 리셋되므로 선택도 함께 비운다
            setFilters(next)
          }} />
      {error && <div className="error-box queue-error" role="alert">{error}</div>}
      <ReportTable items={items} selectedId={selectedId} onSelect={setSelectedId} />
      {nextCursor && (
        <button
            type="button" className="btn load-more" disabled={loading}
            onClick={() => void load(filters, nextCursor)}>
          더 불러오기
        </button>
      )}
      {loading && items.length === 0 && <div className="page-status">불러오는 중…</div>}

      {/* 단축키는 발견되지 않으면 없는 것과 같다(HP-180과 같은 이유) — 큐 아래 한 줄로 둔다. */}
      <div className="kbar" aria-label="단축키 안내">
        <span><kbd>J</kbd><kbd>K</kbd> 이동</span>
        <span><kbd>↵</kbd> 열기</span>
        <span><kbd>B</kbd> 가림</span>
        <span><kbd>N</kbd> 조치 없이 종결</span>
        <span><kbd>X</kbd> 기각</span>
        <span><kbd>S</kbd> 정지 창만 열기</span>
        <span><kbd>Esc</kbd> 닫기</span>
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelectedId(null)}>
          <div
              className="modal-card" role="dialog" aria-modal="true" aria-label="신고 상세"
              onClick={(e) => e.stopPropagation()}>
            <button
                type="button" className="modal-close" aria-label="닫기"
                onClick={() => setSelectedId(null)}>
              ✕
            </button>
            <ReportDetailPanel
                report={selected} onActionDone={handleActionDone} onNavigate={navigate} />
          </div>
        </div>
      )}
    </section>
  )
}
