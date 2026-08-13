import { useCallback, useEffect, useMemo, useState } from 'react'
import { decideModerationReview, listModerationReviews } from '../api/admin'
import type {
  ModerationReviewCounts, ModerationReviewDecision, ModerationReviewPage as ReviewPage,
  ModerationReviewStage,
} from '../api/types'
import { formatKstShort } from '../format'

type StageFilter = 'ALL' | ModerationReviewStage

const EMPTY_COUNTS: ModerationReviewCounts = {
  profanity: { falsePositive: 0, truePositive: 0 },
  hate: { falsePositive: 0, truePositive: 0 },
  evictedPending: 0,
}

const stageLabel = (stage: ModerationReviewStage) =>
  stage === 'PROFANITY' ? '1차 비속어' : '2차 혐오'

/** 아티팩트 F10의 집계 칩→단계 필터→한 줄 판정 동선을 실제 계약에 맞춰 구현한다. */
export default function ModerationReviewPage() {
  const [data, setData] = useState<ReviewPage | null>(null)
  const [stage, setStage] = useState<StageFilter>('ALL')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await listModerationReviews())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const rows = useMemo(() => (data?.items ?? []).filter((row) =>
    stage === 'ALL' || row.stage === stage), [data, stage])
  const counts = data?.counts ?? EMPTY_COUNTS
  const falsePositive = counts.profanity.falsePositive + counts.hate.falsePositive
  const truePositive = counts.profanity.truePositive + counts.hate.truePositive

  const decide = async (sampleId: string, decision: ModerationReviewDecision) => {
    setBusy(sampleId)
    setError(null)
    try {
      const result = await decideModerationReview(sampleId, decision)
      setData((current) => current && ({
        ...current,
        items: current.items.filter((row) => row.sampleId !== sampleId),
        pendingTotal: Math.max(0, current.pendingTotal - 1),
        counts: result.counts,
      }))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
      // 중복 판정·만료라면 큐 현실이 이미 바뀌었다. 실패한 행을 붙잡지 말고 다시 읽는다.
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (data === null && error === null) return <div className="page-status">불러오는 중…</div>

  return (
    <section className="moderation-review" aria-label="클린봇 오탐 검토">
      <div className="review-head">
        <div>
          <h1>클린봇 오탐 검토</h1>
          <p>판정은 사전·임계값 조정의 입력으로만 쌓이며 메시지를 되살리지 않습니다.</p>
        </div>
        <button type="button" className="btn refresh" disabled={busy !== null} onClick={() => void load()}>
          새로고침
        </button>
      </div>

      {error && <div className="error-box" role="alert">{error}</div>}

      <div className="review-panel">
        <div className="review-toolbar">
          <ul className="review-counts" aria-label="검토 집계">
            <li className="pending"><b>{data?.pendingTotal ?? 0}</b> 미판정</li>
            <li><b>{falsePositive}</b> 오탐</li>
            <li><b>{truePositive}</b> 정탐</li>
          </ul>
          <div className="review-stage-filters" aria-label="차단 단계 필터">
            {([['ALL', '전체'], ['PROFANITY', '1차 비속어'], ['HATE', '2차 혐오']] as const)
              .map(([value, label]) => (
                <button
                    key={value} type="button" className="chip-f"
                    aria-pressed={stage === value} onClick={() => setStage(value)}>
                  {label}
                </button>
              ))}
          </div>
          <span className="filter-note">최근 14일 표본 · 오래된 순</span>
        </div>

        {counts.evictedPending > 0 && (
          <div className="notice-box" role="status">
            상한 또는 TTL로 판정 전에 제외된 표본 {counts.evictedPending}건
          </div>
        )}

        {rows.length === 0
          ? <div className="empty-hint">{stage === 'ALL' ? '검토할 표본이 없습니다' : '이 단계의 표본이 없습니다'}</div>
          : (
            <ul className="review-list">
              {rows.map((row) => (
                <li key={row.sampleId}>
                  <time dateTime={row.createdAt}>{formatKstShort(row.createdAt)}</time>
                  <span className={`review-stage ${row.stage.toLowerCase()}`}>
                    {stageLabel(row.stage)}
                    {row.score !== null && <b>{row.score.toFixed(2)}</b>}
                  </span>
                  <span className="review-message" title={row.message}>{row.message}</span>
                  <span className="review-category">{row.category ?? '규칙 일치 · 점수 없음'}</span>
                  <div className="review-actions">
                    <button
                        type="button" className="btn review-false"
                        disabled={busy !== null}
                        onClick={() => void decide(row.sampleId, 'FALSE_POSITIVE')}>
                      오탐
                    </button>
                    <button
                        type="button" className="btn review-true"
                        disabled={busy !== null}
                        onClick={() => void decide(row.sampleId, 'TRUE_POSITIVE')}>
                      정탐
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </div>
    </section>
  )
}
