import { useCallback, useEffect, useRef, useState } from 'react'
import { decideModerationReview, listModerationReviews } from '../api/admin'
import type {
  ModerationReviewDecision, ModerationReviewPage as ReviewPage, ModerationReviewStage,
  ModerationReviewView,
} from '../api/types'
import { formatKstShort } from '../format'

type StageFilter = 'ALL' | ModerationReviewStage
type LoadMode = 'replace' | 'refresh' | 'append'

const stageLabel = (stage: ModerationReviewStage) =>
  stage === 'PROFANITY' ? '1차 비속어' : '2차 혐오'

const decisionLabel = (decision: ModerationReviewDecision | null) =>
  decision === 'FALSE_POSITIVE' ? '오탐' : '정탐'

/** 집계에서 최근 상세로 내려가며, 조회 실패를 정상 0건과 분리한다(HP-327/328). */
export default function ModerationReviewPage() {
  const [data, setData] = useState<ReviewPage | null>(null)
  const [view, setView] = useState<ModerationReviewView>('PENDING')
  const [stage, setStage] = useState<StageFilter>('ALL')
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const requestSequence = useRef(0)

  const load = useCallback(async (
    targetView: ModerationReviewView, targetStage: StageFilter,
    offset: number, mode: LoadMode,
  ) => {
    const sequence = ++requestSequence.current
    setLoadError(null)
    setLoading(true)
    if (mode === 'replace') {
      setData(null)
      setStale(false)
    }
    try {
      const next = await listModerationReviews({
        view: targetView, stage: targetStage === 'ALL' ? '' : targetStage, offset,
      })
      if (sequence !== requestSequence.current) return
      setData((current) => mode === 'append' && current
        ? { ...next, items: [...current.items, ...next.items] }
        : next)
      setStale(false)
    } catch (failure) {
      if (sequence !== requestSequence.current) return
      setLoadError(failure instanceof Error ? failure.message : String(failure))
      setStale(mode !== 'replace')
    } finally {
      if (sequence === requestSequence.current) setLoading(false)
    }
  }, [])

  useEffect(() => { void load('PENDING', 'ALL', 0, 'replace') }, [load])

  const selectView = (next: ModerationReviewView) => {
    if (next === view) return
    setView(next)
    setActionError(null)
    void load(next, stage, 0, 'replace')
  }

  const selectStage = (next: StageFilter) => {
    if (next === stage) return
    setStage(next)
    setActionError(null)
    void load(view, next, 0, 'replace')
  }

  const decide = async (sampleId: string, decision: ModerationReviewDecision) => {
    setBusy(sampleId)
    setActionError(null)
    try {
      const result = await decideModerationReview(sampleId, decision)
      setData((current) => current && ({
        ...current,
        items: current.items.filter((row) => row.sampleId !== sampleId),
        pendingTotal: Math.max(0, current.pendingTotal - 1),
        viewTotal: Math.max(0, current.viewTotal - 1),
        counts: result.counts,
      }))
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : String(failure))
      // 중복 판정·만료라면 큐 현실이 이미 바뀌었으므로 마지막 정상 목록을 서버와 다시 맞춘다.
      await load(view, stage, 0, 'refresh')
    } finally {
      setBusy(null)
    }
  }

  const refresh = () => void load(view, stage, 0, data === null ? 'replace' : 'refresh')
  const falsePositive = data
    ? data.counts.profanity.falsePositive + data.counts.hate.falsePositive : 0
  const truePositive = data
    ? data.counts.profanity.truePositive + data.counts.hate.truePositive : 0

  return (
    <section className="moderation-review" aria-label="클린봇 오탐 검토">
      <div className="review-head">
        <div>
          <h1>클린봇 오탐 검토</h1>
          <p>판정은 사전·임계값 조정의 입력으로만 쌓이며 메시지를 되살리지 않습니다.</p>
        </div>
        <button type="button" className="btn refresh" disabled={busy !== null || loading} onClick={refresh}>
          새로고침
        </button>
      </div>

      {data === null ? (
        loadError
          ? <div className="error-box review-load-error" role="alert">
              <b>오탐 검토 정보를 불러오지 못했습니다.</b>
              <span>{loadError}</span>
              <button type="button" className="btn" onClick={refresh}>다시 시도</button>
            </div>
          : <div className="page-status">불러오는 중…</div>
      ) : (
        <>
          {actionError && <div className="error-box" role="alert">{actionError}</div>}
          {loadError && stale && (
            <div className="notice-box stale-box" role="status">
              <b>목록 갱신에 실패해 화면이 최신이 아닐 수 있습니다.</b> {loadError}
            </div>
          )}

          <div className="review-panel" aria-busy={loading}>
            <div className="review-toolbar">
              <ul className="review-counts" aria-label="검토 집계">
                {([
                  ['PENDING', data.pendingTotal, '미판정'],
                  ['FALSE_POSITIVE', falsePositive, '오탐'],
                  ['TRUE_POSITIVE', truePositive, '정탐'],
                ] as const).map(([value, count, label]) => (
                  <li key={value} className={value === 'PENDING' ? 'pending' : undefined}>
                    <button type="button" aria-pressed={view === value} onClick={() => selectView(value)}>
                      <b>{count}</b> {label}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="review-stage-filters" aria-label="차단 단계 필터">
                {([['ALL', '전체'], ['PROFANITY', '1차 비속어'], ['HATE', '2차 혐오']] as const)
                  .map(([value, label]) => (
                    <button
                        key={value} type="button" className="chip-f"
                        aria-pressed={stage === value} onClick={() => selectStage(value)}>
                      {label}
                    </button>
                  ))}
              </div>
              <span className="filter-note">
                {view === 'PENDING' ? '최근 14일 표본 · 오래된 순' : '누적 집계 · 최근 14일 상세 · 최근 판정 순'}
              </span>
            </div>

            {data.counts.evictedPending > 0 && (
              <div className="notice-box" role="status">
                상한 또는 TTL로 판정 전에 제외된 표본 {data.counts.evictedPending}건
              </div>
            )}

            {data.items.length === 0
              ? <div className="empty-hint">
                  {view === 'PENDING' ? '검토할 표본이 없습니다' : `최근 14일 보존된 ${decisionLabel(view)} 상세가 없습니다`}
                </div>
              : (
                <ul className="review-list">
                  {data.items.map((row) => (
                    <li key={row.sampleId}>
                      <time dateTime={row.decidedAt ?? row.createdAt}>
                        {formatKstShort(row.decidedAt ?? row.createdAt)}
                      </time>
                      <span className={`review-stage ${row.stage.toLowerCase()}`}>
                        {stageLabel(row.stage)}
                        {row.score !== null && <b>{row.score.toFixed(2)}</b>}
                      </span>
                      <span className="review-message" title={row.message}>{row.message}</span>
                      <span className="review-category">{row.category ?? '규칙 일치 · 점수 없음'}</span>
                      {view === 'PENDING' ? (
                        <div className="review-actions">
                          <button
                              type="button" className="btn review-false"
                              disabled={busy !== null || loading}
                              onClick={() => void decide(row.sampleId, 'FALSE_POSITIVE')}>
                            오탐
                          </button>
                          <button
                              type="button" className="btn review-true"
                              disabled={busy !== null || loading}
                              onClick={() => void decide(row.sampleId, 'TRUE_POSITIVE')}>
                            정탐
                          </button>
                        </div>
                      ) : (
                        <span className={`review-outcome ${row.decision?.toLowerCase()}`}>
                          <b>{decisionLabel(row.decision)}</b>
                          <span>{row.reviewerName ?? (row.reviewerId ? `운영자 #${row.reviewerId}` : '처리자 정보 없음')}</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

            {data.hasMore && (
              <div className="review-more">
                <button
                    type="button" className="btn" disabled={loading}
                    onClick={() => void load(view, stage, data.items.length, 'append')}>
                  더 보기 ({data.items.length}/{data.viewTotal})
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
