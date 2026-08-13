import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { listReports, type ReportFilters } from '../api/admin'
import type { ReportItem } from '../api/types'
import FilterBar from '../components/FilterBar'
import ReportDetailPanel from '../components/ReportDetailPanel'
import ReportTable from '../components/ReportTable'
import { isTypingTarget, shortcutKey, type QueueCommand } from '../queueKeys'

const FOCUSABLE = 'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), '
  + '[href], select:not([disabled]), [tabindex]:not([tabindex="-1"])'

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
  /**
   * 상세 모달에서 쓰기가 도는 중 — 그동안 모달을 닫지 않는다(HP-298).
   *
   * <p>닫으면 패널이 언마운트돼 <b>결과를 알릴 곳이 사라진다</b>. 일괄 가림이 40건 중 3건
   * 실패했는데 그 사실이 조용히 없어지면 운영자는 전부 가려진 줄 알고 넘어간다. 백드롭 클릭은
   * 특히 잘못 눌리기 쉬워 "실수로 닫힘"이 흔하다.
   *
   * <p>갇히지 않는 근거는 <b>자동 상한이 아니라 취소 버튼</b>이다. 요청 하나는
   * {@code API_TIMEOUT_MS}에 끊기지만 일괄 가림은 여러 물결로 나뉘어 나가므로 전체는 그 배수가
   * 될 수 있다 — 그럴 때는 운영자가 일괄 가림 옆의 [취소]로 직접 끊는다.
   */
  const [writing, setWriting] = useState(false)
  /**
   * 상세 모달이 올린 조치 결과 문구(HP-298 일괄 가림의 일부 실패·취소).
   *
   * <p>모달 안에만 두면 <b>신고가 큐에서 빠지는 순간 함께 사라진다</b> — 다른 운영자가 그 신고를
   * 종결했거나 필터가 바뀌면 패널이 언마운트되고, "40건 중 3건 실패"가 아무 데도 남지 않는다.
   * 그 3건은 여전히 사용자에게 보이는데 화면 어디에도 그 사실이 없다. 그래서 <b>페이지가</b>
   * 들고 있는다. 다음 조치가 끝나면 그때 결과로 덮인다.
   */
  const [notice, setNotice] = useState<string | null>(null)
  const [command, setCommand] = useState<QueueCommand | null>(null)
  const loadSeq = useRef(0)
  /** 조치 뒤 재조회에서 되돌릴 스크롤 위치. null = 되돌리지 않음(필터 변경·최초 로드). */
  const restoreScroll = useRef<number | null>(null)
  /** 지금까지 펼친 페이지 수("더 불러오기" 횟수 + 1) — 조치 뒤 같은 만큼 다시 읽는다. */
  const pagesLoaded = useRef(1)
  /** 조치 성공 뒤 포커스를 줄 다음 OPEN 신고. 모달을 자동으로 열지는 않는다. */
  const pendingFocusId = useRef<number | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

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

  const openReport = useCallback((id: number) => {
    openerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement : null
    setSelectedId(id)
  }, [])

  const closeReport = useCallback(() => {
    setSelectedId(null)
    setCommand(null)
    const opener = openerRef.current
    requestAnimationFrame(() => {
      if (opener && document.contains(opener)) opener.focus()
    })
  }, [])

  // 상세를 열면 키보드 소유권을 모달로 옮긴다.
  useEffect(() => {
    if (selected === null) return
    modalRef.current?.focus()
  }, [selected?.id])

  // 조치 성공으로 OPEN 행이 빠진 뒤 다음 행에만 포커스를 둔다. 자동으로 열지 않는다.
  useLayoutEffect(() => {
    if (selectedId !== null || pendingFocusId.current === null) return
    const id = pendingFocusId.current
    const row = document.querySelector<HTMLElement>(`[data-report-id="${id}"]`)
    if (row) row.focus()
    pendingFocusId.current = null
  }, [items, selectedId])

  /**
   * 신고를 닫는 조치가 성공했다. 현재 OPEN 큐에서 바로 제거해 같은 건에 연타할 창을 닫고,
   * 그 다음 OPEN 행에 포커스를 둔 뒤 서버 정본을 재조회한다.
   */
  const handleReportClosed = useCallback((reportId: number) => {
    const at = items.findIndex((item) => item.id === reportId)
    const next = at < 0 ? null
      : items.slice(at + 1).find((item) => item.status === 'OPEN')?.id ?? null
    pendingFocusId.current = next
    setSelectedId(null)
    setCommand(null)
    if (filters.status === 'OPEN') {
      setItems((current) => current.filter((item) => item.id !== reportId))
    }
    void reloadKeepingPlace()
  }, [filters.status, items, reloadKeepingPlace])

  /** 모달 전체의 Tab 순환. 상세 뒤의 페이지로 포커스가 새지 않게 한다. */
  const trapModalTab = (e: React.KeyboardEvent) => {
    const box = modalRef.current
    if (!box) return
    const focusables = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (focusables.length === 0) return
    const active = document.activeElement
    const inside = box.contains(active) && active !== box
    if (e.shiftKey && (!inside || active === focusables[0])) {
      e.preventDefault()
      focusables[focusables.length - 1].focus()
    } else if (!e.shiftKey && (!inside || active === focusables[focusables.length - 1])) {
      e.preventDefault()
      focusables[0].focus()
    }
  }

  /** 모달이 닫힌 큐에서만 J/K로 행 포커스를 움직인다. */
  useEffect(() => {
    if (selectedId !== null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
      const key = shortcutKey(e.key)
      if (key !== 'j' && key !== 'k') return
      const rows = Array.from(document.querySelectorAll<HTMLElement>('.report-table tbody tr'))
      if (rows.length === 0) return
      e.preventDefault()
      const current = rows.indexOf(document.activeElement as HTMLElement)
      const target = current < 0 ? 0
        : Math.max(0, Math.min(rows.length - 1, current + (key === 'j' ? 1 : -1)))
      rows[target].focus()
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
            // 조치 결과 문구도 함께 내린다 — 다른 목록을 보는데 이전 목록에서 난 "3건 실패"가
            // 그대로 떠 있으면, 지금 보는 신고들에서 난 일로 읽힌다.
            setNotice(null)
            setFilters(next)
          }} />
      {error && <div className="error-box queue-error" role="alert">{error}</div>}
      {notice && <div className="notice-box queue-error" role="status">{notice}</div>}
      <ReportTable items={items} selectedId={selectedId} onSelect={openReport} />
      {nextCursor && (
        <button
            type="button" className="btn load-more" disabled={loading}
            onClick={() => void load(filters, nextCursor)}>
          더 불러오기
        </button>
      )}
      {loading && items.length === 0 && <div className="page-status">불러오는 중…</div>}

      <div className="kbar" aria-label="단축키 안내">
        <span><kbd>J</kbd><kbd>K</kbd> 행 이동</span>
        <span><kbd>↵</kbd> 상세 열기</span>
        <span><kbd>B</kbd> 가림</span>
        <span><kbd>N</kbd> 조치 없이 종결</span>
        <span><kbd>X</kbd> 기각</span>
        <span><kbd>S</kbd> 정지 확인</span>
        <span><kbd>Esc</kbd> 닫기</span>
      </div>

      {selected && (
        <div
            className="modal-backdrop"
            onClick={() => { if (!writing) closeReport() }}>
          <div
              ref={modalRef} className="modal-card" role="dialog" aria-modal="true"
              aria-label="신고 상세" tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                // 보조 다이얼로그는 모든 keydown 전파를 끊으므로 여기에는 상세 소유 키만 온다.
                if (e.key === 'Tab') {
                  trapModalTab(e)
                  return
                }
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  if (!writing) closeReport()
                  return
                }
                if (e.nativeEvent.isComposing || e.repeat || e.metaKey || e.ctrlKey || e.altKey
                    || isTypingTarget(e.target)) return
                const key = shortcutKey(e.key)
                if (key !== 'b' && key !== 'n' && key !== 'x' && key !== 's') return
                e.preventDefault()
                setCommand((current) => ({ key, sequence: (current?.sequence ?? 0) + 1 }))
              }}>
            <button
                type="button" className="modal-close" aria-label="닫기"
                disabled={writing}
                title={writing ? '조치를 처리하는 중입니다 — 끝나면 닫을 수 있습니다' : undefined}
                onClick={closeReport}>
              ✕
            </button>
            <ReportDetailPanel
                report={selected}
                onActionDone={(next) => {
                  setNotice(next ?? null)
                  void reloadKeepingPlace()
                }}
                onReportClosed={handleReportClosed}
                shortcutCommand={command}
                onBusyChange={setWriting} />
          </div>
        </div>
      )}
    </section>
  )
}
