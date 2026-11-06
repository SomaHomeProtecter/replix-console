import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  applyManualPoster, approvePosterReview, listPosterReviews, rejectPosterReview,
} from '../api/admin'
import { moderateDenied } from '../permissions'
import type { PosterCandidate, PosterDecisionResult, PosterReview } from '../api/types'
import { ApiHttpError } from '@core/api/client'
import { formatKst, formatKstShort } from '@core/time'

type LoadMode = 'replace' | 'refresh'

/** 서버가 "이미 정해졌다·검토 대상이 아니다"로 답하는 코드 — 행을 고쳐 다시 보낼 일이 아니라 목록이 낡은 것이다. */
const STALE_CODES = new Set(['REVIEW_NOT_PENDING', 'REVIEW_NOT_FOUND'])

const contentTypeLabel = (type: string) =>
  type === 'SERIES' ? '시리즈' : type === 'MOVIE' ? '영화' : type

const errorMessage = (failure: unknown) => failure instanceof Error ? failure.message : String(failure)

/**
 * TMDB 포스터 검토(HP-826) — 제목 매칭이 포스터를 찾지 못한 작품에 AI가 고른 후보를 운영자가 승인·거절하거나
 * TMDB 주소를 직접 넣는다. 판정 하나가 그 작품의 포스터를 정하므로 한 번에 한 건만 보낸다.
 */
export default function PosterReviewPage() {
  const [data, setData] = useState<PosterReview[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  /** 실패는 그 작품 카드 안에 보인다 — 직접 입력 주소가 틀렸을 때 고칠 칸 바로 옆에 있어야 읽힌다. */
  const [actionError, setActionError] = useState<{ contentId: number; message: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** 거절을 한 번 누른 작품 — 거절은 콘솔에서 되돌릴 수 없어 확인을 한 번 더 받는다. */
  const [confirmingReject, setConfirmingReject] = useState<number | null>(null)
  const [manualRefs, setManualRefs] = useState<Record<number, string>>({})
  const denied = moderateDenied() // 조회 전용 계정은 조치 버튼이 꺼진다(HP-529)
  const requestSequence = useRef(0)

  const load = useCallback(async (mode: LoadMode) => {
    const sequence = ++requestSequence.current
    setLoadError(null)
    setLoading(true)
    if (mode === 'replace') {
      setData(null)
      setStale(false)
    }
    try {
      const next = await listPosterReviews()
      if (sequence !== requestSequence.current) return
      setData(next)
      setStale(false)
      // 열어 둔 거절 확인은 사라진 목록을 보고 연 것이라 새 목록이 깔리면 닫는다.
      setConfirmingReject(null)
    } catch (failure) {
      if (sequence !== requestSequence.current) return
      setLoadError(errorMessage(failure))
      setStale(mode !== 'replace')
    } finally {
      if (sequence === requestSequence.current) setLoading(false)
    }
  }, [])

  useEffect(() => { void load('replace') }, [load])

  const decide = async (
    review: PosterReview, done: string, send: () => Promise<PosterDecisionResult>,
  ) => {
    setBusy(review.contentId)
    setActionError(null)
    setNotice(null)
    try {
      await send()
      setData((current) => current && current.filter((row) => row.contentId !== review.contentId))
      setManualRefs((current) => {
        const next = { ...current }
        delete next[review.contentId]
        return next
      })
      setNotice(`${review.title} — ${done}`)
    } catch (failure) {
      if (failure instanceof ApiHttpError && STALE_CODES.has(failure.code)) {
        // 그사이 다른 운영자가 정했거나 대상에서 빠졌다. 낡은 카드에 다시 누르지 않게 목록을 서버와 맞춘다.
        setNotice(`${review.title} — 그사이 포스터가 이미 정해져 목록을 새로 불러왔습니다.`)
        await load('refresh')
      } else {
        setActionError({ contentId: review.contentId, message: errorMessage(failure) })
      }
    } finally {
      setBusy(null)
      setConfirmingReject(null)
    }
  }

  const approve = (review: PosterReview, candidate: PosterCandidate) =>
    void decide(review, '승인했습니다', () => approvePosterReview(review, candidate))

  const applyManual = (event: FormEvent, review: PosterReview) => {
    event.preventDefault()
    const ref = (manualRefs[review.contentId] ?? '').trim()
    if (!ref) return
    void decide(review, '직접 입력한 TMDB 작품으로 정했습니다', () => applyManualPoster(review, ref))
  }

  const reject = (review: PosterReview) =>
    void decide(review, '포스터 없이 두었습니다', () => rejectPosterReview(review))

  const refresh = () => void load(data === null ? 'replace' : 'refresh')
  const locked = busy !== null || loading || denied !== null

  return (
    <section className="poster-review" aria-label="포스터 검토">
      <div className="review-head">
        <div>
          <h1>포스터 검토</h1>
          <p>제목으로 TMDB 포스터를 찾지 못한 작품입니다. AI 후보 중 맞는 작품을 고르거나 TMDB 주소를 직접 넣습니다.</p>
        </div>
        <button type="button" className="btn refresh" disabled={busy !== null || loading} onClick={refresh}>
          새로고침
        </button>
      </div>
      {denied && <p className="readonly-note">{denied}</p>}

      {data === null ? (
        loadError
          ? <div className="error-box review-load-error" role="alert">
              <b>포스터 검토 목록을 불러오지 못했습니다.</b>
              <span>{loadError}</span>
              <button type="button" className="btn" onClick={refresh}>다시 시도</button>
            </div>
          : <div className="page-status">불러오는 중…</div>
      ) : (
        <>
          {notice && <div className="notice-box" role="status">{notice}</div>}
          {loadError && stale && (
            <div className="notice-box stale-box" role="status">
              <b>목록 갱신에 실패해 화면이 최신이 아닐 수 있습니다.</b> {loadError}
            </div>
          )}

          {data.length === 0
            ? <div className="empty-hint">포스터를 기다리는 작품이 없습니다</div>
            : (
              <ul className="poster-works" aria-busy={loading}>
                {data.map((review) => {
                  const confirming = confirmingReject === review.contentId
                  const manualRef = manualRefs[review.contentId] ?? ''
                  return (
                    <li key={review.contentId} className="poster-work" aria-label={review.title}>
                      <div className="poster-work-head">
                        <h2>{review.title}</h2>
                        <span className="poster-work-meta">
                          {review.platformName} · {contentTypeLabel(review.contentType)}
                        </span>
                        <time dateTime={review.searchedAt} title={formatKst(review.searchedAt)}>
                          AI 검색 {formatKstShort(review.searchedAt)}
                        </time>
                      </div>

                      {review.candidates.length === 0
                        ? <p className="poster-none">AI가 맞는 후보를 찾지 못했습니다. TMDB 주소를 직접 넣거나 거절하세요.</p>
                        : (
                          <ul className="poster-candidates" aria-label={`${review.title} 후보`}>
                            {review.candidates.map((candidate) => (
                              <li key={`${candidate.tmdbType}/${candidate.tmdbId}`} className="poster-candidate">
                                {candidate.posterUrl
                                  ? <img
                                      src={candidate.posterUrl} alt={`${candidate.name} 포스터`}
                                      loading="lazy" width={92} height={138} />
                                  : <span className="poster-missing">포스터 없음</span>}
                                <div className="poster-candidate-body">
                                  <div className="poster-candidate-title">
                                    <b>{candidate.name}</b>
                                    {candidate.year !== null && <span>{candidate.year}</span>}
                                    <span
                                        className={`poster-relation ${candidate.relation.toLowerCase()}`}
                                        title={candidate.relation === 'CLOSEST'
                                          ? '같은 작품이 TMDB에 없어 가장 가까운 작품(본편 등)입니다' : undefined}>
                                      {candidate.relation === 'SAME' ? '같은 작품' : '가까운 작품'}
                                    </span>
                                  </div>
                                  {candidate.originalName && candidate.originalName !== candidate.name && (
                                    <span className="poster-original">{candidate.originalName}</span>
                                  )}
                                  {candidate.reason && <p className="poster-reason">{candidate.reason}</p>}
                                  <div className="poster-candidate-actions">
                                    <a href={candidate.tmdbUrl} target="_blank" rel="noopener noreferrer">
                                      TMDB에서 보기
                                    </a>
                                    <button
                                        type="button" className="btn review-true"
                                        disabled={locked} title={denied ?? undefined}
                                        onClick={() => approve(review, candidate)}>
                                      승인
                                    </button>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}

                      {actionError?.contentId === review.contentId && (
                        <div className="error-box" role="alert">{actionError.message}</div>
                      )}

                      <div className="poster-work-actions">
                        <form className="poster-manual" onSubmit={(event) => applyManual(event, review)}>
                          <input
                              type="text" value={manualRef} aria-label={`${review.title} TMDB 주소`}
                              placeholder="TMDB 주소 (https://www.themoviedb.org/tv/…)"
                              disabled={locked} title={denied ?? undefined}
                              onChange={(event) => {
                                const value = event.target.value
                                setManualRefs((current) => ({ ...current, [review.contentId]: value }))
                              }} />
                          <button type="submit" className="btn" disabled={locked || !manualRef.trim()}>
                            적용
                          </button>
                        </form>
                        {confirming ? (
                          <div className="poster-reject-confirm">
                            <span>포스터 없이 둡니다. 콘솔에서 되돌릴 수 없습니다.</span>
                            <button
                                type="button" className="btn btn-blind" disabled={locked}
                                onClick={() => reject(review)}>
                              거절 확인
                            </button>
                            <button
                                type="button" className="btn" disabled={busy !== null}
                                onClick={() => setConfirmingReject(null)}>
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                              type="button" className="btn" disabled={locked} title={denied ?? undefined}
                              onClick={() => setConfirmingReject(review.contentId)}>
                            거절
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
        </>
      )}
    </section>
  )
}
