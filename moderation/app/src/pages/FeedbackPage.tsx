import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteFeedback, listFeedback } from '../api/admin'
import type {
  CoveredElement, FeedbackCategory, FeedbackFilters, FeedbackItem, FeedbackSurface,
  FeedbackTrigger, UninstallReason, WantedService,
} from '../api/types'
import { formatKstShort } from '../format'

/** 확장·웹의 제출 화면과 1:1(세트 A 문구). 값이 아니라 사람이 읽는 말로 보여 준다. */
const SURFACE_LABELS: Record<FeedbackSurface, string> = { EXT: '확장', WEB: '웹' }
const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  ANNOY: '불편해요', BUG: '버그예요', IDEA: '이런 게 있으면', PRAISE: '잘 쓰고 있어요',
}
const TRIGGER_LABELS: Record<FeedbackTrigger, string> = {
  PROMPT: '프롬프트', MANUAL: '직접', UNINSTALL: '삭제 설문',
}
/** 삭제 설문(HP-458)의 선택지 — 서버 enum과 1:1이고 문구는 BE enum 주석과 같다. */
const REASON_LABELS: Record<UninstallReason, string> = {
  FEW_CHATS: '볼 만한 채팅이 적어요',
  BLOCKS_SCREEN: '화면을 가려요',
  SLOW_OR_BUGGY: '느리거나 오류가 나요',
  SPOILER_WORRY: '스포일러가 걱정돼요',
  BAD_VIBE: '채팅 분위기가 별로예요',
  HARD_TO_USE: '쓰는 법이 어려워요',
  NO_MY_OTT: '쓰는 OTT가 없어요',
  PRIVACY_WORRY: '개인정보가 걱정돼요',
  JUST_TRYING: '잠깐 써 봤어요',
}
const COVERED_LABELS: Record<CoveredElement, string> = {
  CHAT_PANEL: '채팅창', DANMAKU: '탄막', FULLSCREEN_CHAT: '전체화면 채팅 상자',
  REACTION: '반응 이모지', HEATMAP: '재생바 봉우리',
}
const SERVICE_LABELS: Record<WantedService, string> = {
  TVING: '티빙', WAVVE: '웨이브', COUPANG_PLAY: '쿠팡플레이', WATCHA: '왓챠', YOUTUBE: '유튜브',
  OTHER: '그 밖에',
}

const SCORES = [1, 2, 3, 4, 5]

/** 목록 행의 본문 발췌 길이. 넘으면 말줄임표를 붙이고 전문은 상세에서만 보여 준다. */
const PREVIEW_LENGTH = 60

/**
 * 삭제 확인이 살아 있는 시간.
 *
 * <p>되돌릴 수 없는 버튼이라 확인을 받되, 확인 상태가 <b>영원히</b> 남으면 한참 뒤에 우연히
 * 같은 자리를 누른 손이 그대로 삭제로 이어진다. 3초는 "방금 누른 사람의 두 번째 클릭"만
 * 받아들이는 폭이다.
 */
const CONFIRM_WINDOW_MS = 3_000

const EMPTY_FILTERS: FeedbackFilters = { surface: '', category: '', score: '' }

const NONE = '—'

/**
 * 코드를 사람이 읽는 말로 바꾼다. 콘솔이 모르는 코드는 <b>코드 그대로</b> 보인다 — 관리 API는 값을 더하는
 * 쪽으로 바뀌고 콘솔은 서버보다 늦게 나갈 수 있는데, 빈칸으로 그리면 운영자는 그런 값이 있는 줄도 모른다.
 *
 * <p>표에 <b>직접</b> 적힌 코드만 라벨로 읽는다. 라벨 표는 평범한 객체라 `constructor`·`__proto__` 같은 이름은
 * 상속된 함수·객체를 돌려주고, 그것을 그리려던 React가 던지면 에러 경계가 없는 콘솔은 화면 전체를 잃는다.
 */
function labelOf<K extends string>(labels: Record<K, string>, code: K): string {
  return Object.prototype.hasOwnProperty.call(labels, code) ? labels[code] : code
}

/**
 * 목록 한 줄 발췌 — 줄바꿈이 든 글도 한 줄 칸에서 읽히게 접는다. 전문은 상세가 원문 그대로 보여 준다.
 *
 * <p>삭제 설문(HP-458)은 <b>고른 사유가 먼저</b>다. 별점·카테고리·본문 없이 사유만 오는 게 보통이라, 본문만
 * 발췌하면 "—"만 남아 왜 지웠는지 목록에서 읽을 수 없다. 남긴 말이 있으면 사유 뒤에 잇는다.
 */
function previewOf(item: FeedbackItem): string {
  const reasons = (item.reasons ?? []).map((reason) => labelOf(REASON_LABELS, reason)).join(' · ')
  const body = (item.body ?? '').replace(/\s+/g, ' ').trim()
  const text = [reasons, body].filter((part) => part !== '').join(' — ')
  if (text === '') return NONE
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text
}

/**
 * 카테고리 칸. 삭제 설문은 카테고리를 고르지 않으므로 그 자리에 "삭제 설문"이라고 적어, 일반 의견 사이에서
 * 한눈에 갈라 보이게 한다.
 */
function categoryOf(item: FeedbackItem): string {
  if (item.category !== null) return labelOf(CATEGORY_LABELS, item.category)
  return item.trigger === 'UNINSTALL' ? TRIGGER_LABELS.UNINSTALL : NONE
}

/** 상세의 사유 한 줄. 후속 선택이 달린 사유(화면을 가려요·쓰는 OTT가 없어요)는 그 답을 뒤에 붙인다. */
function reasonLine(item: FeedbackItem, reason: UninstallReason): string {
  const label = labelOf(REASON_LABELS, reason)
  if (reason === 'BLOCKS_SCREEN' && item.coveredBy?.length) {
    const covered = item.coveredBy.map((code) => labelOf(COVERED_LABELS, code)).join(', ')
    return `${label} — 가린 것: ${covered}`
  }
  if (reason === 'NO_MY_OTT' && item.wantedServices?.length) {
    const services = item.wantedServices.map((code) => labelOf(SERVICE_LABELS, code)).join(', ')
    return `${label} — 원하는 서비스: ${services}`
  }
  return label
}

/**
 * 사용자 피드백 목록(HP-426) — 읽기 + 삭제만 있는 화면이다.
 *
 * <p><b>조치·상태 UI를 두지 않는다</b>: 피드백은 신고와 달리 판정 대상이 아니라 팀이 읽고
 * 제품을 고치는 입력이다. 여기에 "처리됨" 같은 상태를 붙이면 운영자가 큐처럼 비워야 할
 * 대상으로 읽어, 읽히지 않은 의견이 "처리 완료"로 덮인다. 남길 가치가 없다고 판단한 행만
 * 지운다.
 */
export default function FeedbackPage() {
  const [filters, setFilters] = useState<FeedbackFilters>(EMPTY_FILTERS)
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  /** 삭제 확인을 받고 있는 행. null = 아무 행도 확인 중이 아님. */
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  /**
   * 삭제 요청이 나가 있는 행들. 한 칸(id 하나)으로 두면 먼저 끝난 삭제가 다른 행의 "삭제 중"까지 지워, 아직
   * 지우는 중인 행의 버튼이 다시 켜진다 — 같은 행에 DELETE가 두 번 나가 이미 성공한 삭제가 404로 보인다.
   */
  const [deletingIds, setDeletingIds] = useState<ReadonlySet<number>>(() => new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadSeq = useRef(0)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelConfirm = useCallback(() => {
    if (confirmTimer.current !== null) {
      clearTimeout(confirmTimer.current)
      confirmTimer.current = null
    }
    setConfirmingId(null)
  }, [])

  // 화면을 떠난 뒤 깨어난 타이머가 사라진 컴포넌트의 상태를 건드리지 않게 반드시 거둔다.
  useEffect(() => () => {
    if (confirmTimer.current !== null) clearTimeout(confirmTimer.current)
  }, [])

  const load = useCallback(async (target: FeedbackFilters, cursor: string | null) => {
    // 필터 변경과 "더 보기"가 겹치면 늦은 응답이 새 목록을 덮고 커서를 되돌린다 — 최신 요청만 커밋.
    const seq = ++loadSeq.current
    setLoading(true)
    setError(null)
    try {
      const page = await listFeedback(target, cursor)
      if (seq !== loadSeq.current) return
      setItems((previous) => (cursor ? [...previous, ...page.items] : page.items))
      setNextCursor(page.nextCursor)
    } catch (failure) {
      if (seq === loadSeq.current) {
        setError(failure instanceof Error ? failure.message : String(failure))
      }
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(filters, null)
  }, [filters, load])

  const changeFilters = (next: FeedbackFilters) => {
    // 목록이 리셋되므로 펼침·확인도 함께 내린다 — 사라질 행의 확인 상태가 남으면 다음 목록의
    // 같은 자리에서 한 번의 클릭으로 삭제가 나간다.
    setExpandedId(null)
    cancelConfirm()
    setFilters(next)
  }

  const toggleRow = (id: number) => {
    cancelConfirm()
    setExpandedId((current) => (current === id ? null : id))
  }

  const armDelete = (id: number) => {
    if (confirmTimer.current !== null) clearTimeout(confirmTimer.current)
    setConfirmingId(id)
    confirmTimer.current = setTimeout(() => {
      confirmTimer.current = null
      setConfirmingId(null)
    }, CONFIRM_WINDOW_MS)
  }

  const removeRow = async (id: number) => {
    cancelConfirm()
    setDeletingIds((current) => new Set(current).add(id))
    setError(null)
    try {
      await deleteFeedback(id)
      // 서버가 지웠으니 목록에서 바로 뺀다 — 재조회를 돌리면 커서로 펼쳐 둔 아래쪽이 통째로
      // 사라지고, 지운 한 건 때문에 읽던 자리를 잃는다.
      setItems((current) => current.filter((item) => item.id !== id))
      setExpandedId((current) => (current === id ? null : current))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      // 자기 행만 내린다 — 다른 행의 삭제는 아직 진행 중일 수 있다.
      setDeletingIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }

  return (
    <section className="feedback-page" aria-label="피드백">
      <div className="board-head">
        <h1>피드백</h1>
        <span className="filter-note">최신순 · 커서 페이징</span>
      </div>

      <div className="action-filters" aria-label="피드백 필터">
        <label>
          <span>표면</span>
          <select
              aria-label="표면" value={filters.surface}
              onChange={(event) => changeFilters({
                ...filters, surface: event.target.value as FeedbackSurface | '',
              })}>
            <option value="">전체</option>
            {(Object.keys(SURFACE_LABELS) as FeedbackSurface[]).map((surface) => (
              <option key={surface} value={surface}>{SURFACE_LABELS[surface]}</option>
            ))}
          </select>
        </label>
        <label>
          <span>카테고리</span>
          <select
              aria-label="카테고리" value={filters.category}
              onChange={(event) => changeFilters({
                ...filters, category: event.target.value as FeedbackCategory | '',
              })}>
            <option value="">전체</option>
            {(Object.keys(CATEGORY_LABELS) as FeedbackCategory[]).map((category) => (
              <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>
            ))}
          </select>
        </label>
        <label>
          <span>점수</span>
          {/* select 값은 문자열이라 그대로 흘리면 BE가 "2"를 받는다 — 숫자로 되돌려 보낸다. */}
          <select
              aria-label="점수" value={filters.score}
              onChange={(event) => changeFilters({
                ...filters, score: event.target.value === '' ? '' : Number(event.target.value),
              })}>
            <option value="">전체</option>
            {SCORES.map((score) => (
              <option key={score} value={score}>{`★${score}`}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="error-box" role="alert">{error}</div>}
      {loading && items.length === 0 && <div className="page-status">불러오는 중…</div>}
      {/* 커서가 남아 있으면 "없다"가 아니라 "이 페이지에 없다"이다 — 다음 장을 부르기 전에
          빈 화면 문구를 띄우면 아직 읽지 않은 결과를 없는 것처럼 보이게 한다. */}
      {!loading && !error && items.length === 0 && !nextCursor && (
        <div className="empty-hint">조건에 맞는 피드백이 없습니다</div>
      )}

      {items.length > 0 && (
        <div className="report-table-wrap">
          <table className="feedback-table">
            <thead>
              <tr>
                <th>시각</th><th>표면</th><th>점수</th><th>카테고리</th><th>본문</th><th>사용자</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const open = expandedId === item.id
                const confirming = confirmingId === item.id
                return [
                  <tr
                      key={item.id} className={`feedback-row${open ? ' open' : ''}`}
                      tabIndex={0} aria-expanded={open}
                      onClick={() => toggleRow(item.id)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        toggleRow(item.id)
                      }}>
                    <td className="time" title={item.createdAt}>
                      {formatKstShort(item.createdAt)}
                    </td>
                    <td className="surface">{labelOf(SURFACE_LABELS, item.surface)}</td>
                    <td className="score">{item.score === null ? NONE : `★${item.score}`}</td>
                    <td className="category">{categoryOf(item)}</td>
                    <td className="excerpt">{previewOf(item)}</td>
                    {/* 탈퇴·비로그인 제출은 user가 없다 — 빈 칸 대신 그 사실을 적는다. */}
                    <td className="who">{item.user?.displayName ?? '익명'}</td>
                  </tr>,
                  open && (
                    <tr key={`${item.id}-detail`} className="feedback-detail-row">
                      <td colSpan={6}>
                        <div className="feedback-detail">
                          {item.reasons?.length ? (
                            <div className="feedback-reasons">
                              <span
                                  id={`feedback-reasons-${item.id}`}
                                  className="feedback-reasons-title">
                                삭제 사유
                              </span>
                              <ul aria-labelledby={`feedback-reasons-${item.id}`}>
                                {item.reasons.map((reason) => (
                                  <li key={reason}>{reasonLine(item, reason)}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {/* 본문은 사용자가 쓴 글이다 — React가 문자열로 넣어 HTML로 해석되지
                              않는다. dangerouslySetInnerHTML을 쓰면 그 보장이 깨진다. */}
                          <p className="feedback-body">{item.body ?? NONE}</p>
                          <dl className="feedback-meta">
                            <div><dt>버전</dt><dd>{item.appVersion ?? NONE}</dd></div>
                            <div><dt>플랫폼</dt><dd>{item.platform ?? NONE}</dd></div>
                            <div><dt>작품</dt><dd>{item.contentId ?? NONE}</dd></div>
                            <div><dt>회차</dt><dd>{item.episodeId ?? NONE}</dd></div>
                            <div><dt>경로</dt><dd>{labelOf(TRIGGER_LABELS, item.trigger)}</dd></div>
                            {item.trigger === 'UNINSTALL' && (
                              <div>
                                <dt>설치 후</dt>
                                <dd>{item.installDays == null ? NONE : `${item.installDays}일`}</dd>
                              </div>
                            )}
                          </dl>
                          <div className="feedback-actions">
                            {/* 같은 버튼을 두 번 누르게 해 확인을 받는다(window.confirm 금지) —
                                브라우저 대화상자는 콘솔 밖 장치라 화면 잠금·문구를 통제할 수 없다. */}
                            <button
                                type="button"
                                className={`btn${confirming ? ' btn-danger-solid' : ''}`}
                                disabled={deletingIds.has(item.id)}
                                onClick={(event) => {
                                  event.stopPropagation() // 행 토글로 번지면 상세가 닫힌다
                                  if (confirming) void removeRow(item.id)
                                  else armDelete(item.id)
                                }}>
                              {confirming ? '정말 삭제' : '삭제'}
                            </button>
                            {confirming && (
                              <span className="feedback-warn">
                                지운 피드백은 되돌릴 수 없습니다 · 3초 뒤 취소됩니다
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ),
                ]
              })}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor && (
        <button
            type="button" className="btn load-more" disabled={loading}
            onClick={() => void load(filters, nextCursor)}>
          더 보기
        </button>
      )}
    </section>
  )
}
