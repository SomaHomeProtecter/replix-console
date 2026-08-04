import { useCallback, useEffect, useRef, useState } from 'react'
import { listReports, type ReportFilters } from '../api/admin'
import type { ReportItem } from '../api/types'
import FilterBar from '../components/FilterBar'
import ReportDetailPanel from '../components/ReportDetailPanel'
import ReportTable from '../components/ReportTable'

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

  const selected = items.find((item) => item.id === selectedId) ?? null

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
            <ReportDetailPanel report={selected} onActionDone={() => void load(filters, null)} />
          </div>
        </div>
      )}
    </section>
  )
}
