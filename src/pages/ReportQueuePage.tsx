import { useCallback, useEffect, useState } from 'react'
import { listReports, type ReportFilters } from '../api/admin'
import type { ReportItem } from '../api/types'
import FilterBar from '../components/FilterBar'
import ReportTable from '../components/ReportTable'

/**
 * 신고 큐(정본 ①) — 테이블 + 우측 상세 패널. 행 선택 시 우측에서 스냅샷 전문·맥락·조치가
 * 한 화면에서 끝난다(고정 2컬럼 마스터-디테일 안은 기각). 초기 필터는 접수(OPEN)만.
 */
export default function ReportQueuePage() {
  const [filters, setFilters] = useState<ReportFilters>({ status: 'OPEN', reason: '' })
  const [items, setItems] = useState<ReportItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (target: ReportFilters, cursor: string | null) => {
    setLoading(true)
    setError(null)
    try {
      const page = await listReports(target, cursor)
      // 커서 없음 = 첫 페이지(리셋), 있음 = 이어붙임
      setItems((prev) => (cursor ? [...prev, ...page.items] : page.items))
      setNextCursor(page.nextCursor)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(filters, null)
  }, [filters, load])

  const selected = items.find((item) => item.id === selectedId) ?? null

  return (
    <section className="queue-layout" aria-label="신고 큐">
      <div className="queue-main">
        <FilterBar
            filters={filters}
            onChange={(next) => {
              setSelectedId(null) // 필터가 바뀌면 목록이 리셋되므로 선택도 함께 비운다
              setFilters(next)
            }} />
        {error && <div className="error-box" role="alert">{error}</div>}
        <ReportTable items={items} selectedId={selectedId} onSelect={setSelectedId} />
        {nextCursor && (
          <button
              type="button" className="btn load-more" disabled={loading}
              onClick={() => void load(filters, nextCursor)}>
            더 불러오기
          </button>
        )}
        {loading && items.length === 0 && <div className="page-status">불러오는 중…</div>}
      </div>
      <aside className="queue-side">
        <div className="detail-panel">
          {selected
            ? <div>선택된 신고 #{selected.id}</div>
            : <div className="detail-empty">행을 선택하면 상세와 조치가 여기에 열립니다</div>}
        </div>
      </aside>
    </section>
  )
}
