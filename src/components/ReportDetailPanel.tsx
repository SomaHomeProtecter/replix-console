import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  blindMessage, resolveReport, suspendUser, unblindMessage,
} from '../api/admin'
import type { ReportItem, SuspendDuration } from '../api/types'
import { DURATION_LABELS, REASON_LABELS, USER_STATUS_LABELS, formatKst } from '../format'
import SuspendDialog from './SuspendDialog'
import StatusBadge from './StatusBadge'

/** Redis 실황 표기 — null은 이미 사라진 메시지(TTL·삭제)라는 뜻이다(계약). */
function liveStatusLabel(currentStatus: string | null): string {
  if (currentStatus === null) return '사라짐(만료·삭제)'
  if (currentStatus === 'blinded') return '가림'
  if (currentStatus === 'visible') return '표시 중'
  return currentStatus
}

/**
 * 우측 상세 패널(정본) — 스냅샷 원문 + 메타 + 대상 사용자 카드 + 조치 버튼 + 처리 메모.
 * 조치는 신고 종결까지 한 번에 간다: 가림 = blind→RESOLVED, 정지 = suspend→RESOLVED,
 * 기각 = REJECTED. 재종결은 BE가 멱등(마지막 판정 갱신)이라 종결분에도 버튼을 남겨 둔다.
 * [가림 해제]는 정본 3버튼 밖의 보조 기능 — 오조치 복구 동선이 없으면 콘솔이 반쪽이다.
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
    await resolveReport(report.id, 'RESOLVED', noteOrNull())
  })

  const reject = () => run(async () => {
    await resolveReport(report.id, 'REJECTED', noteOrNull())
  })

  const unblind = () => run(async () => {
    await unblindMessage(report.episodeId, report.msgId)
  })

  const suspend = (duration: SuspendDuration, reason: string) => {
    const target = report.targetUser
    if (!target) return
    setDialogOpen(false)
    run(async () => {
      await suspendUser(target.id, duration, reason)
      // 처리 메모가 비어 있으면 감사 추적이 이어지도록 정지 내용을 자동 메모로 남긴다
      await resolveReport(report.id, 'RESOLVED',
          noteOrNull() ?? `계정 정지(${DURATION_LABELS[duration]}) — ${reason}`)
    })
  }

  return (
    <div className="detail-panel">
      <div className="action-row">
        <StatusBadge status={report.status} />
        {report.sameMessageReportCount > 1 && (
          <span className="multi-report">같은 메시지 신고 {report.sameMessageReportCount}건</span>
        )}
      </div>

      <blockquote className="snapshot">
        {report.snapshotMessage}
        <footer>— {report.snapshotDisplayName} · 신고 시점 스냅샷 원문</footer>
      </blockquote>

      <dl className="meta-grid">
        <dt>신고 시각</dt><dd>{formatKst(report.createdAt)}</dd>
        <dt>신고 사유</dt><dd>{REASON_LABELS[report.reason]}{report.detail ? ` — ${report.detail}` : ''}</dd>
        <dt>신고자</dt><dd>{report.reporter?.displayName ?? '(알 수 없음)'}</dd>
        <dt>회차 · 메시지</dt><dd>회차 {report.episodeId} · {report.msgId}</dd>
        <dt>현재 상태(실황)</dt><dd>{liveStatusLabel(report.currentStatus)}</dd>
        <dt>스포일러 점수</dt><dd>{report.spoilerScore ?? '—'}</dd>
      </dl>

      {report.targetUser ? (
        <div className="target-card">
          <span>
            대상: <strong>{report.targetUser.displayName ?? `#${report.targetUser.id}`}</strong>
            {' '}({USER_STATUS_LABELS[report.targetUser.status]})
          </span>
          <Link className="btn-link" to={`/users/${report.targetUser.id}`}>사용자 상세 →</Link>
        </div>
      ) : (
        <div className="target-card"><span className="hint">대상 사용자 정보 없음</span></div>
      )}

      {report.handledBy && (
        <div className="resolution-box">
          처리: {report.handledBy.displayName} · {formatKst(report.handledAt)}
          {report.resolutionNote ? ` · ${report.resolutionNote}` : ''}
        </div>
      )}

      {error && <div className="error-box" role="alert">{error}</div>}

      <label className="panel-note">
        처리 메모
        <textarea
            aria-label="처리 메모" rows={2} maxLength={500} value={note}
            placeholder="선택 — 종결 사유로 감사 로그에 남습니다"
            onChange={(e) => setNote(e.target.value)} />
      </label>

      <div className="action-row">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={blind}>가림</button>
        <button
            type="button" className="btn btn-danger"
            // WITHDRAWN은 BE가 409로 거부한다 — 다이얼로그까지 갔다 실패하지 않게 미리 막는다(리뷰 m6)
            disabled={busy || !report.targetUser || report.targetUser.status === 'WITHDRAWN'}
            title={report.targetUser?.status === 'WITHDRAWN' ? '탈퇴한 계정에는 조치할 수 없습니다' : undefined}
            onClick={() => setDialogOpen(true)}>
          계정 정지…
        </button>
        <button type="button" className="btn" disabled={busy} onClick={reject}>기각</button>
        {report.currentStatus === 'blinded' && (
          <button type="button" className="btn-link" disabled={busy} onClick={unblind}>가림 해제</button>
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
