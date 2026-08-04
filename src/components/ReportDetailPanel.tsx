import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  blindMessage, reopenReport, resolveReport, suspendUser, unblindMessage,
} from '../api/admin'
import type { ReportItem, SuspendDuration } from '../api/types'
import { DURATION_LABELS, REASON_LABELS, formatKstShort } from '../format'
import SuspendDialog from './SuspendDialog'

/** Redis 실황 표기 — null은 이미 사라진 메시지(TTL·삭제)라는 뜻이다(계약). */
function liveStatusLabel(currentStatus: string | null): string {
  if (currentStatus === null) return '사라짐(만료·삭제)'
  if (currentStatus === 'blinded') return '가림'
  if (currentStatus === 'visible') return '표시 중'
  return currentStatus
}

/**
 * 우측 상세 패널(시안 cm-side) — 스냅샷 원문(호박색 인용) + 메타 한 줄 + 대상 카드 +
 * 조치 2열 그리드([가림][계정 정지…] / [기각 (조치 없음)]) + 처리 메모 + 집계·처리 이력.
 * 조치는 신고 종결까지 한 번에 간다: 가림 = blind→RESOLVED, 정지 = suspend→RESOLVED,
 * 기각 = REJECTED. 재종결은 BE가 멱등(마지막 판정 갱신)이라 종결분에도 버튼을 남겨 둔다.
 * [가림 해제]는 시안 3버튼 밖의 보조 기능 — 오조치 복구 동선이 없으면 콘솔이 반쪽이다.
 */
export default function ReportDetailPanel({ report, onActionDone }: {
  report: ReportItem
  onActionDone: () => void
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    // 다른 행을 선택하면 입력·오류는 이전 신고의 것이므로 비운다
    setNote('')
    setError(null)
    setDialogOpen(false)
  }, [report.id])

  const noteOrNull = () => {
    const trimmed = note.trim()
    return trimmed ? trimmed : null
  }

  const run = (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    work()
        .then(() => onActionDone())
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : String(e))
          // 부분 실패(예: 가림 성공·종결 실패)면 화면이 실상과 어긋난 채 남는다 —
          // 실패해도 다시 읽어 실제 상태를 반영한다(리뷰 m3).
          onActionDone()
        })
        .finally(() => setBusy(false))
  }

  const blind = () => run(async () => {
    await blindMessage(report.episodeId, report.msgId)
    await resolveReport(report.id, 'RESOLVED', noteOrNull(), 'BLIND')
  })

  const reject = () => run(async () => {
    await resolveReport(report.id, 'REJECTED', noteOrNull(), null)
  })

  const unblind = () => run(async () => {
    await unblindMessage(report.episodeId, report.msgId)
    // 가림을 되돌렸다는 건 판정 번복 — 신고도 다시 열어 큐에서 재심사되게 한다
    // (2026-08-05 E2E 피드백: 해제했는데 '처리'로 남으면 신고가 조용히 묻힌다)
    await reopenReport(report.id)
  })

  const suspend = (duration: SuspendDuration, reason: string) => {
    const target = report.targetUser
    if (!target) return
    setDialogOpen(false)
    run(async () => {
      await suspendUser(target.id, duration, reason)
      // 처리 메모가 비어 있으면 감사 추적이 이어지도록 정지 내용을 자동 메모로 남긴다
      await resolveReport(report.id, 'RESOLVED',
          noteOrNull() ?? `계정 정지(${DURATION_LABELS[duration]}) — ${reason}`, 'SUSPEND')
    })
  }

  const targetInitial = (report.targetUser?.displayName ?? '?').slice(0, 1)

  return (
    <div className="detail-panel">
      <h5 className="side-h">신고 #{report.id} · 스냅샷 원문</h5>
      <blockquote className="snapshot">{report.snapshotMessage}</blockquote>
      <div className="meta-line" title={`msgId ${report.msgId}`}>
        신고 {formatKstShort(report.createdAt)} · 신고자 {report.reporter?.displayName ?? '(알 수 없음)'}
        {' '}· 회차 ep.{report.episodeId} · 현재 상태 {liveStatusLabel(report.currentStatus)}
        {' '}· 스포일러 점수 {report.spoilerScore ?? '—'}
      </div>
      {report.detail && (
        <div className="meta-line">신고 사유({REASON_LABELS[report.reason]}) — {report.detail}</div>
      )}

      {report.targetUser ? (
        <div className="target-card">
          <span className="ua">{targetInitial}</span>
          <span className="un">{report.targetUser.displayName ?? `#${report.targetUser.id}`}</span>
          <Link className="btn-link ul" to={`/users/${report.targetUser.id}`}>사용자 상세 →</Link>
        </div>
      ) : (
        <div className="target-card"><span className="hint">대상 사용자 정보 없음</span></div>
      )}

      <h5 className="side-h">조치</h5>
      {error && <div className="error-box" role="alert">{error}</div>}
      <div className="acts">
        <button type="button" className="btn btn-blind" disabled={busy} onClick={blind}>가림</button>
        <button
            type="button" className="btn btn-susp"
            // WITHDRAWN은 BE가 409로 거부한다 — 다이얼로그까지 갔다 실패하지 않게 미리 막는다(리뷰 m6)
            disabled={busy || !report.targetUser || report.targetUser.status === 'WITHDRAWN'}
            title={report.targetUser?.status === 'WITHDRAWN' ? '탈퇴한 계정에는 조치할 수 없습니다' : undefined}
            onClick={() => setDialogOpen(true)}>
          계정 정지…
        </button>
        <button type="button" className="btn span2" disabled={busy} onClick={reject}>기각 (조치 없음)</button>
      </div>

      <label className="note-in">
        <textarea
            aria-label="처리 메모" rows={2} maxLength={500} value={note}
            placeholder="처리 메모 (감사 로그에 남습니다)"
            onChange={(e) => setNote(e.target.value)} />
      </label>

      <div className="hist">
        <span>같은 메시지 신고 <b>{report.sameMessageReportCount}건</b></span>
        {report.currentStatus === 'blinded' && (
          <> · <button type="button" className="btn-link" disabled={busy} onClick={unblind}>가림 해제</button></>
        )}
        {report.handledBy && (
          <><br />{report.status === 'REJECTED' ? '기각'
            : report.resolvedAction === 'BLIND' ? '가림 처리'
            : report.resolvedAction === 'SUSPEND' ? '정지 처리' : '처리'}
          : <b>{report.handledBy.displayName}</b> · {formatKstShort(report.handledAt)}
            {report.resolutionNote ? ` · ${report.resolutionNote}` : ''}</>
        )}
      </div>

      {dialogOpen && report.targetUser && (
        <SuspendDialog
            targetName={report.targetUser.displayName ?? `#${report.targetUser.id}`}
            busy={busy}
            onConfirm={suspend}
            onCancel={() => setDialogOpen(false)} />
      )}
    </div>
  )
}
